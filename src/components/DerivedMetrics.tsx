import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useMemo } from "react";

interface DerivedMetricsProps {
  columns: string[];
  rows: string[][];
}

interface CashFlowData {
  period: string;
  operatingCF: number | null;
  capex: number | null;
  fcf: number | null;
}

interface MetricWithChanges {
  period: string;
  value: number | null;
  qoqChange: number | null;
  yoyChange: number | null;
}

// Parse numeric value from string (handles parentheses as negative, removes $, commas)
const parseNumericValue = (value: string): number | null => {
  if (!value || typeof value !== 'string') return null;
  
  let cleaned = value.trim();
  if (!cleaned) return null;
  
  // Check for parentheses indicating negative
  const isNegative = cleaned.startsWith('(') && cleaned.endsWith(')');
  if (isNegative) {
    cleaned = cleaned.slice(1, -1);
  }
  
  // Remove currency symbols, commas, spaces
  cleaned = cleaned.replace(/[$€£¥,\s]/g, '');
  
  // Handle dash as zero or null
  if (cleaned === '-' || cleaned === '—' || cleaned === '–') return null;
  
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  
  return isNegative ? -num : num;
};

// Check if a row label matches cash flow patterns
const matchesOperatingCF = (label: string): boolean => {
  const lower = label.toLowerCase();
  return (
    lower.includes('net cash provided by operating') ||
    lower.includes('cash provided by operating') ||
    lower.includes('net cash from operating') ||
    lower.includes('cash flows from operating') ||
    lower.includes('operating activities') && (lower.includes('net') || lower.includes('total'))
  );
};

const matchesCapex = (label: string): boolean => {
  const lower = label.toLowerCase();
  return (
    lower.includes('capital expenditure') ||
    lower.includes('purchases of property') ||
    lower.includes('additions to property') ||
    lower.includes('property, plant and equipment') && lower.includes('purchase') ||
    lower.includes('capex')
  );
};

// Format number for display
const formatNumber = (value: number | null): string => {
  if (value === null) return '-';
  const absValue = Math.abs(value);
  if (absValue >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (absValue >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (absValue >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
};

// Format percentage
const formatPercent = (value: number | null): string => {
  if (value === null) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

export const DerivedMetrics = ({ columns, rows }: DerivedMetricsProps) => {
  const cashFlowMetrics = useMemo(() => {
    // Find period columns (skip first column which is usually the label)
    const periodColumns = columns.slice(1).map((col, idx) => ({
      name: col,
      index: idx + 1
    }));
    
    if (periodColumns.length === 0) return null;
    
    // Find operating CF and capex rows
    let operatingCFRow: string[] | null = null;
    let capexRow: string[] | null = null;
    
    for (const row of rows) {
      if (!row || row.length === 0) continue;
      const label = row[0] || '';
      
      if (!operatingCFRow && matchesOperatingCF(label)) {
        operatingCFRow = row;
      }
      if (!capexRow && matchesCapex(label)) {
        capexRow = row;
      }
      
      if (operatingCFRow && capexRow) break;
    }
    
    // If we don't have both values, return null
    if (!operatingCFRow && !capexRow) return null;
    
    // Extract values for each period
    const data: CashFlowData[] = periodColumns.map(({ name, index }) => {
      const opCF = operatingCFRow ? parseNumericValue(operatingCFRow[index]) : null;
      const capex = capexRow ? parseNumericValue(capexRow[index]) : null;
      
      // FCF = Operating CF - Capex (capex is usually negative, so we add it)
      // If capex is positive in the data, we subtract it
      let fcf: number | null = null;
      if (opCF !== null) {
        if (capex !== null) {
          // Capex is typically shown as negative (cash outflow), so FCF = OpCF + Capex
          // If capex is positive in the data (unusual), we subtract it
          fcf = capex < 0 ? opCF + capex : opCF - Math.abs(capex);
        } else {
          fcf = opCF; // If no capex found, FCF = Operating CF
        }
      }
      
      return {
        period: name,
        operatingCF: opCF,
        capex: capex,
        fcf: fcf
      };
    });
    
    // Calculate period-over-period changes
    const fcfWithChanges: MetricWithChanges[] = data.map((item, idx) => {
      let qoqChange: number | null = null;
      let yoyChange: number | null = null;
      
      // QoQ: compare to previous period
      if (idx > 0 && item.fcf !== null && data[idx - 1].fcf !== null && data[idx - 1].fcf !== 0) {
        qoqChange = ((item.fcf - data[idx - 1].fcf!) / Math.abs(data[idx - 1].fcf!)) * 100;
      }
      
      // YoY: try to find same quarter previous year (4 periods back for quarterly)
      if (idx >= 4 && item.fcf !== null && data[idx - 4].fcf !== null && data[idx - 4].fcf !== 0) {
        yoyChange = ((item.fcf - data[idx - 4].fcf!) / Math.abs(data[idx - 4].fcf!)) * 100;
      }
      
      return {
        period: item.period,
        value: item.fcf,
        qoqChange,
        yoyChange
      };
    });
    
    return {
      hasOperatingCF: operatingCFRow !== null,
      hasCapex: capexRow !== null,
      data,
      fcfWithChanges
    };
  }, [columns, rows]);
  
  if (!cashFlowMetrics) return null;
  
  const { data, fcfWithChanges, hasOperatingCF, hasCapex } = cashFlowMetrics;
  
  // Only show if we have at least operating CF data
  if (!hasOperatingCF) return null;
  
  const ChangeIndicator = ({ value }: { value: number | null }) => {
    if (value === null) return <span className="text-muted-foreground">-</span>;
    if (value > 0) return <span className="text-green-600 dark:text-green-400 flex items-center gap-0.5"><TrendingUp className="h-3 w-3" />{formatPercent(value)}</span>;
    if (value < 0) return <span className="text-red-600 dark:text-red-400 flex items-center gap-0.5"><TrendingDown className="h-3 w-3" />{formatPercent(value)}</span>;
    return <span className="text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" />0.0%</span>;
  };
  
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs font-medium flex items-center gap-1.5">
          <Calculator className="h-3.5 w-3.5 text-primary" />
          Derived Metrics
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="space-y-3">
          {/* FCF Summary */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
              Free Cash Flow {!hasCapex && "(Operating CF only)"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {fcfWithChanges.slice(-4).map((item, idx) => (
                <div key={idx} className="bg-background rounded p-2 border">
                  <p className="text-[10px] text-muted-foreground truncate" title={item.period}>
                    {item.period}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatNumber(item.value)}
                  </p>
                  <div className="flex gap-2 mt-1 text-[10px]">
                    {item.qoqChange !== null && (
                      <div className="flex items-center gap-0.5">
                        <span className="text-muted-foreground">QoQ:</span>
                        <ChangeIndicator value={item.qoqChange} />
                      </div>
                    )}
                    {item.yoyChange !== null && (
                      <div className="flex items-center gap-0.5">
                        <span className="text-muted-foreground">YoY:</span>
                        <ChangeIndicator value={item.yoyChange} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Components breakdown */}
          <div className="text-[10px] text-muted-foreground border-t pt-2">
            <p className="font-medium mb-1">Components (latest period):</p>
            <div className="space-y-0.5">
              <p>• Operating CF: {formatNumber(data[data.length - 1]?.operatingCF)}</p>
              <p>• CapEx: {formatNumber(data[data.length - 1]?.capex)}</p>
              <p className="font-medium text-foreground">• FCF: {formatNumber(data[data.length - 1]?.fcf)}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
