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

const formatCurrency = (value: number | null): string => {
  if (value === null) return 'N/A';
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
};

const formatPercent = (value: number | null): string => {
  if (value === null) return 'N/A';
  return `${value.toFixed(1)}%`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { metrics, documentName } = await req.json() as { 
      metrics: FinancialMetrics; 
      documentName: string;
    };

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build context from REAL extracted data only
    const dataContext = `
Company: ${metrics.companyName}
Period: ${metrics.period}
Document: ${documentName}

EXTRACTED FINANCIAL DATA (from actual 10-K):
${metrics.revenue !== null ? `- Revenue: ${formatCurrency(metrics.revenue)}` : ''}
${metrics.revenueYoY !== null ? `- Revenue YoY Growth: ${formatPercent(metrics.revenueYoY)}` : ''}
${metrics.grossMargin !== null ? `- Gross Margin: ${formatPercent(metrics.grossMargin)}` : ''}
${metrics.operatingMargin !== null ? `- Operating Margin: ${formatPercent(metrics.operatingMargin)}` : ''}
${metrics.netMargin !== null ? `- Net Margin: ${formatPercent(metrics.netMargin)}` : ''}
${metrics.freeCashFlow !== null ? `- Free Cash Flow: ${formatCurrency(metrics.freeCashFlow)}` : ''}
${metrics.fcfMargin !== null ? `- FCF Margin: ${formatPercent(metrics.fcfMargin)}` : ''}
${metrics.cashAndEquivalents !== null ? `- Cash & Equivalents: ${formatCurrency(metrics.cashAndEquivalents)}` : ''}
${metrics.totalDebt !== null ? `- Total Debt: ${formatCurrency(metrics.totalDebt)}` : ''}
${metrics.netCash !== null ? `- Net Cash Position: ${formatCurrency(metrics.netCash)}` : ''}
`.trim();

    const systemPrompt = `You are an investment banking interview coach. Your job is to generate realistic interview questions that a candidate might be asked about a company's financials.

CRITICAL RULES:
1. ONLY reference the actual financial data provided. NEVER invent, estimate, or assume any numbers.
2. If a metric is not provided (shows as N/A), do NOT ask questions that would require that metric.
3. Questions should test understanding of the data provided, not knowledge beyond it.
4. Include questions at basic, intermediate, and advanced difficulty levels.
5. Categories should be: profitability, growth, cash flow, balance sheet, or valuation concepts.

Generate 6-8 interview questions based ONLY on the provided data.

Return JSON in this exact format:
{
  "questions": [
    {
      "question": "The actual question text",
      "category": "profitability|growth|cash flow|balance sheet|valuation",
      "difficulty": "basic|intermediate|advanced",
      "hint": "A brief hint that references the actual data"
    }
  ]
}`;

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
          { role: 'user', content: `Generate interview questions based on this extracted financial data:\n\n${dataContext}` }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse JSON from response
    let questions;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse questions from AI response');
    }

    return new Response(
      JSON.stringify(questions),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in generate-interview-questions:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
