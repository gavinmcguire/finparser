import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Trash2, Clock, FolderOpen } from "lucide-react";
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
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <h2 className="font-semibold text-sm">Recent Documents</h2>
        </div>
        <div className="py-8 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No saved documents yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-5 hover-lift">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Clock className="h-4 w-4 text-primary" />
        </div>
        <h2 className="font-semibold text-sm">Recent Documents</h2>
        <span className="ml-auto text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded-md">
          {documents.length}
        </span>
      </div>
      <ScrollArea className="h-[280px] -mx-2 px-2">
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                selectedId === doc.id 
                  ? 'bg-primary/10 border border-primary/30' 
                  : 'hover:bg-muted/50 border border-transparent'
              }`}
              onClick={() => onSelect(doc)}
            >
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                selectedId === doc.id ? 'bg-primary/20' : 'bg-muted'
              }`}>
                <FileText className={`h-4 w-4 ${selectedId === doc.id ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${selectedId === doc.id ? 'text-primary' : ''}`} title={doc.file_name}>
                  {doc.file_name}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {format(new Date(doc.created_at), 'MMM d, yyyy')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(doc.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};