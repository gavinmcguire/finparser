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
  // Strategy: search near financial statement headers AND look for the common
  // "(in millions, except per share...)" disclaimer pattern anywhere in the doc
  
  const searchRegions: string[] = [];

  // 1. Find ALL occurrences of financial statement headers (not just first)
  const headerPatterns = [
    /consolidated\s+statements?\s+of\s+(?:operations|income|earnings)/gi,
    /consolidated\s+balance\s+sheets?/gi,
    /consolidated\s+statements?\s+of\s+cash\s+flows?/gi,
    /selected\s+(?:income|financial)\s+(?:statement|highlights?)\s+data/gi,
    /three-year\s+summary/gi,
  ];

  for (const pattern of headerPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const start = Math.max(0, match.index - 200);
      const end = Math.min(text.length, match.index + match[0].length + 500);
      searchRegions.push(text.slice(start, end));
    }
  }

  // 2. Look for the explicit disclaimer pattern anywhere — these are highly reliable
  //    e.g. "(in millions, except per share data)" or "(Dollars in thousands)"
  const disclaimerPattern = /\((?:in|dollars\s+in|amounts\s+in)\s+(?:thousands|millions|billions)[^)]{0,80}\)/gi;
  let disclaimerMatch;
  while ((disclaimerMatch = disclaimerPattern.exec(text)) !== null) {
    searchRegions.push(disclaimerMatch[0]);
  }

  // 3. Also check the first 3000 chars
  searchRegions.push(text.slice(0, 3000));

  if (searchRegions.length === 0) {
    return { unit: 'units', multiplier: 1 };
  }

  const searchText = searchRegions.join(' ').toLowerCase();

  // Count occurrences of each unit
  const thousands = (searchText.match(/in\s+thousands/g) || []).length;
  const millions = (searchText.match(/in\s+millions/g) || []).length;
  const billions = (searchText.match(/in\s+billions/g) || []).length;

  console.log(`Unit detection counts — thousands: ${thousands}, millions: ${millions}, billions: ${billions}`);

  // Pick the most common unit near financial context
  if (millions > 0 && millions >= thousands && millions >= billions) {
    return { unit: 'millions', multiplier: 1_000_000 };
  }
  if (thousands > 0 && thousands >= billions) {
    return { unit: 'thousands', multiplier: 1_000 };
  }
  if (billions > 0) {
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
    // CRITICAL: Extract only what we need immediately, then free the massive Azure response
    const result = resultData.analyzeResult;
    // Free the outer wrapper immediately
    resultData.analyzeResult = null;
    
    // Extract text — only keep first 30k chars
    const rawContent = result.content || "";
    const detectText = rawContent.slice(0, 20_000);
    const reportedUnit = detectReportedUnit(detectText);
    const pdfText = rawContent.slice(0, 30_000);
    result.content = null; // Free immediately
    
    const pageCount = result.pages?.length || 0;
    const rawTableCount = result.tables?.length || 0;
    
    console.log(`Azure complete: ${pageCount} pages, ${rawTableCount} tables`);
    console.log(`Detected unit: ${reportedUnit.unit}`);

    // Free everything we don't need BEFORE processing tables
    result.pages = null;
    result.paragraphs = null;
    result.styles = null;
    result.keyValuePairs = null;
    result.documents = null;
    result.languages = null;
    
    // Cap at 50 tables — financial statements are in first 20-30
    const maxTables = Math.min(rawTableCount, 50);
    const rawTables = result.tables || [];
    result.tables = null; // Detach from result object
    
    const tables: any[] = [];
    for (let index = 0; index < maxTables; index++) {
      const table = rawTables[index];
      if (!table?.cells) { rawTables[index] = null; continue; }
      
      const columns: string[] = [];
      const rows: string[][] = [];
      
      // Build row map in single pass
      const rowMap = new Map<number, Map<number, string>>();
      for (const cell of table.cells) {
        const content = (cell.content ?? '').toString();
        if (cell.rowIndex === 0) {
          columns[cell.columnIndex] = content;
        } else {
          if (!rowMap.has(cell.rowIndex)) rowMap.set(cell.rowIndex, new Map());
          rowMap.get(cell.rowIndex)!.set(cell.columnIndex, content);
        }
      }
      
      const maxRow = table.rowCount - 1;
      for (let rowIdx = 1; rowIdx <= maxRow; rowIdx++) {
        const rowData: string[] = [];
        const rm = rowMap.get(rowIdx);
        if (rm) {
          for (const [colIdx, val] of rm) {
            rowData[colIdx] = val;
          }
        }
        rows.push(rowData);
      }
      
      tables.push({
        title: `Table ${index + 1}`,
        columns,
        rows,
        rowCount: table.rowCount,
        columnCount: table.columnCount
      });
      
      // Release raw table immediately
      rawTables[index] = null;
    }
    // Free ALL remaining raw tables (indices 50+)
    for (let i = maxTables; i < rawTables.length; i++) {
      rawTables[i] = null;
    }
    resultData.analyzeResult = null;

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

      // Extract income statement — find the BEST table, not just the first match
      try {
        const SEGMENT_PENALTY_WORDS = ['segment', 'north america', 'emea', 'asia', 'by region', 'by country', 'consumer', 'corporate', 'commercial', 'investment bank', 'asset management', 'wealth management'];
        
        let bestTable: any = null;
        let bestScore = -Infinity;
        
        for (const table of tables) {
          let hasRevenue = false, hasNetIncome = false;
          let rowCount = table.rows?.length || 0;
          for (const row of table.rows) {
            const label = (row[0] || "").toLowerCase();
            if (label.includes("revenue") || label.includes("total revenues") || label.includes("net sales") || label.includes("total net sales") || label.includes("total net revenue") || label.includes("net interest income")) hasRevenue = true;
            if (label.includes("net income") || label.includes("net earnings")) hasNetIncome = true;
          }
          if (!hasRevenue || !hasNetIncome) continue;
          
          // Score this table
          let score = rowCount; // Larger tables (consolidated) score higher
          
          // Bonus for having "total net revenue" row (consolidated banking IS)
          const tableText = table.rows.map((r: string[]) => (r[0] || "").toLowerCase()).join(" ");
          if (tableText.includes("total net revenue")) score += 50;
          if (tableText.includes("income before income tax")) score += 20;
          if (tableText.includes("provision for credit losses")) score += 20;
          if (tableText.includes("earnings per share") || tableText.includes("diluted")) score += 30;
          if (tableText.includes("cost of sales") || tableText.includes("cost of goods") || tableText.includes("gross profit")) score += 20;
          
          // Penalize segment/subsidiary tables
          for (const penalty of SEGMENT_PENALTY_WORDS) {
            if (tableText.includes(penalty)) score -= 30;
          }
          
          if (score > bestScore) {
            bestScore = score;
            bestTable = table;
          }
        }
        
        const incomeStatement: any = {};
        if (bestTable) {
          // Detect which column has the most recent year
          // 10-Ks often put most recent year LEFTMOST (e.g., 2025 | 2024 | 2023)
          let latestCol = -1;
          
          // Check column headers for year ordering
          const cols = bestTable.columns || [];
          let maxYear = 0;
          for (let i = 1; i < cols.length; i++) {
            const yearMatch = (cols[i] || "").match(/\b(20\d{2})\b/);
            if (yearMatch) {
              const year = parseInt(yearMatch[1]);
              if (year > maxYear) {
                maxYear = year;
                latestCol = i;
              }
            }
          }
          
          // If no year found in columns, check if first column header has years
          if (latestCol === -1 && cols[0]) {
            const headerYears = (cols[0] || "").match(/\b(20\d{2})\b/g);
            if (headerYears && headerYears.length > 0) {
              // First year in header is usually most recent; data starts at col 1
              latestCol = 1;
            }
          }
          
          // Fallback: pick first numeric column from revenue row (leftmost = most recent in 10-K convention)
          if (latestCol === -1) {
            for (const row of bestTable.rows) {
              const label = (row[0] || "").toLowerCase();
              if (label.includes("total net revenue") || label.includes("revenue") || label.includes("net sales")) {
                for (let i = 1; i < row.length; i++) {
                  if (parseIncomeStatementNumber(row[i]) !== undefined) { latestCol = i; break; }
                }
                break;
              }
            }
          }
          
          if (latestCol >= 1) {
            for (const row of bestTable.rows) {
              const label = (row[0] || "").toLowerCase();
              const value = parseIncomeStatementNumber(row[latestCol]);
              if (value === undefined) continue;
              if (label.includes("total net revenue")) { incomeStatement.revenue = value; }
              else if ((label.includes("revenue") || label.includes("net sales")) && !label.includes("cost") && !label.includes("noninterest")) incomeStatement.revenue = incomeStatement.revenue || value;
              if (label.includes("cost of sales") || label.includes("cost of goods")) incomeStatement.costOfSales = value;
              if (label.includes("gross profit") || label.includes("gross margin")) incomeStatement.grossProfit = value;
              if (label.includes("provision for credit losses")) incomeStatement.provisionForCreditLosses = value;
              if ((label.includes("operating income") || label.includes("income from operations") || label.includes("income before income tax")) && !label.includes("non-operating")) incomeStatement.operatingIncome = incomeStatement.operatingIncome || value;
              if ((label.includes("net income") || label.includes("net earnings")) && !label.includes("noncontrolling") && !label.includes("non-controlling")) incomeStatement.netIncome = incomeStatement.netIncome || value;
            }
          }
        }
        if (Object.keys(incomeStatement).length > 0) {
          financials = { incomeStatement };
        }
      } catch (e) {
        console.error('Error parsing IS:', e);
      }
    }

    // AI summary — skip to conserve memory; generate client-side if needed
    const aiSummary = null;
    console.log(`Skipping AI summary to conserve memory (${tables.length} tables, ${pageCount} pages)`);

    // Update DB record with results
    const financialsWithUnit = { ...(financials || {}), reportedUnit };

    const { error: updateError } = await supabase.from('document_analyses').update({
      pdf_text: pdfText,
      tables: tables,
      equity_summary: equitySummary,
      financials: financialsWithUnit,
      summary: aiSummary || `Extracted ${tables.length} tables from ${pageCount} pages`,
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
        pdfText: pdfText.slice(0, 30_000), // Only send first 30k to client
        pdfTextPreview: pdfText.slice(0, 500),
        tables,
        tablesCount: tables.length,
        equitySummary,
        financials: financialsWithUnit,
        reportedUnit,
        summary: aiSummary || `Extracted ${tables.length} tables from ${pageCount} pages`,
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
