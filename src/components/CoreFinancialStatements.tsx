import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClassifiedTable, FinancialStatementType, selectPrimaryStatements, SelectionReport } from "@/lib/classifyTables";
import { TrendingUp, FileSpreadsheet, DollarSign, BarChart3, ChevronDown, Star, AlertTriangle, Bug } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CoreFinancialStatementsProps {
  classifiedTables: ClassifiedTable[];
  onSelectTable: (originalIndex: number) => void;
  selectedIndex: number;
  onOverride?: (type: FinancialStatementType, table: ClassifiedTable) => void;
}

export const CoreFinancialStatements = ({
  classifiedTables,
  onSelectTable,
  selectedIndex,
  onOverride,
}: CoreFinancialStatementsProps) => {
  const [showDebug, setShowDebug] = useState(false);

  const { incomeStatement, balanceSheet, cashFlow, report } = useMemo(
    () => selectPrimaryStatements(classifiedTables),
    [classifiedTables]
  );

  const coreStatements: {
    data: ClassifiedTable | null;
    type: FinancialStatementType;
    label: string;
    icon: typeof TrendingUp;
    gradient: string;
    borderColor: string;
    iconColor: string;
    reportKey: keyof SelectionReport;
  }[] = [
    { data: incomeStatement, type: 'income_statement', label: 'Income Statement', icon: TrendingUp, gradient: 'from-success/20 to-success/5', borderColor: 'border-success/30 hover:border-success/60', iconColor: 'text-success', reportKey: 'incomeStatement' },
    { data: balanceSheet, type: 'balance_sheet', label: 'Balance Sheet', icon: FileSpreadsheet, gradient: 'from-primary/20 to-primary/5', borderColor: 'border-primary/30 hover:border-primary/60', iconColor: 'text-primary', reportKey: 'balanceSheet' },
    { data: cashFlow, type: 'cash_flow', label: 'Cash Flow', icon: DollarSign, gradient: 'from-warning/20 to-warning/5', borderColor: 'border-warning/30 hover:border-warning/60', iconColor: 'text-warning', reportKey: 'cashFlow' },
  ];

  const hasAnyCoreStatement = incomeStatement || balanceSheet || cashFlow;

  if (!hasAnyCoreStatement) {
    return null;
  }

  return (
    <div className="glass-card rounded-2xl p-5 animate-fade-in">
      <div className="flex items-center gap-2 mb-5">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
          <BarChart3 className="h-4 w-4 text-primary" />
        </div>
        <h2 className="font-semibold text-sm">Core Financial Statements</h2>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => setShowDebug(true)}
        >
          <Bug className="h-3 w-3 mr-1" />
          Selection Report
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {coreStatements.map(({ data, type, label, icon: Icon, gradient, borderColor, iconColor, reportKey }) => {
          const candidates = classifiedTables.filter(t => t.type === type);
          const hasAlternatives = candidates.length > 1;
          const reportEntries = report[reportKey];
          
          return (
            <div key={label} className="relative">
              <button
                onClick={() => data && onSelectTable(data.originalIndex)}
                disabled={!data}
                className={`
                  w-full p-5 rounded-xl border-2 text-left transition-all duration-300 hover-lift
                  ${data ? `bg-gradient-to-br ${gradient} ${borderColor}` : 'bg-muted/20 border-border/30 cursor-not-allowed opacity-50'}
                  ${data && selectedIndex === data.originalIndex ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
                `}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`h-10 w-10 rounded-lg ${data ? 'bg-card/80' : 'bg-muted'} flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 ${data ? iconColor : 'text-muted-foreground'}`} />
                  </div>
                  <span className={`font-semibold text-sm ${data ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {label}
                  </span>
                </div>
                {data ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs bg-card/80 border-0">
                      <Star className="h-2.5 w-2.5 mr-1 text-primary" />
                      Table {data.originalIndex + 1}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {data.table.rowCount || data.table.rows?.length || '?'}r × {data.table.columnCount || data.table.columns?.length || '?'}c
                    </span>
                    {candidates.length > 1 && (
                      <span className="text-[10px] text-muted-foreground">
                        ({candidates.length} candidates)
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Not detected</p>
                )}
              </button>

              {/* Override dropdown */}
              {hasAlternatives && data && onOverride && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 h-6 text-[10px] text-muted-foreground hover:text-foreground px-2"
                    >
                      Change
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    {candidates.map(candidate => {
                      const cr = reportEntries.find(r => r.originalIndex === candidate.originalIndex);
                      const isCurrent = data.originalIndex === candidate.originalIndex;
                      return (
                        <DropdownMenuItem
                          key={candidate.originalIndex}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOverride(type, candidate);
                          }}
                          className={`flex flex-col items-start gap-1 py-2 ${isCurrent ? 'bg-primary/10' : ''}`}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <span className="font-medium text-xs">Table {candidate.originalIndex + 1}</span>
                            {isCurrent && <Star className="h-3 w-3 text-primary" />}
                            {cr?.rejectionReason && <AlertTriangle className="h-3 w-3 text-warning" />}
                            <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                              Score: {cr?.totalScore.toFixed(1) ?? '?'}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {candidate.table.rows?.length || '?'} rows • {cr?.matchedAnchors.length || 0} anchors • {cr?.detectedPeriods.length || 0} periods
                          </span>
                          {cr?.rejectionReason && (
                            <span className="text-[9px] text-warning">{cr.rejectionReason}</span>
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>

      {/* Debug Selection Report Dialog */}
      <Dialog open={showDebug} onOpenChange={setShowDebug}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5 text-primary" />
              Statement Selection Report
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-6 p-1">
              {(['incomeStatement', 'balanceSheet', 'cashFlow'] as const).map(key => {
                const entries = report[key];
                const label = key === 'incomeStatement' ? 'Income Statement' : key === 'balanceSheet' ? 'Balance Sheet' : 'Cash Flow';
                return (
                  <div key={key}>
                    <h3 className="font-semibold text-sm mb-2">{label} ({entries.length} candidates)</h3>
                    {entries.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No candidates found</p>
                    ) : (
                      <div className="space-y-2">
                        {entries.sort((a, b) => b.totalScore - a.totalScore).map(cr => (
                          <div
                            key={cr.originalIndex}
                            className={`rounded-lg border p-3 text-xs space-y-1.5 ${
                              cr.isPrimary ? 'border-primary/50 bg-primary/5' : cr.rejectionReason ? 'border-destructive/30 bg-destructive/5' : 'border-border/50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">Table {cr.originalIndex + 1}</span>
                              {cr.isPrimary && <Badge className="text-[9px] h-4">PRIMARY</Badge>}
                              {cr.rejectionReason && <Badge variant="destructive" className="text-[9px] h-4">GATED</Badge>}
                              <span className="ml-auto font-mono font-bold">{cr.totalScore.toFixed(1)} pts</span>
                            </div>
                            <div className="grid grid-cols-5 gap-2 text-muted-foreground font-mono">
                              <span>Anchor: {cr.anchorScore.toFixed(1)}</span>
                              <span>Period: {cr.periodScore.toFixed(1)}</span>
                              <span>Density: {cr.densityScore.toFixed(1)}</span>
                              <span>Conf: {cr.confidenceScore.toFixed(1)}</span>
                              <span className="text-destructive">Penalty: -{cr.penaltyScore.toFixed(1)}</span>
                            </div>
                            <div className="text-muted-foreground">
                              <span className="text-foreground">Anchors:</span> {cr.matchedAnchors.join(', ') || 'none'}
                            </div>
                            <div className="text-muted-foreground">
                              <span className="text-foreground">Signatures:</span> {cr.matchedSignatures.join(', ') || 'none'}
                            </div>
                            <div className="text-muted-foreground">
                              <span className="text-foreground">Periods:</span> {cr.detectedPeriods.join(' | ') || 'none detected'}
                            </div>
                            {cr.rejectionReason && (
                              <div className="text-destructive font-medium">⛔ {cr.rejectionReason}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};
