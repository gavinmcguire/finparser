import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
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
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <FileText className="h-5 w-5 text-primary" />
          Document Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">File Name</p>
            <p className="font-medium text-foreground">{fileName}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Tables Detected</p>
            <p className="font-medium text-foreground">
              {tableCount} extracted · {azureTableCount} detected by Azure
            </p>
          </div>
          <div className="md:col-span-2">
            <p className="text-sm text-muted-foreground mb-1">Text Extracted</p>
            <p className="font-medium text-foreground">
              {textLength.toLocaleString()} characters
            </p>
          </div>
        </div>

        {textPreview && (
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-foreground">Text Preview</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-7 text-xs"
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
              className={`bg-muted rounded-md p-3 overflow-auto transition-all ${
                isExpanded ? "max-h-96" : "max-h-24"
              }`}
            >
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                {textPreview}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
