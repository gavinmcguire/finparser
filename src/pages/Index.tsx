import { useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
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
      // Convert file to base64
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          
          // Call the edge function
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
          console.error("Error calling function:", error);
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
        description: "An unexpected error occurred",
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-3 text-foreground">
            IB PDF Extractor
          </h1>
          <p className="text-lg text-muted-foreground">
            Upload your PDF and extract table data instantly
          </p>
        </div>

        <Card className="p-8 mb-6">
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

        {response && (
          <div className="space-y-6">
            {response.azureMessage && (
              <Card className="p-6 border-primary/20 bg-primary/5">
                <h2 className="text-xl font-semibold mb-3 text-card-foreground flex items-center gap-2">
                  <span className="text-primary">✓</span>
                  Azure OpenAI Response
                </h2>
                <p className="text-card-foreground leading-relaxed">
                  {response.azureMessage}
                </p>
              </Card>
            )}

            {response.azureError && (
              <Card className="p-6 border-destructive/20 bg-destructive/5">
                <h2 className="text-xl font-semibold mb-3 text-destructive flex items-center gap-2">
                  <span>⚠</span>
                  Azure OpenAI Error
                </h2>
                <p className="text-destructive-foreground">
                  {response.azureError}
                </p>
              </Card>
            )}

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4 text-card-foreground">
                Full Response
              </h2>
              <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm text-muted-foreground">
                {JSON.stringify(response, null, 2)}
              </pre>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
