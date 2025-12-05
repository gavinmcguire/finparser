import { Badge } from "@/components/ui/badge";
import { ClassifiedTable } from "@/lib/classifyTables";
import { TrendingUp, FileSpreadsheet, DollarSign, BarChart3 } from "lucide-react";

interface CoreFinancialStatementsProps {
  classifiedTables: ClassifiedTable[];
  onSelectTable: (originalIndex: number) => void;
  selectedIndex: number;
}

export const CoreFinancialStatements = ({
  classifiedTables,
  onSelectTable,
  selectedIndex
}: CoreFinancialStatementsProps) => {
  const incomeStatement = classifiedTables.find(t => t.type === 'income_statement');
  const balanceSheet = classifiedTables.find(t => t.type === 'balance_sheet');
  const cashFlow = classifiedTables.find(t => t.type === 'cash_flow');

  const coreStatements = [
    { data: incomeStatement, label: 'Income Statement', icon: TrendingUp, gradient: 'from-success/20 to-success/5', borderColor: 'border-success/30 hover:border-success/60', iconColor: 'text-success' },
    { data: balanceSheet, label: 'Balance Sheet', icon: FileSpreadsheet, gradient: 'from-primary/20 to-primary/5', borderColor: 'border-primary/30 hover:border-primary/60', iconColor: 'text-primary' },
    { data: cashFlow, label: 'Cash Flow', icon: DollarSign, gradient: 'from-warning/20 to-warning/5', borderColor: 'border-warning/30 hover:border-warning/60', iconColor: 'text-warning' },
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
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {coreStatements.map(({ data, label, icon: Icon, gradient, borderColor, iconColor }) => (
          <button
            key={label}
            onClick={() => data && onSelectTable(data.originalIndex)}
            disabled={!data}
            className={`
              p-5 rounded-xl border-2 text-left transition-all duration-300 hover-lift
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
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs bg-card/80 border-0">
                  Table {data.originalIndex + 1}
                </Badge>
                <span className="text-xs text-muted-foreground font-mono">
                  {data.table.rowCount || data.table.rows?.length || '?'}r × {data.table.columnCount || data.table.columns?.length || '?'}c
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Not detected</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};