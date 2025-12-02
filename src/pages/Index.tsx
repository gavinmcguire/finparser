import { useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { DocumentOverview } from "@/components/DocumentOverview";
import { TableExplorer } from "@/components/TableExplorer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
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
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-3 text-foreground">
            IB PDF Extractor
          </h1>
          <p className="text-lg text-muted-foreground">
            Upload your PDF and extract table data instantly
          </p>
        </div>

        {/* Upload Section */}
        <Card className="p-8 mb-6 max-w-4xl mx-auto">
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
                  Processing...
                </>
              ) : (
                "Extract Tables"
              )}
            </Button>
          )}
        </Card>

        {/* Dashboard Layout */}
        {response && (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Left Column - Document Overview */}
            <div>
              <DocumentOverview
                fileName={response.fileName || selectedFile?.name || "Unknown"}
                tableCount={response.tables?.length || 0}
                textLength={response.pdfText?.length || 0}
                textPreview={response.pdfText || ""}
              />
            </div>

            {/* Right Column - Table Explorer */}
            <div className="lg:col-span-1">
              <TableExplorer tables={response.tables || []} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
