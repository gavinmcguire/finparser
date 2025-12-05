import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Trash2, Clock } from "lucide-react";
import { format } from "date-fns";

interface DocumentAnalysis {
  id: string;
  file_name: string;
  created_at: string;
  tables?: any[];
}

interface DocumentHistoryProps {
  documents: DocumentAnalysis[];
  onSelect: (doc: DocumentAnalysis) => void;
  onDelete: (id: string) => void;
  selectedId?: string;
}

export const DocumentHistory = ({ documents, onSelect, onDelete, selectedId }: DocumentHistoryProps) => {
  if (documents.length === 0) {
    return (
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recent Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          No saved documents yet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Recent Documents ({documents.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        <ScrollArea className="h-[200px]">
          <div className="space-y-1">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors ${
                  selectedId === doc.id ? 'bg-muted' : ''
                }`}
                onClick={() => onSelect(doc)}
              >
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" title={doc.file_name}>
                    {doc.file_name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(doc.created_at), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(doc.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
