import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, TrendingUp, TrendingDown, Minus, RefreshCw, Zap } from 'lucide-react';
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
  if (value > 0) return <TrendingUp className="h-4 w-4 text-success" />;
  if (value < 0) return <TrendingDown className="h-4 w-4 text-destructive" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function MetricCard({ label, value, subValue, trend }: { 
  label: string; 
  value: string; 
  subValue?: string;
  trend?: number | null;
}) {
  return (
    <div className="stat-card group">
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">{label}</p>
      <div className="flex items-center gap-2">
        <p className="text-xl font-bold font-mono text-foreground">{value}</p>
        {trend !== undefined && <TrendIndicator value={trend} />}
      </div>
      {subValue && (
        <p className={`text-xs mt-1 ${trend !== null && trend !== undefined ? (trend >= 0 ? 'text-success' : 'text-destructive') : 'text-muted-foreground'}`}>
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
    <div className="glass-card rounded-2xl p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-primary">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-mono">
              <span className="gradient-text">{metrics.companyName}</span>
              <span className="text-muted-foreground font-normal ml-2">– {metrics.period}</span>
            </h2>
            <p className="text-sm text-muted-foreground">AI Financial Snapshot</p>
          </div>
        </div>
        {!hasLoaded ? (
          <Button 
            onClick={generateAnalysis} 
            disabled={isLoading} 
            className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 glow-primary"
          >
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
          <Button onClick={generateAnalysis} disabled={isLoading} size="icon" variant="ghost" className="hover:bg-muted">
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
        <div className="border-t border-border/50 pt-5 animate-fade-in">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Analysis
          </h3>
          {bullets.length > 0 ? (
            <ul className="space-y-3">
              {bullets.map((bullet, idx) => (
                <li key={idx} className="text-sm text-muted-foreground flex items-start gap-3 bg-muted/30 rounded-lg p-3">
                  <span className="text-primary font-bold">•</span>
                  <span className="leading-relaxed">{bullet.replace(/^•\s*/, '')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-4">{analysis}</p>
          )}
        </div>
      )}

      {/* Loading state for analysis */}
      {isLoading && !hasLoaded && (
        <div className="border-t border-border/50 pt-5">
          <div className="flex items-center gap-3 text-sm text-muted-foreground bg-muted/30 rounded-lg p-4">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Generating AI analysis...
          </div>
        </div>
      )}
    </div>
  );
}