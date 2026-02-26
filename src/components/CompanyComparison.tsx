import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GitCompare, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { classifyAllTables } from "@/lib/classifyTables";
import { extractFinancialMetrics, FinancialMetrics } from "@/lib/extractFinancialMetrics";

interface DocumentAnalysis {
  id: string;
  file_name: string;
  tables: any;
  created_at: string;
}

interface CompanyComparisonProps {
  documents: DocumentAnalysis[];
  isOpen: boolean;
  onClose: () => void;
}

const formatValue = (value: number | null, format: 'percent' | 'currency'): string => {
  if (value === null) return '—';
  
  if (format === 'percent') {
    return `${value.toFixed(1)}%`;
  }
  
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
};

const TrendIcon = ({ value }: { value: number | null }) => {
  if (value === null) return <Minus className="h-3 w-3 text-muted-foreground" />;
  if (value > 0) return <TrendingUp className="h-3 w-3 text-emerald-500" />;
  if (value < 0) return <TrendingDown className="h-3 w-3 text-rose-500" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
};

interface MetricRowProps {
  label: string;
  values: (number | null)[];
  format: 'percent' | 'currency';
  highlightBest?: 'high' | 'low';
}

const MetricRow = ({ label, values, format, highlightBest = 'high' }: MetricRowProps) => {
  const validValues = values.filter(v => v !== null) as number[];
  const bestValue = highlightBest === 'high' 
    ? Math.max(...validValues) 
    : Math.min(...validValues);
  
  return (
    <div className="grid grid-cols-[180px_repeat(auto-fill,minmax(120px,1fr))] gap-2 py-2 border-b border-border/30 last:border-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      {values.map((value, i) => {
        const isBest = validValues.length > 1 && value === bestValue;
        return (
          <div 
            key={i} 
            className={`text-sm font-mono flex items-center gap-1 ${isBest ? 'text-primary font-semibold' : ''}`}
          >
            <TrendIcon value={value} />
            {formatValue(value, format)}
          </div>
        );
      })}
    </div>
  );
};

export const CompanyComparison = ({ documents, isOpen, onClose }: CompanyComparisonProps) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleDocument = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(x => x !== id)
        : prev.length < 4 
          ? [...prev, id]
          : prev
    );
  };

  const selectedDocuments = documents.filter(d => selectedIds.includes(d.id));
  
  // Extract metrics for selected documents - all from real extracted data
  const metricsData = useMemo(() => {
    return selectedDocuments.map(doc => {
      const tables = doc.tables || [];
      const classified = classifyAllTables(tables);
      const multiplier = (doc as any).financials?.reportedUnit?.multiplier || 1;
      return extractFinancialMetrics(classified, doc.file_name, multiplier);
    });
  }, [selectedDocuments]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-5xl max-h-[90vh] overflow-hidden glass-card rounded-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <GitCompare className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Company Comparison</h2>
              <p className="text-xs text-muted-foreground">Select up to 4 documents to compare</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[250px_1fr] h-[calc(90vh-80px)]">
          {/* Document Selector */}
          <div className="border-r border-border/50 p-4">
            <h3 className="text-sm font-medium mb-3">Select Documents</h3>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {documents.map(doc => (
                  <div 
                    key={doc.id}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                      selectedIds.includes(doc.id) ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => toggleDocument(doc.id)}
                  >
                    <Checkbox 
                      checked={selectedIds.includes(doc.id)} 
                      disabled={!selectedIds.includes(doc.id) && selectedIds.length >= 4}
                    />
                    <span className="text-sm truncate flex-1" title={doc.file_name}>
                      {doc.file_name.replace('.pdf', '')}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
            
            {selectedIds.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full mt-3"
                onClick={() => setSelectedIds([])}
              >
                Clear Selection
              </Button>
            )}
          </div>

          {/* Comparison Table */}
          <div className="p-4 overflow-auto">
            {selectedDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <GitCompare className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">Select documents from the left to compare</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Company Headers */}
                <div className="grid grid-cols-[180px_repeat(auto-fill,minmax(120px,1fr))] gap-2 pb-2 border-b border-border">
                  <div className="text-sm font-medium text-muted-foreground">Metric</div>
                  {metricsData.map((m, i) => (
                    <div key={i} className="text-sm font-semibold truncate" title={m.companyName}>
                      {m.companyName}
                      <span className="block text-xs font-normal text-muted-foreground">{m.period}</span>
                    </div>
                  ))}
                </div>

                {/* Revenue & Growth */}
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Revenue & Growth</h4>
                  <MetricRow 
                    label="Revenue" 
                    values={metricsData.map(m => m.revenue)} 
                    format="currency"
                    highlightBest="high"
                  />
                  <MetricRow 
                    label="Revenue YoY Growth" 
                    values={metricsData.map(m => m.revenueYoY)} 
                    format="percent"
                    highlightBest="high"
                  />
                </div>

                {/* Profitability */}
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Profitability</h4>
                  <MetricRow 
                    label="Gross Margin" 
                    values={metricsData.map(m => m.grossMargin)} 
                    format="percent"
                    highlightBest="high"
                  />
                  <MetricRow 
                    label="Operating Margin" 
                    values={metricsData.map(m => m.operatingMargin)} 
                    format="percent"
                    highlightBest="high"
                  />
                  <MetricRow 
                    label="Net Margin" 
                    values={metricsData.map(m => m.netMargin)} 
                    format="percent"
                    highlightBest="high"
                  />
                </div>

                {/* Cash Flow */}
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Cash Flow</h4>
                  <MetricRow 
                    label="Operating Cash Flow" 
                    values={metricsData.map(m => m.operatingCashFlow)} 
                    format="currency"
                    highlightBest="high"
                  />
                  <MetricRow 
                    label="Free Cash Flow" 
                    values={metricsData.map(m => m.freeCashFlow)} 
                    format="currency"
                    highlightBest="high"
                  />
                  <MetricRow 
                    label="FCF Margin" 
                    values={metricsData.map(m => m.fcfMargin)} 
                    format="percent"
                    highlightBest="high"
                  />
                </div>

                {/* Balance Sheet */}
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Balance Sheet</h4>
                  <MetricRow 
                    label="Cash & Equivalents" 
                    values={metricsData.map(m => m.cashAndEquivalents)} 
                    format="currency"
                    highlightBest="high"
                  />
                  <MetricRow 
                    label="Total Debt" 
                    values={metricsData.map(m => m.totalDebt)} 
                    format="currency"
                    highlightBest="low"
                  />
                  <MetricRow 
                    label="Net Cash Position" 
                    values={metricsData.map(m => m.netCash)} 
                    format="currency"
                    highlightBest="high"
                  />
                </div>

                <p className="text-[10px] text-muted-foreground text-center italic pt-4">
                  All metrics extracted directly from uploaded 10-K documents. No AI estimation or fabrication.
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};
