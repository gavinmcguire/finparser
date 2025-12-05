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
    const { documentName, tableIndex, columns, rows } = await req.json();
    
    console.log(`Analyzing table ${tableIndex} from ${documentName}`);
    console.log(`Table has ${columns?.length || 0} columns and ${rows?.length || 0} rows`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build table representation for the AI
    const tableAsText = [
      `Headers: ${columns.join(' | ')}`,
      ...rows.map((row: string[], idx: number) => `Row ${idx + 1}: ${row.join(' | ')}`)
    ].join('\n');

    const systemPrompt = `You are a senior investment banking analyst. Analyze financial tables extracted from SEC filings and provide actionable insights.

Your analysis should be:
- Concise and professional
- Focused on what matters to an IB analyst
- Include specific numbers when relevant
- Highlight trends, risks, and opportunities`;

    const userPrompt = `Analyze this table from the document "${documentName}":

${tableAsText}

Provide your analysis in this exact format:

**Table Summary**
[One sentence describing what this table shows - e.g., "Tesla revenues by segment, Q4 2022 vs Q1 2023"]

**Key Metrics & Trends**
[3-5 bullet points identifying the most important numbers, growth/decline patterns, and mix shifts]

**Period-over-Period Analysis**
[If multiple time periods exist, calculate and present % changes. If only one period, note this and analyze the composition instead]

**Investment Banking Takeaways**
[2-3 bullet points with actionable insights relevant to IB analysts - valuation implications, comparable company considerations, deal-relevant observations]`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add funds to continue.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content || 'Unable to generate analysis';

    console.log('Analysis generated successfully');

    return new Response(JSON.stringify({ 
      success: true,
      analysis,
      tableIndex,
      documentName
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in analyze-table function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
