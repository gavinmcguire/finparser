import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  documentId: z.string().uuid(),
});

// ─── Unit Detection ─────────────────────────────────────────────
function detectReportedUnit(text: string): { unit: string; multiplier: number } {
  // Only search near financial statement headers, not the full document
  // This prevents false positives from narrative text like "over $4 billion in..."
  const statementHeaders = [
    /consolidated\s+statements?\s+of\s+(?:operations|income|earnings)/i,
    /consolidated\s+balance\s+sheets?/i,
    /consolidated\s+statements?\s+of\s+cash\s+flows?/i,
    /consolidated\s+statements?\s+of\s+(?:financial|comprehensive)/i,
  ];

  // Extract ~500 chars around each financial statement header
  const searchRegions: string[] = [];
  for (const header of statementHeaders) {
    const match = header.exec(text);
    if (match && match.index !== undefined) {
      const start = Math.max(0, match.index - 200);
      const end = Math.min(text.length, match.index + match[0].length + 300);
      searchRegions.push(text.slice(start, end));
    }
  }

  // Also check the first 2000 chars (cover pages sometimes have disclaimers)
  searchRegions.push(text.slice(0, 2000));

  const searchText = searchRegions.join(' ');

  // Order matters: check thousands first (most specific match wins by context)
  const patterns = [
    { regex: /\(\s*in\s+thousands/i, unit: 'thousands', multiplier: 1_000 },
    { regex: /\(\s*in\s+millions/i, unit: 'millions', multiplier: 1_000_000 },
    { regex: /\(\s*in\s+billions/i, unit: 'billions', multiplier: 1_000_000_000 },
    { regex: /\b(?:in|amounts?\s+in|dollars?\s+in)\s+thousands\b/i, unit: 'thousands', multiplier: 1_000 },
    { regex: /\b(?:in|amounts?\s+in|dollars?\s+in)\s+millions\b/i, unit: 'millions', multiplier: 1_000_000 },
    { regex: /\b(?:in|amounts?\s+in|dollars?\s+in)\s+billions\b/i, unit: 'billions', multiplier: 1_000_000_000 },
  ];

  // Count matches — if "millions" appears more than "billions", use millions
  const counts: Record<string, number> = { thousands: 0, millions: 0, billions: 0 };
  for (const { regex, unit } of patterns) {
    const matches = searchText.match(new RegExp(regex.source, 'gi'));
    if (matches) counts[unit] += matches.length;
  }

  // Pick the unit with the most matches near financial headers
  if (counts.thousands > 0 && counts.thousands >= counts.millions && counts.thousands >= counts.billions) {
    return { unit: 'thousands', multiplier: 1_000 };
  }
  if (counts.millions > 0 && counts.millions >= counts.billions) {
    return { unit: 'millions', multiplier: 1_000_000 };
  }
  if (counts.billions > 0) {
    return { unit: 'billions', multiplier: 1_000_000_000 };
  }

  return { unit: 'units', multiplier: 1 };
}

// ─── Helpers ────────────────────────────────────────────────────
function parseIncomeStatementNumber(raw?: string): number | undefined {
  if (!raw) return undefined;
  const str = raw.toString().trim();
  const isNegative = str.startsWith('(') && str.endsWith(')');
  const cleaned = str.replace(/[\$,()]/g, "").trim();
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return undefined;
  return isNegative ? -n : n;
}

function parseNumberCell(raw?: string): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.toString().replace(/\$/g, "").replace(/,/g, "").trim();
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const rawBody = await req.json();
    const parseResult = requestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid input' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { documentId } = parseResult.data;

    // Get the document record
    const { data: doc, error: fetchError } = await supabase
      .from('document_analyses')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !doc) {
      return new Response(JSON.stringify({ success: false, error: 'Document not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Already completed or failed
    if (doc.processing_status === 'completed') {
      return new Response(JSON.stringify({
        success: true,
        status: 'completed',
        data: {
          fileName: doc.file_name,
          pdfText: doc.pdf_text,
          tables: doc.tables,
          equitySummary: doc.equity_summary,
          financials: doc.financials,
          summary: doc.summary,
          reportedUnit: doc.financials?.reportedUnit || null,
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (doc.processing_status === 'failed') {
      return new Response(JSON.stringify({
        success: false,
        status: 'failed',
        error: doc.error_message || 'Processing failed',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Still processing — check Azure
    const operationUrl = doc.azure_operation_url;
    if (!operationUrl) {
      return new Response(JSON.stringify({ success: false, error: 'No operation URL' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const docIntelKey = Deno.env.get('AZURE_DOC_INTELLIGENCE_KEY');
    if (!docIntelKey) throw new Error('Azure key not configured');

    const resultResponse = await fetch(operationUrl, {
      headers: { 'Ocp-Apim-Subscription-Key': docIntelKey },
    });

    if (!resultResponse.ok) {
      throw new Error(`Azure poll failed: ${resultResponse.status}`);
    }

    const resultData = await resultResponse.json();

    if (resultData.status === 'running' || resultData.status === 'notStarted') {
      return new Response(JSON.stringify({
        success: true,
        status: 'processing',
        message: 'Still processing...',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (resultData.status === 'failed') {
      await supabase.from('document_analyses').update({
        processing_status: 'failed',
        error_message: 'Azure analysis failed',
      }).eq('id', documentId);

      return new Response(JSON.stringify({
        success: false,
        status: 'failed',
        error: 'Azure analysis failed',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── Process completed results ─────────────────────────────
    const result = resultData.analyzeResult;
    const pdfText = result.content || "";
    const reportedUnit = detectReportedUnit(pdfText);
    
    console.log(`Azure complete: ${result.pages?.length || 0} pages, ${result.tables?.length || 0} tables`);
    console.log(`Detected unit: ${reportedUnit.unit}`);

    // Extract tables
    const tables = (result.tables || []).map((table: any, index: number) => {
      const columns: string[] = [];
      const rows: string[][] = [];
      
      const headerCells = table.cells.filter((cell: any) => cell.rowIndex === 0);
      headerCells.forEach((cell: any) => {
        columns[cell.columnIndex] = (cell.content ?? '').toString();
      });
      
      const maxRow = Math.max(...table.cells.map((c: any) => c.rowIndex));
      for (let rowIdx = 1; rowIdx <= maxRow; rowIdx++) {
        const rowCells = table.cells.filter((cell: any) => cell.rowIndex === rowIdx);
        const rowData: string[] = [];
        rowCells.forEach((cell: any) => {
          rowData[cell.columnIndex] = (cell.content ?? '').toString();
        });
        rows.push(rowData);
      }
      
      return {
        title: `Table ${index + 1}`,
        columns,
        rows,
        rowCount: table.rowCount,
        columnCount: table.columnCount
      };
    });

    // Extract equity summary
    let equitySummary = null;
    let financials: any = null;

    if (tables.length > 0) {
      try {
        let isWellKnownSeasonedIssuer = false;
        let isLargeAcceleratedFiler = false;
        
        if (tables[0].rows.length > 0) {
          tables[0].rows.forEach((row: string[]) => {
            const rowText = row.join(' ').toLowerCase();
            if (rowText.includes('well-known seasoned issuer')) {
              isWellKnownSeasonedIssuer = row.join(' ').includes(':selected:');
            }
            if (rowText.includes('large accelerated filer')) {
              isLargeAcceleratedFiler = row.join(' ').includes(':selected:');
            }
          });
        }

        // Basic equity summary extraction
        const summary: any = {
          isWellKnownSeasonedIssuer,
          isLargeAcceleratedFiler,
          classA: {},
          classB: {},
        };

        for (const table of tables) {
          let section: "none" | "marketValue" | "sharesOutstanding" = "none";
          for (const row of table.rows) {
            const c0 = (row[0] || "").toLowerCase();
            const c1 = row[1];
            const c2 = row[2];
            if (c0.includes("aggregate market value")) { section = "marketValue"; continue; }
            if (c0.includes("number of") && c0.includes("shares") && c0.includes("outstanding")) { section = "sharesOutstanding"; continue; }
            if (section === "marketValue") {
              if (c0.startsWith("class a")) summary.classA.marketValue = parseNumberCell(c2 ?? c1);
              else if (c0.startsWith("class b")) summary.classB.marketValue = parseNumberCell(c2 ?? c1);
            }
            if (section === "sharesOutstanding") {
              if (c0.startsWith("class a")) summary.classA.sharesOutstanding = parseNumberCell(c2 ?? c1);
              else if (c0.startsWith("class b")) summary.classB.sharesOutstanding = parseNumberCell(c2 ?? c1);
            }
          }
        }
        equitySummary = summary;
      } catch (e) {
        console.error('Error parsing equity summary:', e);
      }

      // Extract income statement
      try {
        const incomeStatement: any = {};
        for (const table of tables) {
          let hasRevenue = false, hasNetIncome = false;
          for (const row of table.rows) {
            const label = (row[0] || "").toLowerCase();
            if (label.includes("revenue") || label.includes("total revenues") || label.includes("net sales") || label.includes("total net sales")) hasRevenue = true;
            if (label.includes("net income") || label.includes("net earnings")) hasNetIncome = true;
          }
          if (hasRevenue && hasNetIncome) {
            let latestCol = -1;
            for (const row of table.rows) {
              const label = (row[0] || "").toLowerCase();
              if (label.includes("revenue") || label.includes("net sales")) {
                for (let i = row.length - 1; i >= 1; i--) {
                  if (parseIncomeStatementNumber(row[i]) !== undefined) { latestCol = i; break; }
                }
                break;
              }
            }
            if (latestCol === -1) break;
            for (const row of table.rows) {
              const label = (row[0] || "").toLowerCase();
              const value = parseIncomeStatementNumber(row[latestCol]);
              if (value === undefined) continue;
              if ((label.includes("revenue") || label.includes("net sales")) && !label.includes("cost")) incomeStatement.revenue = incomeStatement.revenue || value;
              if (label.includes("cost of sales") || label.includes("cost of goods")) incomeStatement.costOfSales = value;
              if (label.includes("gross profit") || label.includes("gross margin")) incomeStatement.grossProfit = value;
              if ((label.includes("operating income") || label.includes("income from operations")) && !label.includes("non-operating")) incomeStatement.operatingIncome = value;
              if ((label.includes("net income") || label.includes("net earnings")) && !label.includes("noncontrolling") && !label.includes("non-controlling")) incomeStatement.netIncome = incomeStatement.netIncome || value;
            }
            break;
          }
        }
        if (Object.keys(incomeStatement).length > 0) {
          financials = { incomeStatement };
        }
      } catch (e) {
        console.error('Error parsing IS:', e);
      }
    }

    // AI summary
    let aiSummary = null;
    try {
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${lovableApiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You summarize financial documents. Provide a brief, clear summary highlighting key financial information." },
            { role: "user", content: `Summarize this financial document in 2-3 sentences:\n\n${pdfText.slice(0, 8000)}` }
          ]
        }),
      });
      if (aiResponse.ok) {
        const data = await aiResponse.json();
        aiSummary = data.choices?.[0]?.message?.content || null;
      }
    } catch (e) {
      console.log('AI summary failed (non-critical):', e);
    }

    // Update DB record with results
    const financialsWithUnit = { ...(financials || {}), reportedUnit };

    const { error: updateError } = await supabase.from('document_analyses').update({
      pdf_text: pdfText,
      tables: tables,
      equity_summary: equitySummary,
      financials: financialsWithUnit,
      summary: aiSummary || `Extracted ${tables.length} tables from ${result.pages?.length || 0} pages`,
      processing_status: 'completed',
      azure_operation_url: null, // Clear sensitive URL
    }).eq('id', documentId);

    if (updateError) {
      console.error('Failed to update document:', updateError);
      throw new Error('Failed to save results');
    }

    console.log(`Document ${documentId} processing complete`);

    return new Response(JSON.stringify({
      success: true,
      status: 'completed',
      data: {
        fileName: doc.file_name,
        pdfText,
        tables,
        tablesCount: tables.length,
        equitySummary,
        financials: financialsWithUnit,
        reportedUnit,
        summary: aiSummary || `Extracted ${tables.length} tables from ${result.pages?.length || 0} pages`,
      }
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
