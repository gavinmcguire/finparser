import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TableRenderer } from "./TableRenderer";
import { Download, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TableData {
  rowCount: number;
  columnCount: number;
  cells: Array<{
    rowIndex: number;
    columnIndex: number;
    content: string;
  }>;
}

interface TableExplorerProps {
  tables: TableData[];
}

const isJunkTable = (table: TableData): boolean => {
  if (!table || table.rowCount < 2 || !table.cells || !Array.isArray(table.cells)) return true;
  
  const totalCells = table.rowCount * table.columnCount;
  const emptyCells = table.cells.filter(cell => !cell.content || cell.content.trim() === "").length;
  const emptyPercentage = (emptyCells / totalCells) * 100;
  
  return emptyPercentage > 50;
};

const tableToCSV = (table: TableData): string => {
  const rows: string[][] = Array(table.rowCount).fill(null).map(() => Array(table.columnCount).fill(""));
  
  table.cells.forEach(cell => {
    rows[cell.rowIndex][cell.columnIndex] = cell.content || "";
  });
  
  return rows.map(row => 
    row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")
  ).join("\n");
};

export const TableExplorer = ({ tables = [] }: TableExplorerProps) => {
  const [selectedTableIndex, setSelectedTableIndex] = useState(0);
  const [showAllTables, setShowAllTables] = useState(false);
  const { toast } = useToast();

  // Ensure tables is always an array
  const safeTables = Array.isArray(tables) ? tables : [];

  const filteredTables = showAllTables 
    ? safeTables 
    : safeTables.filter(table => !isJunkTable(table));

  const displayedTables = filteredTables.map((table, originalIndex) => ({
    table,
    originalIndex: safeTables.indexOf(table)
  }));

  const selectedTable = displayedTables[selectedTableIndex];

  const handleDownloadCSV = () => {
    if (!selectedTable) return;
    
    const csv = tableToCSV(selectedTable.table);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `table-${selectedTable.originalIndex + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "Downloaded",
      description: `Table ${selectedTable.originalIndex + 1} downloaded as CSV`,
    });
  };

  const handleCopyToClipboard = async () => {
    if (!selectedTable) return;
    
    const csv = tableToCSV(selectedTable.table);
    await navigator.clipboard.writeText(csv);
    
    toast({
      title: "Copied",
      description: "Table copied to clipboard as CSV",
    });
  };

  if (safeTables.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No tables extracted
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Table Explorer</CardTitle>
          <div className="flex items-center gap-2">
            <Switch
              id="show-all"
              checked={showAllTables}
              onCheckedChange={setShowAllTables}
            />
            <Label htmlFor="show-all" className="text-sm cursor-pointer">
              Show all tables
            </Label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-[250px_1fr] gap-4">
          {/* Left sidebar - Table list */}
          <ScrollArea className="h-[600px] border rounded-lg">
            <div className="p-2 space-y-1">
              {displayedTables.map((item, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedTableIndex(index)}
                  className={`w-full text-left p-3 rounded-md transition-colors ${
                    selectedTableIndex === index
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="font-medium text-sm">
                    Table {item.originalIndex + 1}
                  </div>
                  <div className="text-xs opacity-80 mt-1">
                    {item.table.rowCount} × {item.table.columnCount}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>

          {/* Right side - Selected table */}
          <div className="space-y-3">
            {selectedTable && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">
                    Table {selectedTable.originalIndex + 1}
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadCSV}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyToClipboard}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </Button>
                  </div>
                </div>
                <ScrollArea className="h-[540px] border rounded-lg">
                  <TableRenderer table={selectedTable.table} />
                </ScrollArea>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
