import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Copy, Table2, CheckCircle2, Sparkles, Loader2, Grid3X3 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DerivedMetrics } from "./DerivedMetrics";
import { ClassifiedTable, getStatementLabel } from "@/lib/classifyTables";
import { Badge } from "@/components/ui/badge";

interface TableExplorerProps {
  tables: any[];
  documentName?: string;
  classifiedTables?: ClassifiedTable[];
  selectedTableIndex?: number;
  onSelectTable?: (index: number) => void;
}

export const TableExplorer = ({ 
  tables, 
  documentName = "Document",
  classifiedTables = [],
  selectedTableIndex: externalSelectedIndex,
  onSelectTable
}: TableExplorerProps) => {
  const [internalSelectedIndex, setInternalSelectedIndex] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const { toast } = useToast();

  const selectedTableIndex = externalSelectedIndex !== undefined ? externalSelectedIndex : internalSelectedIndex;
  const setSelectedTableIndex = onSelectTable || setInternalSelectedIndex;

  const selectedTable = tables[selectedTableIndex];

  const sanitizeText = (text: string): string => {
    if (!text) return text;
    return text
      .replace(/â€"/g, '-')
      .replace(/â€"/g, '-')
      .replace(/—/g, '-')
      .replace(/–/g, '-')
      .replace(/―/g, '-')
      .replace(/‐/g, '-')
      .replace(/‑/g, '-')
      .replace(/‒/g, '-')
      .replace(/â€™/g, "'")
      .replace(/'/g, "'")
      .replace(/'/g, "'")
      .replace(/â€œ/g, '"')
      .replace(/â€/g, '"')
      .replace(/"/g, '"')
      .replace(/"/g, '"')
      .replace(/\u00A0/g, ' ');
  };

  const getNormalizedData = (table: any) => {
    let columns = table.columns || [];
    let rows = table.rows || [];

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
      
      const isSectionHeader = (row: string[]): boolean => {
        if (!row || row.length === 0) return false;
        const firstCell = sanitizeText(row[0])?.trim();
        if (!firstCell) return false;
        return row.slice(1).every((cell: string) => !sanitizeText(cell)?.trim());
      };

      const formatCell = (cell: string): string => {
        const sanitized = sanitizeText(cell) || "";
        return `"${sanitized.replace(/"/g, '""')}"`;
      };

      const csvRows = [
        columns.map((c: string) => formatCell(c)).join(","),
        ...rows.map((row: string[]) => {
          if (isSectionHeader(row)) {
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
        <div className="border border-border/50 rounded-xl overflow-auto max-h-[400px] bg-muted/20">
          <Table className="min-w-max">
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                {columns.map((column: string, idx: number) => (
                  <TableHead
                    key={idx}
                    className="font-semibold bg-muted/50 whitespace-nowrap sticky top-0 text-xs"
                  >
                    {sanitizeText(column) || `Column ${idx + 1}`}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row: string[], rowIdx: number) => (
                <TableRow key={rowIdx} className="border-border/30 hover:bg-muted/30">
                  {row.map((cell: string, cellIdx: number) => (
                    <TableCell
                      key={cellIdx}
                      className="text-xs whitespace-nowrap font-mono"
                    >
                      {sanitizeText(cell) || "-"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    }

    return (
      <ScrollArea className="h-[400px] w-full">
        <pre className="text-xs text-foreground bg-muted/30 p-4 rounded-xl whitespace-pre-wrap font-mono">
          {JSON.stringify(selectedTable, null, 2)}
        </pre>
      </ScrollArea>
    );
  };

  const handleTableSelect = (index: number) => {
    setSelectedTableIndex(index);
    setAnalysis(null);
  };

  if (!tables || tables.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center">
        <Table2 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
        <p className="text-muted-foreground">No tables detected in this document</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-fade-in">
      {/* Table List Sidebar */}
      <div className="glass-card rounded-2xl p-4 lg:col-span-2">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center">
            <Grid3X3 className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <h3 className="text-xs font-semibold">Tables</h3>
          <span className="ml-auto text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
            {tables.length}
          </span>
        </div>
        <ScrollArea className="h-[420px]">
          <div className="space-y-1.5">
            {tables.map((table, index) => {
              const classified = classifiedTables.find(c => c.originalIndex === index);
              const isCore = classified && classified.type !== 'other';
              
              const rowCount = table.rowCount || 
                (table.cells ? Math.max(...table.cells.map((c: any) => (c.rowIndex || 0) + 1)) : table.rows?.length || 0);
              const colCount = table.columnCount || 
                (table.cells ? Math.max(...table.cells.map((c: any) => (c.columnIndex || 0) + 1)) : table.columns?.length || 0);

              return (
                <Button
                  key={index}
                  variant="ghost"
                  className={`w-full justify-start text-left h-auto py-2.5 px-3 rounded-lg transition-all ${
                    selectedTableIndex === index 
                      ? 'bg-primary/10 border border-primary/30 text-primary' 
                      : 'hover:bg-muted/50 border border-transparent'
                  } ${isCore ? 'opacity-60' : ''}`}
                  onClick={() => handleTableSelect(index)}
                >
                  <div className="flex items-center gap-2 w-full">
                    <Table2 className={`h-3.5 w-3.5 flex-shrink-0 ${selectedTableIndex === index ? 'text-primary' : ''}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-xs">Table {index + 1}</p>
                        {isCore && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-primary/30 text-primary">
                            {getStatementLabel(classified.type).split(' ')[0]}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono">
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
      </div>

      {/* Table Detail View */}
      <div className="glass-card rounded-2xl p-5 lg:col-span-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">
              Table {selectedTableIndex + 1}
            </h3>
            {(() => {
              const classified = classifiedTables.find(c => c.originalIndex === selectedTableIndex);
              if (classified && classified.type !== 'other') {
                return (
                  <Badge variant="secondary" className="text-[10px]">
                    {getStatementLabel(classified.type)}
                  </Badge>
                );
              }
              return null;
            })()}
          </div>
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs hover:bg-muted"
              onClick={copyTableToClipboard}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs hover:bg-muted"
              onClick={downloadTableAsCSV}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              CSV
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
              onClick={analyzeWithAI}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              Analyze
            </Button>
          </div>
        </div>
        <div className="space-y-4">
          {renderTableContent()}
          {selectedTable && (() => {
            const { columns, rows } = getNormalizedData(selectedTable);
            return <DerivedMetrics columns={columns} rows={rows} />;
          })()}
        </div>
      </div>

      {/* AI Analysis Panel */}
      <div className="glass-card rounded-2xl p-5 lg:col-span-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold">AI Analysis</h3>
        </div>
        <ScrollArea className="h-[420px]">
          {isAnalyzing ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
              <p className="text-sm">Analyzing table...</p>
            </div>
          ) : analysis ? (
            <div className="space-y-3">
              {analysis.split('\n').map((line, i) => {
                if (line.startsWith('**') && line.endsWith('**')) {
                  return (
                    <h4 key={i} className="font-semibold text-foreground mt-4 text-sm">
                      {line.replace(/\*\*/g, '')}
                    </h4>
                  );
                }
                if (line.startsWith('- ') || line.startsWith('• ')) {
                  return (
                    <p key={i} className="text-sm text-muted-foreground pl-4 flex items-start gap-2">
                      <span className="text-primary">•</span>
                      <span>{line.replace(/^[-•]\s*/, '')}</span>
                    </p>
                  );
                }
                if (line.trim()) {
                  return (
                    <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                      {line}
                    </p>
                  );
                }
                return null;
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <Sparkles className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-center">
                Click "Analyze" to get AI-powered<br />insights on the selected table
              </p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
};