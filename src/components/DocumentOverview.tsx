import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, FileText, Table2, Type, Zap } from "lucide-react";
import { useState } from "react";

interface DocumentOverviewProps {
  fileName: string;
  tableCount: number;
  azureTableCount: number;
  textLength: number;
  textPreview?: string;
}

export const DocumentOverview = ({
  fileName,
  tableCount,
  azureTableCount,
  textLength,
  textPreview,
}: DocumentOverviewProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-lg">Document Overview</h2>
          <p className="text-sm text-muted-foreground truncate max-w-md" title={fileName}>{fileName}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Table2 className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Tables</span>
          </div>
          <p className="text-2xl font-bold font-mono">{tableCount}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {azureTableCount} detected
          </p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Type className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground">Characters</span>
          </div>
          <p className="text-2xl font-bold font-mono">{(textLength / 1000).toFixed(1)}k</p>
          <p className="text-xs text-muted-foreground mt-1">
            text extracted
          </p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-success" />
            <span className="text-xs text-muted-foreground">Status</span>
          </div>
          <p className="text-lg font-bold text-success">Ready</p>
          <p className="text-xs text-muted-foreground mt-1">
            analysis complete
          </p>
        </div>
      </div>

      {/* Text Preview */}
      {textPreview && (
        <div className="border-t border-border/50 pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <Type className="h-4 w-4 text-muted-foreground" />
              Text Preview
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-8 text-xs hover:bg-muted"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Expand
                </>
              )}
            </Button>
          </div>
          <div
            className={`bg-muted/50 rounded-xl p-4 overflow-auto transition-all border border-border/30 ${
              isExpanded ? "max-h-96" : "max-h-24"
            }`}
          >
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
              {textPreview}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};