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
    console.log(`Raw fileData length: ${fileData?.length || 0} characters`);
    console.log(`FileData starts with: ${fileData?.substring(0, 50)}`);

    // Get Azure Document Intelligence credentials
    const docIntelEndpoint = Deno.env.get('AZURE_DOC_INTELLIGENCE_ENDPOINT');
    const docIntelKey = Deno.env.get('AZURE_DOC_INTELLIGENCE_KEY');
    
    if (!docIntelEndpoint || !docIntelKey) {
      throw new Error('Azure Document Intelligence credentials not configured');
    }

    // Extract base64 content
    const pdfBase64 = fileData.split(',')[1] || fileData;
    
    console.log('Sending PDF to Azure Document Intelligence...');
    console.log(`PDF base64 length: ${pdfBase64.length} characters`);
    console.log(`Estimated PDF size: ~${Math.round(pdfBase64.length * 0.75 / 1024 / 1024 * 100) / 100} MB`);
    console.log(`First 100 chars of base64: ${pdfBase64.substring(0, 100)}`);
    console.log(`Last 100 chars of base64: ${pdfBase64.substring(pdfBase64.length - 100)}`);

    // Call Azure Document Intelligence API - Document model for better financial doc support
    const analyzeUrl = `${docIntelEndpoint}/formrecognizer/documentModels/prebuilt-document:analyze?api-version=2023-07-31`;
    
    const requestBody = {
      base64Source: pdfBase64,
      // Enable all features for comprehensive extraction
      features: ['keyValuePairs']
      // Note: NOT specifying 'pages' parameter means Azure should process ALL pages
    };
    
    console.log('Azure request config: processing ALL pages (no pages parameter)');
    console.log(`Azure endpoint: ${analyzeUrl}`);
    
    const analyzeResponse = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': docIntelKey,
      },
      body: JSON.stringify(requestBody)
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
        console.log(`Pages analyzed: ${result.pages?.length || 0}`);
        console.log(`Content length: ${result.content?.length || 0} characters`);
        console.log(`Tables detected by Azure: ${result.tables?.length || 0}`);
        
        // Debug: Check if tables are nested under pages or at top level
        console.log('Azure response structure check:');
        console.log(`  - result.tables exists: ${!!result.tables}`);
        console.log(`  - result.tables length: ${result.tables?.length || 0}`);
        console.log(`  - result.pages exists: ${!!result.pages}`);
        console.log(`  - result.pages length: ${result.pages?.length || 0}`);
        
        // Check first and last page numbers
        if (result.pages && result.pages.length > 0) {
          console.log(`  - First page number: ${result.pages[0].pageNumber || 'N/A'}`);
          console.log(`  - Last page number: ${result.pages[result.pages.length - 1].pageNumber || 'N/A'}`);
          console.log(`  - First page has tables property: ${!!result.pages[0].tables}`);
        }
        
        // Check if we got partial content
        if (result.content && result.content.length < 50000) {
          console.log('WARNING: Content seems very short for a full 10-K document');
        }
        
        // Debug: log raw table info from Azure
        if (result.tables && result.tables.length > 0) {
          console.log('Azure tables details (from top-level result.tables):');
          result.tables.forEach((t: any, idx: number) => {
            const pageSpan = t.boundingRegions?.map((br: any) => br.pageNumber).join(',') || 'unknown';
            console.log(`  Table ${idx + 1}: ${t.rowCount} rows x ${t.columnCount} cols, pages: [${pageSpan}]`);
          });
        } else {
          console.log('WARNING: Azure detected 0 tables in result.tables array');
        }
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
    
    // Count raw tables from Azure response
    const azureTablesCount = result.tables?.length || 0;
    console.log(`Azure returned ${azureTablesCount} tables for processing`);
    console.log('Starting table extraction from result.tables array...');
    
    // Extract ALL tables from Azure result (tables are at top level, not nested under pages)
    // The Azure Document Intelligence API returns all tables in result.tables regardless of page
    const tables = (result.tables || []).map((table: any, index: number) => {
      console.log(`Processing table ${index + 1}/${azureTablesCount}...`);
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

    console.log(`Extracted ${pdfText.length} chars, ${tables.length} tables from ${result.pages?.length || 0} pages`);
    
    // Log table details for debugging
    if (tables.length > 0) {
      console.log('Table summary:');
      tables.forEach((table: any, idx: number) => {
        console.log(`  Table ${idx + 1}: ${table.rowCount} rows × ${table.columnCount} cols`);
      });
    }

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

    // Helper to parse income statement numbers (handles parentheses for negatives)
    const parseIncomeStatementNumber = (raw?: string): number | undefined => {
      if (!raw) return undefined;
      const str = raw.toString().trim();
      
      // Check if wrapped in parentheses (means negative)
      const isNegative = str.startsWith('(') && str.endsWith(')');
      const cleaned = str
        .replace(/[\$,()]/g, "")
        .trim();
      
      if (!cleaned) return undefined;
      const n = Number(cleaned);
      if (!Number.isFinite(n)) return undefined;
      
      return isNegative ? -n : n;
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

    // Extract income statement data
    const extractIncomeStatement = (tables: any[]) => {
      const incomeStatement: any = {};
      
      // Find the income statement table
      let incomeStatementTable = null;
      let latestYearColIndex = -1;
      
      for (const table of tables) {
        let hasRevenue = false;
        let hasNetIncome = false;
        
        // Check if this table looks like an income statement
        for (const row of table.rows) {
          const label = (row[0] || "").toLowerCase();
          if (label.includes("revenue") || label.includes("total revenues")) {
            hasRevenue = true;
          }
          if (label.includes("net income") || label.includes("net earnings")) {
            hasNetIncome = true;
          }
        }
        
        if (hasRevenue && hasNetIncome) {
          incomeStatementTable = table;
          
          // Find the rightmost numeric column (latest year)
          // Check a revenue row to find which columns have numeric data
          for (const row of table.rows) {
            const label = (row[0] || "").toLowerCase();
            if (label.includes("revenue") || label.includes("total revenues")) {
              // Find rightmost column with a numeric value
              for (let i = row.length - 1; i >= 1; i--) {
                const val = parseIncomeStatementNumber(row[i]);
                if (val !== undefined) {
                  latestYearColIndex = i;
                  break;
                }
              }
              break;
            }
          }
          break;
        }
      }
      
      if (!incomeStatementTable || latestYearColIndex === -1) {
        return incomeStatement;
      }
      
      // Extract line items
      for (const row of incomeStatementTable.rows) {
        const label = (row[0] || "").toLowerCase();
        const value = parseIncomeStatementNumber(row[latestYearColIndex]);
        
        if (value === undefined) continue;
        
        // Revenue
        if ((label.includes("revenue") || label.includes("total revenues")) && 
            !label.includes("cost") && !label.includes("expense")) {
          incomeStatement.revenue = value;
        }
        
        // Cost of Sales
        if (label.includes("cost of sales") || label.includes("cost of goods")) {
          incomeStatement.costOfSales = value;
        }
        
        // Gross Profit
        if (label.includes("gross profit") || label.includes("gross margin")) {
          incomeStatement.grossProfit = value;
        }
        
        // Operating Income
        if ((label.includes("operating income") || label.includes("income from operations")) &&
            !label.includes("non-operating")) {
          incomeStatement.operatingIncome = value;
        }
        
        // Net Income (company-specific, not noncontrolling interests)
        if ((label.includes("net income") || label.includes("net earnings")) &&
            (label.includes("nike") || label.includes("attributable") || 
             (!label.includes("noncontrolling") && !label.includes("non-controlling")))) {
          if (!incomeStatement.netIncome) { // Take first match
            incomeStatement.netIncome = value;
          }
        }
        
        // Basic EPS
        if (label.includes("basic") && (label.includes("earnings per share") || label.includes("eps"))) {
          incomeStatement.basicEPS = value;
        }
        
        // Diluted EPS
        if (label.includes("diluted") && (label.includes("earnings per share") || label.includes("eps"))) {
          incomeStatement.dilutedEPS = value;
        }
      }
      
      return incomeStatement;
    };

    // Parse equity summary from tables
    let equitySummary = null;
    let financials = null;
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

      // Parse income statement
      try {
        const incomeStatement = extractIncomeStatement(tables);
        if (Object.keys(incomeStatement).length > 0) {
          financials = { incomeStatement };
          console.log('Parsed income statement:', incomeStatement);
        }
      } catch (e) {
        console.error('Error parsing income statement:', e);
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
        tablesCount: tables.length,
        azureTablesCount: azureTablesCount,
        equitySummary: equitySummary,
        financials: financials,
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
