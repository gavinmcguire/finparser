import { useState, useCallback } from "react";
import { Upload, FileText, X, FileUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onClearFile: () => void;
}

export const FileUpload = ({ onFileSelect, selectedFile, onClearFile }: FileUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === "application/pdf") {
        onFileSelect(file);
      } else {
        alert("Please upload a PDF file");
      }
    }
  }, [onFileSelect]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === "application/pdf") {
        onFileSelect(file);
      } else {
        alert("Please upload a PDF file");
      }
    }
  };

  return (
    <div
      className={cn(
        "relative border-2 border-dashed rounded-xl transition-all duration-300",
        isDragging
          ? "border-primary bg-primary/5 scale-[1.02]"
          : "border-border/50 hover:border-primary/50 bg-muted/30",
        selectedFile ? "p-4" : "p-8"
      )}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      {selectedFile ? (
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground truncate text-sm">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground font-mono">
              {(selectedFile.size / 1024).toFixed(2)} KB
            </p>
          </div>
          <button
            onClick={onClearFile}
            className="h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center">
          <div className={cn(
            "h-14 w-14 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300",
            isDragging 
              ? "bg-primary/20 scale-110" 
              : "bg-gradient-to-br from-primary/10 to-accent/10"
          )}>
            <FileUp className={cn(
              "h-7 w-7 transition-colors",
              isDragging ? "text-primary" : "text-muted-foreground"
            )} />
          </div>
          <h3 className="text-sm font-semibold mb-1 text-foreground">
            Drop PDF here
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            or click to browse
          </p>
          <label
            htmlFor="file-input"
            className="px-4 py-2 text-xs font-medium bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors cursor-pointer"
          >
            Select File
          </label>
          <input
            id="file-input"
            type="file"
            accept="application/pdf"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
};