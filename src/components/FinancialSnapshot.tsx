import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { FinancialMetrics, hasMinimumMetrics } from '@/lib/extractFinancialMetrics';
import { useToast } from '@/hooks/use-toast';

interface FinancialSnapshotProps {
  metrics: FinancialMetrics;
}

function formatCurrency(value: number | null): string {
  if (value === null) return '—';
  const absValue = Math.abs(value);
  if (absValue >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (absValue >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (absValue >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${value.toFixed(1)}%`;
}

function TrendIndicator({ value }: { value: number | null }) {
  if (value === null) return null;
  if (value > 0) return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  if (value < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function MetricCard({ label, value, subValue, trend }: { 
  label: string; 
  value: string; 
  subValue?: string;
  trend?: number | null;
}) {
  return (
    <div className="bg-muted/50 rounded-lg p-3 space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="flex items-center gap-2">
        <p className="text-lg font-semibold text-foreground">{value}</p>
        {trend !== undefined && <TrendIndicator value={trend} />}
      </div>
      {subValue && (
        <p className={`text-xs ${trend !== null && trend !== undefined ? (trend >= 0 ? 'text-emerald-600' : 'text-red-600') : 'text-muted-foreground'}`}>
          {subValue}
        </p>
      )}
    </div>
  );
}

export function FinancialSnapshot({ metrics }: FinancialSnapshotProps) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const { toast } = useToast();

  // Reset when metrics change
  useEffect(() => {
    setAnalysis(null);
    setHasLoaded(false);
  }, [metrics.companyName, metrics.period]);

  const generateAnalysis = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-snapshot', {
        body: { metrics },
      });

      if (error) throw error;
      setAnalysis(data.analysis);
      setHasLoaded(true);
    } catch (error) {
      console.error('Error generating analysis:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate AI analysis',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!hasMinimumMetrics(metrics)) {
    return null;
  }

  const bullets = analysis?.split('\n').filter(line => line.trim().startsWith('•')) || [];

  return (
    <Card className="p-6 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {metrics.companyName} – {metrics.period}
            </h2>
            <p className="text-sm text-muted-foreground">AI Financial Snapshot</p>
          </div>
        </div>
        {!hasLoaded ? (
          <Button onClick={generateAnalysis} disabled={isLoading} size="sm" variant="outline">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Analysis
              </>
            )}
          </Button>
        ) : (
          <Button onClick={generateAnalysis} disabled={isLoading} size="sm" variant="ghost">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        <MetricCard 
          label="Revenue" 
          value={formatCurrency(metrics.revenue)} 
          subValue={metrics.revenueYoY !== null ? `${metrics.revenueYoY >= 0 ? '+' : ''}${formatPercent(metrics.revenueYoY)} YoY` : undefined}
          trend={metrics.revenueYoY}
        />
        <MetricCard 
          label="Gross Margin" 
          value={formatPercent(metrics.grossMargin)} 
        />
        <MetricCard 
          label="Operating Margin" 
          value={formatPercent(metrics.operatingMargin)} 
        />
        <MetricCard 
          label="Net Margin" 
          value={formatPercent(metrics.netMargin)} 
        />
        <MetricCard 
          label="Free Cash Flow" 
          value={formatCurrency(metrics.freeCashFlow)} 
          subValue={metrics.fcfMargin !== null ? `${formatPercent(metrics.fcfMargin)} margin` : undefined}
        />
        <MetricCard 
          label="Cash & Equiv" 
          value={formatCurrency(metrics.cashAndEquivalents)} 
        />
        <MetricCard 
          label="Net Cash" 
          value={formatCurrency(metrics.netCash)} 
          trend={metrics.netCash}
        />
      </div>

      {/* AI Analysis */}
      {hasLoaded && (
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Analysis
          </h3>
          {bullets.length > 0 ? (
            <ul className="space-y-2">
              {bullets.map((bullet, idx) => (
                <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{bullet.replace(/^•\s*/, '')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{analysis}</p>
          )}
        </div>
      )}

      {/* Loading state for analysis */}
      {isLoading && !hasLoaded && (
        <div className="border-t border-border pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating AI analysis...
          </div>
        </div>
      )}
    </Card>
  );
}
