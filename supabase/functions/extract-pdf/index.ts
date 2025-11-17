import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('PDF extraction request received');
    
    const { fileName, fileData } = await req.json();
    
    console.log(`Processing file: ${fileName}`);

    // Get Azure Document Intelligence credentials
    const docIntelEndpoint = Deno.env.get('AZURE_DOC_INTELLIGENCE_ENDPOINT');
    const docIntelKey = Deno.env.get('AZURE_DOC_INTELLIGENCE_KEY');
    
    if (!docIntelEndpoint || !docIntelKey) {
      throw new Error('Azure Document Intelligence credentials not configured');
    }

    // Extract base64 content
    const pdfBase64 = fileData.split(',')[1] || fileData;
    
    console.log('Sending PDF to Azure Document Intelligence...');

    // Call Azure Document Intelligence API - Layout model for text + tables
    const analyzeUrl = `${docIntelEndpoint}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`;
    
    const analyzeResponse = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': docIntelKey,
      },
      body: JSON.stringify({
        base64Source: pdfBase64
      })
    });

    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text();
      throw new Error(`Azure Document Intelligence error: ${analyzeResponse.status} - ${errorText}`);
    }

    // Get the operation location to poll for results
    const operationLocation = analyzeResponse.headers.get('Operation-Location');
    if (!operationLocation) {
      throw new Error('No operation location returned from Azure');
    }

    console.log('Analysis started, polling for results...');

    // Poll for results (Azure processes async)
    let result = null;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      const resultResponse = await fetch(operationLocation, {
        headers: {
          'Ocp-Apim-Subscription-Key': docIntelKey,
        }
      });

      if (!resultResponse.ok) {
        throw new Error(`Failed to get results: ${resultResponse.status}`);
      }

      const resultData = await resultResponse.json();
      
      if (resultData.status === 'succeeded') {
        result = resultData.analyzeResult;
        console.log('Analysis complete!');
        break;
      } else if (resultData.status === 'failed') {
        throw new Error('Azure analysis failed');
      }
      
      attempts++;
    }

    if (!result) {
      throw new Error('Analysis timed out');
    }

    // Extract text
    const pdfText = result.content || "";
    
    // Extract tables
    const tables = (result.tables || []).map((table: any, index: number) => {
      const columns: string[] = [];
      const rows: string[][] = [];
      
      // Get column headers from first row
      const headerCells = table.cells.filter((cell: any) => cell.rowIndex === 0);
      headerCells.forEach((cell: any) => {
        columns[cell.columnIndex] = cell.content;
      });
      
      // Get data rows
      const maxRow = Math.max(...table.cells.map((c: any) => c.rowIndex));
      for (let rowIdx = 1; rowIdx <= maxRow; rowIdx++) {
        const rowCells = table.cells.filter((cell: any) => cell.rowIndex === rowIdx);
        const rowData: string[] = [];
        rowCells.forEach((cell: any) => {
          rowData[cell.columnIndex] = cell.content;
        });
        rows.push(rowData);
      }
      
      return {
        title: `Table ${index + 1}`,
        columns: columns,
        rows: rows,
        rowCount: table.rowCount,
        columnCount: table.columnCount
      };
    });

    console.log(`Extracted ${pdfText.length} chars, ${tables.length} tables`);

    // Helper to parse numeric value from string like "$5,603,520,725"
    const parseNumberCell = (raw?: string): number | undefined => {
      if (!raw) return undefined;
      const cleaned = raw
        .toString()
        .replace(/\$/g, "")
        .replace(/,/g, "")
        .trim();
      if (!cleaned) return undefined;
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : undefined;
    };

    // Semantic equity parser that works generically across 10-K PDFs
    const extractEquitySummary = (tables: any[], flags?: { isWellKnownSeasonedIssuer?: boolean; isLargeAcceleratedFiler?: boolean }) => {
      const summary: any = {
        isWellKnownSeasonedIssuer: flags?.isWellKnownSeasonedIssuer,
        isLargeAcceleratedFiler: flags?.isLargeAcceleratedFiler,
        classA: {},
        classB: {},
      };

      for (const table of tables) {
        let section: "none" | "marketValue" | "sharesOutstanding" = "none";

        for (const row of table.rows) {
          const c0 = (row[0] || "").toLowerCase();
          const c1 = row[1];
          const c2 = row[2];

          // Detect section headers using generic 10-K wording
          if (c0.includes("aggregate market value")) {
            section = "marketValue";
            continue;
          }
          if (
            c0.includes("number of") &&
            c0.includes("shares") &&
            c0.includes("outstanding")
          ) {
            section = "sharesOutstanding";
            continue;
          }

          // MARKET VALUE SECTION
          if (section === "marketValue") {
            if (c0.startsWith("class a")) {
              summary.classA.marketValue = parseNumberCell(c2 ?? c1);
            } else if (c0.startsWith("class b")) {
              summary.classB.marketValue = parseNumberCell(c2 ?? c1);
            } else if (!c0 && (c2 || c1)) {
              // blank label but numeric value → total market value
              const total = parseNumberCell(c2 ?? c1);
              if (total !== undefined) {
                summary.marketValueNonAffiliatesTotal = total;
              }
            }
          }

          // SHARES OUTSTANDING SECTION
          if (section === "sharesOutstanding") {
            if (c0.startsWith("class a")) {
              summary.classA.sharesOutstanding = parseNumberCell(c2 ?? c1);
            } else if (c0.startsWith("class b")) {
              summary.classB.sharesOutstanding = parseNumberCell(c2 ?? c1);
            } else if (!c0 && (c2 || c1)) {
              // blank label but numeric value → total shares
              const total = parseNumberCell(c2 ?? c1);
              if (total !== undefined) {
                summary.sharesOutstandingTotal = total;
              }
            }
          }
        }
      }

      // Compute totals from components if missing
      if (
        summary.sharesOutstandingTotal === undefined &&
        summary.classA.sharesOutstanding !== undefined &&
        summary.classB.sharesOutstanding !== undefined
      ) {
        summary.sharesOutstandingTotal =
          summary.classA.sharesOutstanding + summary.classB.sharesOutstanding;
      }

      if (
        summary.marketValueNonAffiliatesTotal === undefined &&
        summary.classA.marketValue !== undefined &&
        summary.classB.marketValue !== undefined
      ) {
        summary.marketValueNonAffiliatesTotal =
          summary.classA.marketValue + summary.classB.marketValue;
      }

      return summary;
    };

    // Parse equity summary from tables
    let equitySummary = null;
    if (tables.length > 0) {
      try {
        // First parse flags from checkbox section
        let isWellKnownSeasonedIssuer = false;
        let isLargeAcceleratedFiler = false;
        
        const parseBoolean = (cell: string): boolean => {
          return cell.includes(':selected:');
        };
        
        // Look for issuer flags in first table
        if (tables[0].rows.length > 0) {
          tables[0].rows.forEach((row: string[]) => {
            const rowText = row.join(' ').toLowerCase();
            if (rowText.includes('well-known seasoned issuer')) {
              isWellKnownSeasonedIssuer = parseBoolean(row.join(' '));
            }
            if (rowText.includes('large accelerated filer')) {
              isLargeAcceleratedFiler = parseBoolean(row.join(' '));
            }
          });
        }
        
        equitySummary = extractEquitySummary(tables, {
          isWellKnownSeasonedIssuer,
          isLargeAcceleratedFiler
        });
        
        console.log('Parsed equity summary:', equitySummary);
      } catch (e) {
        console.error('Error parsing equity summary:', e);
      }
    }

    // Call Lovable AI for summary
    let summary = null;
    try {
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      
      const aiResponse = await fetch(
        'https://ai.gateway.lovable.dev/v1/chat/completions',
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${lovableApiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: "You summarize financial documents. Provide a brief, clear summary highlighting key financial information."
              },
              {
                role: "user",
                content: `Summarize this financial document in 2-3 sentences:\n\n${pdfText.slice(0, 8000)}`
              }
            ]
          }),
        }
      );

      if (aiResponse.ok) {
        const data = await aiResponse.json();
        summary = data.choices?.[0]?.message?.content || null;
      }
    } catch (e) {
      console.log('AI summary failed (non-critical):', e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "PDF processed successfully",
        fileName: fileName,
        timestamp: new Date().toISOString(),
        pdfText: pdfText,
        pdfTextPreview: pdfText.slice(0, 500) || null,
        tables: tables,
        equitySummary: equitySummary,
        azureMessage: summary || `Extracted ${tables.length} tables from document`,
        pdfError: null
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        pdfError: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
