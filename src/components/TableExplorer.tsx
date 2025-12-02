import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Copy, Table2, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface TableExplorerProps {
  tables: any[];
}

export const TableExplorer = ({ tables }: TableExplorerProps) => {
  const [selectedTableIndex, setSelectedTableIndex] = useState(0);
  const { toast } = useToast();

  const selectedTable = tables[selectedTableIndex];

  const copyTableToClipboard = () => {
    if (!selectedTable) return;
    
    navigator.clipboard.writeText(JSON.stringify(selectedTable, null, 2));
    toast({
      title: "Copied to clipboard",
      description: "Table data has been copied as JSON",
    });
  };

  const downloadTableAsCSV = () => {
    if (!selectedTable) return;

    try {
      // Convert table to CSV
      let csv = "";
      
      // Add headers if they exist
      if (selectedTable.cells && selectedTable.cells.length > 0) {
        const maxRow = Math.max(...selectedTable.cells.map((c: any) => c.rowIndex || 0));
        const maxCol = Math.max(...selectedTable.cells.map((c: any) => c.columnIndex || 0));
        
        // Create a 2D array
        const grid: string[][] = Array(maxRow + 1).fill(null).map(() => 
          Array(maxCol + 1).fill("")
        );
        
        // Fill the grid
        selectedTable.cells.forEach((cell: any) => {
          const row = cell.rowIndex || 0;
          const col = cell.columnIndex || 0;
          grid[row][col] = (cell.content || "").replace(/"/g, '""'); // Escape quotes
        });
        
        // Convert to CSV
        csv = grid.map(row => 
          row.map(cell => `"${cell}"`).join(",")
        ).join("\n");
      } else {
        csv = JSON.stringify(selectedTable, null, 2);
      }

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `table-${selectedTableIndex + 1}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Downloaded",
        description: "Table has been downloaded as CSV",
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Could not convert table to CSV format",
        variant: "destructive",
      });
    }
  };

  const renderTableContent = () => {
    if (!selectedTable) {
      return (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          No table selected
        </div>
      );
    }

    // Render as structured table if columns and rows exist
    if (selectedTable.columns && selectedTable.rows) {
      const columns = selectedTable.columns;
      const rows = selectedTable.rows;

      return (
        <div className="border rounded-lg overflow-hidden">
          <ScrollArea className="h-[500px] w-full">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((column: any, idx: number) => (
                      <TableHead key={idx} className="font-semibold bg-muted/50 whitespace-nowrap">
                        {column?.content || `Column ${idx + 1}`}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row: any, rowIdx: number) => (
                    <TableRow key={rowIdx}>
                      {row.cells?.map((cell: any, cellIdx: number) => (
                        <TableCell key={cellIdx} className="text-sm whitespace-nowrap">
                          {cell?.content || "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </div>
      );
    }

    // Fallback to JSON view
    return (
      <ScrollArea className="h-[500px] w-full">
        <pre className="text-xs text-foreground bg-muted/30 p-4 rounded-lg whitespace-pre-wrap">
          {JSON.stringify(selectedTable, null, 2)}
        </pre>
      </ScrollArea>
    );
  };

  if (!tables || tables.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Table2 className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No tables detected in this document</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Table List Sidebar */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-base">Tables ({tables.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <ScrollArea className="h-[500px]">
            <div className="space-y-1">
              {tables.map((table, index) => {
                const rowCount = table.rowCount || 
                  (table.cells ? Math.max(...table.cells.map((c: any) => (c.rowIndex || 0) + 1)) : 0);
                const colCount = table.columnCount || 
                  (table.cells ? Math.max(...table.cells.map((c: any) => (c.columnIndex || 0) + 1)) : 0);

                return (
                  <Button
                    key={index}
                    variant={selectedTableIndex === index ? "secondary" : "ghost"}
                    className="w-full justify-start text-left h-auto py-3 px-3"
                    onClick={() => setSelectedTableIndex(index)}
                  >
                    <div className="flex items-start gap-2 w-full">
                      <Table2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">Table {index + 1}</p>
                        <p className="text-xs text-muted-foreground">
                          {rowCount} rows · {colCount} cols
                        </p>
                      </div>
                      {selectedTableIndex === index && (
                        <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                      )}
                    </div>
                  </Button>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Table Detail View */}
      <Card className="lg:col-span-3">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Table {selectedTableIndex + 1} of {tables.length}
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={copyTableToClipboard}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadTableAsCSV}
              >
                <Download className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {renderTableContent()}
        </CardContent>
      </Card>
    </div>
  );
};
