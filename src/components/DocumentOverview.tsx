import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Table2, Type } from "lucide-react";

interface DocumentOverviewProps {
  fileName: string;
  tableCount: number;
  textLength: number;
  textPreview: string;
}

export const DocumentOverview = ({
  fileName,
  tableCount,
  textLength,
  textPreview,
}: DocumentOverviewProps) => {
  const [showFullText, setShowFullText] = useState(false);

  const displayText = showFullText
    ? textPreview
    : textPreview.substring(0, 500);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Document Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-muted-foreground">File:</span>
            <span className="text-foreground">{fileName}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Table2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-muted-foreground">Tables:</span>
            <span className="text-foreground">{tableCount}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Type className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-muted-foreground">Text Length:</span>
            <span className="text-foreground">{textLength.toLocaleString()} characters</span>
          </div>
        </div>

        <div className="border-t pt-4">
          <h3 className="text-sm font-medium mb-2">Text Preview</h3>
          <div className="bg-muted rounded-lg p-3 text-sm text-muted-foreground">
            <p className="whitespace-pre-wrap">{displayText}</p>
            {textPreview.length > 500 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFullText(!showFullText)}
                className="mt-2"
              >
                {showFullText ? "Show less" : "Show more"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
