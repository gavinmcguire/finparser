import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClassifiedTable, getStatementLabel, getStatementIcon } from "@/lib/classifyTables";
import { TrendingUp, FileSpreadsheet, DollarSign } from "lucide-react";

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
    { data: incomeStatement, label: 'Income Statement', icon: TrendingUp, color: 'bg-green-500/10 border-green-500/30 hover:border-green-500/50' },
    { data: balanceSheet, label: 'Balance Sheet', icon: FileSpreadsheet, color: 'bg-blue-500/10 border-blue-500/30 hover:border-blue-500/50' },
    { data: cashFlow, label: 'Cash Flow Statement', icon: DollarSign, color: 'bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50' },
  ];

  const hasAnyCoreStatement = incomeStatement || balanceSheet || cashFlow;

  if (!hasAnyCoreStatement) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium">Core Financial Statements</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {coreStatements.map(({ data, label, icon: Icon, color }) => (
            <button
              key={label}
              onClick={() => data && onSelectTable(data.originalIndex)}
              disabled={!data}
              className={`
                p-4 rounded-lg border-2 text-left transition-all
                ${data ? color : 'bg-muted/30 border-muted cursor-not-allowed'}
                ${data && selectedIndex === data.originalIndex ? 'ring-2 ring-primary ring-offset-2' : ''}
              `}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`h-5 w-5 ${data ? 'text-foreground' : 'text-muted-foreground'}`} />
                <span className={`font-medium text-sm ${data ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {label}
                </span>
              </div>
              {data ? (
                <div className="space-y-1">
                  <Badge variant="secondary" className="text-[10px]">
                    Table {data.originalIndex + 1}
                  </Badge>
                  <p className="text-[10px] text-muted-foreground">
                    {data.table.rowCount || data.table.rows?.length || '?'} rows × {data.table.columnCount || data.table.columns?.length || '?'} cols
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Not detected</p>
              )}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
