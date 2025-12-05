import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, Calculator } from "lucide-react";
import { FinancialMetrics } from "@/lib/extractFinancialMetrics";

interface KeyRatiosCardProps {
  metrics: FinancialMetrics;
}

interface RatioDisplay {
  label: string;
  value: number | null;
  format: 'percent' | 'ratio' | 'currency';
  description: string;
  isGoodWhenHigh?: boolean;
}

const formatValue = (value: number | null, format: 'percent' | 'ratio' | 'currency'): string => {
  if (value === null) return '—';
  
  switch (format) {
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'ratio':
      return value.toFixed(2);
    case 'currency':
      if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
      if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
      return `$${value.toLocaleString()}`;
    default:
      return value.toString();
  }
};

const RatioItem = ({ ratio }: { ratio: RatioDisplay }) => {
  const isPositive = ratio.value !== null && ratio.value > 0;
  const isNegative = ratio.value !== null && ratio.value < 0;
  
  return (
    <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{ratio.label}</span>
        {ratio.value !== null && (
          <span className={`text-xs ${isPositive ? 'text-emerald-500' : isNegative ? 'text-rose-500' : 'text-muted-foreground'}`}>
            {isPositive ? <TrendingUp className="h-3 w-3 inline" /> : isNegative ? <TrendingDown className="h-3 w-3 inline" /> : <Minus className="h-3 w-3 inline" />}
          </span>
        )}
      </div>
      <div className="text-lg font-bold font-mono">
        {formatValue(ratio.value, ratio.format)}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{ratio.description}</p>
    </div>
  );
};

export const KeyRatiosCard = ({ metrics }: KeyRatiosCardProps) => {
  // All ratios are calculated from extracted data - no AI, no hallucination
  const profitabilityRatios: RatioDisplay[] = [
    {
      label: 'Gross Margin',
      value: metrics.grossMargin,
      format: 'percent',
      description: 'Gross Profit ÷ Revenue',
      isGoodWhenHigh: true,
    },
    {
      label: 'Operating Margin',
      value: metrics.operatingMargin,
      format: 'percent',
      description: 'Operating Income ÷ Revenue',
      isGoodWhenHigh: true,
    },
    {
      label: 'Net Margin',
      value: metrics.netMargin,
      format: 'percent',
      description: 'Net Income ÷ Revenue',
      isGoodWhenHigh: true,
    },
    {
      label: 'FCF Margin',
      value: metrics.fcfMargin,
      format: 'percent',
      description: 'Free Cash Flow ÷ Revenue',
      isGoodWhenHigh: true,
    },
  ];

  // Calculate additional ratios from available data
  const returnOnEquity = metrics.netIncome && metrics.cashAndEquivalents 
    ? null // Would need total equity which we don't extract
    : null;
    
  const currentRatio = null; // Would need current assets/liabilities
  
  const debtToEquity = null; // Would need total equity
  
  const cashRatios: RatioDisplay[] = [
    {
      label: 'Operating CF',
      value: metrics.operatingCashFlow,
      format: 'currency',
      description: 'Cash from operations',
      isGoodWhenHigh: true,
    },
    {
      label: 'Free Cash Flow',
      value: metrics.freeCashFlow,
      format: 'currency',
      description: 'Operating CF - CapEx',
      isGoodWhenHigh: true,
    },
    {
      label: 'Net Cash Position',
      value: metrics.netCash,
      format: 'currency',
      description: 'Cash - Total Debt',
      isGoodWhenHigh: true,
    },
    {
      label: 'CapEx',
      value: metrics.capex ? -metrics.capex : null,
      format: 'currency',
      description: 'Capital expenditures',
    },
  ];

  const hasAnyProfitability = profitabilityRatios.some(r => r.value !== null);
  const hasAnyCash = cashRatios.some(r => r.value !== null);

  if (!hasAnyProfitability && !hasAnyCash) {
    return null;
  }

  return (
    <Card className="glass-card rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
          <Calculator className="h-4 w-4 text-accent" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">Key Financial Ratios</h3>
          <p className="text-xs text-muted-foreground">Calculated from extracted data</p>
        </div>
      </div>

      {hasAnyProfitability && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Profitability</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {profitabilityRatios.map((ratio, i) => (
              <RatioItem key={i} ratio={ratio} />
            ))}
          </div>
        </div>
      )}

      {hasAnyCash && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Cash & Liquidity</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {cashRatios.map((ratio, i) => (
              <RatioItem key={i} ratio={ratio} />
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground mt-4 text-center italic">
        All ratios calculated directly from extracted financial statements. No AI estimation.
      </p>
    </Card>
  );
};
