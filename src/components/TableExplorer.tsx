import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Copy, Table2, CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface TableExplorerProps {
  tables: any[];
  documentName?: string;
}

export const TableExplorer = ({ tables, documentName = "Document" }: TableExplorerProps) => {
  const [selectedTableIndex, setSelectedTableIndex] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const { toast } = useToast();

  const selectedTable = tables[selectedTableIndex];

  // Sanitize text: replace weird unicode dashes and garbled characters
  const sanitizeText = (text: string): string => {
    if (!text) return text;
    return text
      .replace(/â€"/g, '-')  // garbled em dash
      .replace(/â€"/g, '-')  // garbled en dash
      .replace(/—/g, '-')    // em dash
      .replace(/–/g, '-')    // en dash
      .replace(/―/g, '-')    // horizontal bar
      .replace(/‐/g, '-')    // hyphen
      .replace(/‑/g, '-')    // non-breaking hyphen
      .replace(/‒/g, '-')    // figure dash
      .replace(/â€™/g, "'")  // garbled apostrophe
      .replace(/'/g, "'")    // right single quote
      .replace(/'/g, "'")    // left single quote
      .replace(/â€œ/g, '"')  // garbled left quote
      .replace(/â€/g, '"')   // garbled right quote
      .replace(/"/g, '"')    // left double quote
      .replace(/"/g, '"')    // right double quote
      .replace(/\u00A0/g, ' '); // non-breaking space
  };

  // Get normalized columns and rows
  const getNormalizedData = (table: any) => {
    let columns = table.columns || [];
    let rows = table.rows || [];

    // If columns/rows are empty but cells exist, derive from cells
    if ((!columns.length || !rows.length) && table.cells?.length > 0) {
      const maxRow = Math.max(...table.cells.map((c: any) => c.rowIndex || 0));
      const maxCol = Math.max(...table.cells.map((c: any) => c.columnIndex || 0));

      const grid: string[][] = Array(maxRow + 1)
        .fill(null)
        .map(() => Array(maxCol + 1).fill(""));

      table.cells.forEach((cell: any) => {
        grid[cell.rowIndex || 0][cell.columnIndex || 0] = cell.content || "";
      });

      columns = grid[0] || [];
      rows = grid.slice(1);
    }

    return { columns, rows };
  };

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
      const { columns, rows } = getNormalizedData(selectedTable);
      
      // Detect if a row is a section header (first cell has text, rest are blank)
      const isSectionHeader = (row: string[]): boolean => {
        if (!row || row.length === 0) return false;
        const firstCell = sanitizeText(row[0])?.trim();
        if (!firstCell) return false;
        // Check if all other cells are empty
        return row.slice(1).every((cell: string) => !sanitizeText(cell)?.trim());
      };

      // Format cell for CSV with sanitization
      const formatCell = (cell: string): string => {
        const sanitized = sanitizeText(cell) || "";
        return `"${sanitized.replace(/"/g, '""')}"`;
      };

      // Build CSV with section header detection
      const csvRows = [
        columns.map((c: string) => formatCell(c)).join(","),
        ...rows.map((row: string[]) => {
          if (isSectionHeader(row)) {
            // Mark section headers with ">> " prefix for visibility in Excel
            const headerText = sanitizeText(row[0])?.trim() || "";
            return [`">> ${headerText.replace(/"/g, '""')}"`, ...row.slice(1).map(() => '""')].join(",");
          }
          return row.map((cell: string) => formatCell(cell)).join(",");
        })
      ];
      const csv = csvRows.join("\n");

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

  const analyzeWithAI = async () => {
    if (!selectedTable) return;

    setIsAnalyzing(true);
    setAnalysis(null);

    try {
      const { columns, rows } = getNormalizedData(selectedTable);

      const { data, error } = await supabase.functions.invoke('analyze-table', {
        body: {
          documentName,
          tableIndex: selectedTableIndex + 1,
          columns,
          rows
        }
      });

      if (error) throw error;

      if (data?.success) {
        setAnalysis(data.analysis);
        toast({
          title: "Analysis complete",
          description: "AI has analyzed the table",
        });
      } else {
        throw new Error(data?.error || 'Analysis failed');
      }
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis failed",
        description: error.message || "Could not analyze table",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
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

    const { columns, rows } = getNormalizedData(selectedTable);

    if (columns.length > 0) {
      return (
        <div className="border rounded-lg overflow-hidden">
          <ScrollArea className="h-[400px] w-full">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((column: string, idx: number) => (
                      <TableHead
                        key={idx}
                        className="font-semibold bg-muted/50 whitespace-nowrap"
                      >
                        {sanitizeText(column) || `Column ${idx + 1}`}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row: string[], rowIdx: number) => (
                    <TableRow key={rowIdx}>
                      {row.map((cell: string, cellIdx: number) => (
                        <TableCell
                          key={cellIdx}
                          className="text-sm whitespace-nowrap"
                        >
                          {sanitizeText(cell) || "-"}
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
      <ScrollArea className="h-[400px] w-full">
        <pre className="text-xs text-foreground bg-muted/30 p-4 rounded-lg whitespace-pre-wrap">
          {JSON.stringify(selectedTable, null, 2)}
        </pre>
      </ScrollArea>
    );
  };

  // Clear analysis when table changes
  const handleTableSelect = (index: number) => {
    setSelectedTableIndex(index);
    setAnalysis(null);
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Table List Sidebar */}
      <Card className="lg:col-span-2">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium">Tables ({tables.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <ScrollArea className="h-[450px]">
            <div className="space-y-1">
              {tables.map((table, index) => {
                const rowCount = table.rowCount || 
                  (table.cells ? Math.max(...table.cells.map((c: any) => (c.rowIndex || 0) + 1)) : table.rows?.length || 0);
                const colCount = table.columnCount || 
                  (table.cells ? Math.max(...table.cells.map((c: any) => (c.columnIndex || 0) + 1)) : table.columns?.length || 0);

                return (
                  <Button
                    key={index}
                    variant={selectedTableIndex === index ? "secondary" : "ghost"}
                    className="w-full justify-start text-left h-auto py-2 px-2"
                    onClick={() => handleTableSelect(index)}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <Table2 className="h-3.5 w-3.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs">Table {index + 1}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {rowCount}r × {colCount}c
                        </p>
                      </div>
                      {selectedTableIndex === index && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
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
      <Card className="lg:col-span-5">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Table {selectedTableIndex + 1}
            </CardTitle>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={copyTableToClipboard}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={downloadTableAsCSV}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                CSV
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={analyzeWithAI}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                )}
                Analyze
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {renderTableContent()}
        </CardContent>
      </Card>

      {/* AI Analysis Panel */}
      <Card className="lg:col-span-5">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ScrollArea className="h-[400px]">
            {isAnalyzing ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-4" />
                <p className="text-sm">Analyzing table...</p>
              </div>
            ) : analysis ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {analysis.split('\n').map((line, i) => {
                    if (line.startsWith('**') && line.endsWith('**')) {
                      return (
                        <h3 key={i} className="font-semibold text-foreground mt-4 mb-2 text-sm">
                          {line.replace(/\*\*/g, '')}
                        </h3>
                      );
                    }
                    if (line.startsWith('- ') || line.startsWith('• ')) {
                      return (
                        <p key={i} className="ml-4 text-muted-foreground mb-1">
                          {line}
                        </p>
                      );
                    }
                    if (line.trim()) {
                      return (
                        <p key={i} className="text-muted-foreground mb-2">
                          {line}
                        </p>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Sparkles className="h-8 w-8 mb-4 opacity-50" />
                <p className="text-sm text-center">
                  Click "Analyze" to get AI-powered<br />insights on the selected table
                </p>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
