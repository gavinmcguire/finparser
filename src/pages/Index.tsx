import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FileUpload } from "@/components/FileUpload";
import { DocumentOverview } from "@/components/DocumentOverview";
import { TableExplorer } from "@/components/TableExplorer";
import { DocumentHistory } from "@/components/DocumentHistory";
import { CoreFinancialStatements } from "@/components/CoreFinancialStatements";
import { FinancialSnapshot } from "@/components/FinancialSnapshot";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, TrendingUp, LogOut, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { classifyAllTables, ClassifiedTable } from "@/lib/classifyTables";
import { extractFinancialMetrics, FinancialMetrics } from "@/lib/extractFinancialMetrics";
import { useAuth } from "@/contexts/AuthContext";

interface DocumentAnalysis {
  id: string;
  file_name: string;
  pdf_text: string | null;
  tables: any;
  equity_summary: any;
  financials: any;
  summary: string | null;
  created_at: string;
}

const Index = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [savedDocuments, setSavedDocuments] = useState<DocumentAnalysis[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>();
  const [selectedTableIndex, setSelectedTableIndex] = useState(0);
  const [classifiedTables, setClassifiedTables] = useState<ClassifiedTable[]>([]);
  const { toast } = useToast();
  const { signOut, isAdmin, profile, user } = useAuth();
  const navigate = useNavigate();

  // Load saved documents on mount
  useEffect(() => {
    loadSavedDocuments();
  }, []);

  // Classify tables when response changes
  useEffect(() => {
    if (response?.tables && response.tables.length > 0) {
      const classified = classifyAllTables(response.tables);
      setClassifiedTables(classified);
    } else {
      setClassifiedTables([]);
    }
  }, [response?.tables]);

  // Compute financial metrics from classified tables
  const financialMetrics = useMemo<FinancialMetrics | null>(() => {
    if (classifiedTables.length === 0 || !response?.fileName) return null;
    return extractFinancialMetrics(classifiedTables, response.fileName);
  }, [classifiedTables, response?.fileName]);

  const loadSavedDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('document_analyses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setSavedDocuments(data || []);
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  };

  const saveDocumentAnalysis = async (data: any, fileName: string) => {
    if (!user) return;
    
    try {
      const { error } = await supabase.from('document_analyses').insert({
        file_name: fileName,
        pdf_text: data.pdfText || null,
        tables: data.tables || null,
        equity_summary: data.equitySummary || null,
        financials: data.financials || null,
        summary: data.summary || null,
        user_id: user.id,
      });

      if (error) throw error;
      await loadSavedDocuments();
    } catch (error) {
      console.error('Error saving document:', error);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      const { error } = await supabase
        .from('document_analyses')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      if (selectedDocId === id) {
        setSelectedDocId(undefined);
        setResponse(null);
      }
      
      await loadSavedDocuments();
      toast({
        title: "Document deleted",
        description: "The document has been removed from history",
      });
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive",
      });
    }
  };

  const handleSelectSavedDocument = (doc: DocumentAnalysis) => {
    setSelectedDocId(doc.id);
    setSelectedFile(null);
    setSelectedTableIndex(0);
    setResponse({
      success: true,
      fileName: doc.file_name,
      pdfText: doc.pdf_text,
      tables: doc.tables || [],
      tablesCount: doc.tables?.length || 0,
      equitySummary: doc.equity_summary,
      financials: doc.financials,
      summary: doc.summary,
    });
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setSelectedDocId(undefined);
    setResponse(null);
    setSelectedTableIndex(0);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setSelectedDocId(undefined);
    setResponse(null);
    setSelectedTableIndex(0);
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
    setSelectedDocId(undefined);

    try {
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
          
          // Auto-save the analysis
          await saveDocumentAnalysis(data, selectedFile.name);
          
          toast({
            title: "Success",
            description: "PDF processed and saved",
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
          <div className="flex items-center justify-between">
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
            <div className="flex items-center gap-3">
              {profile && (
                <span className="text-sm text-muted-foreground hidden sm:inline">
                  {profile.email}
                </span>
              )}
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>
                  <Shield className="h-4 w-4 mr-2" />
                  Admin
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Upload & History */}
          <div className="space-y-6">
            {/* Upload Section */}
            <Card className="p-4 border-primary/20">
              <FileUpload
                onFileSelect={handleFileSelect}
                selectedFile={selectedFile}
                onClearFile={handleClearFile}
              />

              {selectedFile && (
                <Button
                  onClick={handleExtractTables}
                  disabled={isProcessing}
                  className="w-full mt-4"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    "Analyze Document"
                  )}
                </Button>
              )}
            </Card>

            {/* Document History */}
            <DocumentHistory
              documents={savedDocuments}
              onSelect={handleSelectSavedDocument}
              onDelete={handleDeleteDocument}
              selectedId={selectedDocId}
            />
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3 space-y-6">
            {response ? (
              <>
                {/* AI Financial Snapshot */}
                {financialMetrics && (
                  <FinancialSnapshot metrics={financialMetrics} />
                )}

                {/* Document Overview */}
                <DocumentOverview
                  fileName={response.fileName || selectedFile?.name || "Unknown"}
                  tableCount={response.tablesCount || response.tables?.length || 0}
                  azureTableCount={response.azureTablesCount || 0}
                  textLength={response.pdfText?.length || 0}
                  textPreview={response.pdfTextPreview || response.pdfText?.substring(0, 500)}
                />

                {/* Core Financial Statements */}
                {classifiedTables.length > 0 && (
                  <CoreFinancialStatements
                    classifiedTables={classifiedTables}
                    onSelectTable={setSelectedTableIndex}
                    selectedIndex={selectedTableIndex}
                  />
                )}

                {/* Table Explorer */}
                {response.tables && response.tables.length > 0 && (
                  <TableExplorer 
                    tables={response.tables}
                    documentName={response.fileName || selectedFile?.name || "Document"}
                    classifiedTables={classifiedTables}
                    selectedTableIndex={selectedTableIndex}
                    onSelectTable={setSelectedTableIndex}
                  />
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
              </>
            ) : (
              <Card className="p-12 text-center">
                <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-lg font-medium text-foreground mb-2">
                  No Document Selected
                </h2>
                <p className="text-sm text-muted-foreground">
                  Upload a new PDF or select a document from history to view analysis
                </p>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
