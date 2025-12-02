import { useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { DocumentOverview } from "@/components/DocumentOverview";
import { TableExplorer } from "@/components/TableExplorer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const { toast } = useToast();

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setResponse(null);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setResponse(null);
  };

  const handleExtractTables = async () => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please upload a PDF file first",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setResponse(null);

    try {
      // Convert PDF to base64 and send to backend
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          
          const { data, error } = await supabase.functions.invoke("extract-pdf", {
            body: {
              fileName: selectedFile.name,
              fileData: base64Data,
            },
          });

          if (error) throw error;

          setResponse(data);
          toast({
            title: "Success",
            description: "PDF processed successfully",
          });
        } catch (error) {
          console.error("Error:", error);
          toast({
            title: "Error",
            description: "Failed to process PDF",
            variant: "destructive",
          });
        } finally {
          setIsProcessing(false);
        }
      };

      reader.onerror = () => {
        toast({
          title: "Error",
          description: "Failed to read file",
          variant: "destructive",
        });
        setIsProcessing(false);
      };
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: "Failed to process PDF",
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Financial Document Analyzer
              </h1>
              <p className="text-sm text-muted-foreground">
                Extract and analyze tables from SEC filings and financial documents
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Upload Section */}
        <Card className="p-6 mb-8 border-primary/20">
          <FileUpload
            onFileSelect={handleFileSelect}
            selectedFile={selectedFile}
            onClearFile={handleClearFile}
          />

          {selectedFile && (
            <Button
              onClick={handleExtractTables}
              disabled={isProcessing}
              className="w-full mt-6"
              size="lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Analyzing Document...
                </>
              ) : (
                "Analyze Document"
              )}
            </Button>
          )}
        </Card>

        {/* Results Section */}
        {response && (
          <div className="space-y-6">
            {/* Document Overview */}
            <DocumentOverview
              fileName={response.fileName || selectedFile?.name || "Unknown"}
              tableCount={response.tablesCount || 0}
              azureTableCount={response.azureTablesCount || 0}
              textLength={response.pdfText?.length || 0}
              textPreview={response.pdfTextPreview || response.pdfText?.substring(0, 500)}
            />

            {/* Table Explorer */}
            {response.tables && response.tables.length > 0 && (
              <TableExplorer tables={response.tables} />
            )}

            {/* Error Display */}
            {response.azureError && (
              <Card className="p-6 border-destructive/20 bg-destructive/5">
                <h2 className="text-lg font-semibold mb-2 text-destructive flex items-center gap-2">
                  <span>⚠</span>
                  Processing Error
                </h2>
                <p className="text-sm text-destructive-foreground">
                  {response.azureError}
                </p>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
