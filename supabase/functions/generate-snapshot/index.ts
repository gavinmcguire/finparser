import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FinancialMetrics {
  companyName: string;
  period: string;
  revenue: number | null;
  revenueYoY: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  freeCashFlow: number | null;
  fcfMargin: number | null;
  cashAndEquivalents: number | null;
  totalDebt: number | null;
  netCash: number | null;
}

function formatCurrency(value: number | null): string {
  if (value === null) return 'N/A';
  const absValue = Math.abs(value);
  if (absValue >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (absValue >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (absValue >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPercent(value: number | null): string {
  if (value === null) return 'N/A';
  return `${value.toFixed(1)}%`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { metrics } = await req.json() as { metrics: FinancialMetrics };
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build a prompt with the actual metrics
    const metricsContext = `
Company: ${metrics.companyName}
Period: ${metrics.period}

KEY FINANCIAL METRICS:
- Revenue: ${formatCurrency(metrics.revenue)}${metrics.revenueYoY !== null ? ` (YoY: ${formatPercent(metrics.revenueYoY)})` : ''}
- Gross Margin: ${formatPercent(metrics.grossMargin)}
- Operating Margin: ${formatPercent(metrics.operatingMargin)}
- Net Margin: ${formatPercent(metrics.netMargin)}
- Free Cash Flow: ${formatCurrency(metrics.freeCashFlow)}${metrics.fcfMargin !== null ? ` (FCF Margin: ${formatPercent(metrics.fcfMargin)})` : ''}
- Cash & Equivalents: ${formatCurrency(metrics.cashAndEquivalents)}
- Total Debt: ${formatCurrency(metrics.totalDebt)}
- Net Cash Position: ${formatCurrency(metrics.netCash)}
`;

    const systemPrompt = `You are a senior investment banking analyst. Generate a concise financial snapshot analysis based on the provided metrics. 

IMPORTANT RULES:
1. Only reference metrics that are provided (not N/A)
2. Do NOT invent or assume any numbers not provided
3. Be factual and analytical
4. Focus on: growth trends, profitability, cash generation, and balance sheet strength
5. Note any unusual or notable items based on the metrics
6. Do NOT assume numbers are projections unless explicitly stated as such
7. If data includes future periods without clarifying whether they are projections or actuals, refer to them as "later periods" instead of "projected"

Output format: Return exactly 3-6 bullet points, each starting with "•". Be concise but insightful.`;

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
          { role: 'user', content: `Generate a financial snapshot analysis for:\n${metricsContext}` }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content || 'Unable to generate analysis.';

    console.log('Generated snapshot analysis for:', metrics.companyName);

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-snapshot:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
