import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FileUpload } from "@/components/FileUpload";
import { DocumentOverview } from "@/components/DocumentOverview";
import { TableExplorer } from "@/components/TableExplorer";
import { DocumentHistory } from "@/components/DocumentHistory";
import { CoreFinancialStatements } from "@/components/CoreFinancialStatements";
import { FinancialSnapshot } from "@/components/FinancialSnapshot";
import { KeyRatiosCard } from "@/components/KeyRatiosCard";
import { CompanyComparison } from "@/components/CompanyComparison";
import { InterviewPrepMode } from "@/components/InterviewPrepMode";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, Shield, Sparkles, FileText, ChevronRight, GitCompare, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { classifyAllTables, ClassifiedTable, FinancialStatementType } from "@/lib/classifyTables";
import { extractFinancialMetrics, FinancialMetrics } from "@/lib/extractFinancialMetrics";
import { useAuth } from "@/contexts/AuthContext";
import { usePendingApprovals } from "@/hooks/usePendingApprovals";
import { generateExcelExport } from "@/lib/excelExport";
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

/**
 * Detect if a filename is messy (UUID, random hex, no meaningful words)
 * and derive a clean name from the PDF text if so.
 */
function deriveCleanFileName(originalName: string, pdfText?: string | null): string {
  const nameWithoutExt = originalName.replace(/\.pdf_?\.pdf$/i, '.pdf').replace(/\.pdf$/i, '');
  
  // Check if the name looks like a UUID, hex string, or has no meaningful words
  const isMessy = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(nameWithoutExt) ||
                  /^[0-9a-f]{16,}$/i.test(nameWithoutExt) ||
                  /^[0-9a-f_-]{20,}$/i.test(nameWithoutExt) ||
                  nameWithoutExt.length < 3;

  if (!isMessy) return originalName;
  if (!pdfText || pdfText.length < 100) return originalName;

  const text = pdfText.slice(0, 3000);

  // Try to find company name from common 10-K patterns
  let company = '';
  let filingType = '10-K';
  
  // Pattern: "APPLE INC." or "NIKE, INC." near top of document
  const companyMatch = text.match(/^\s*([A-Z][A-Z\s,.'&]+(?:INC\.?|CORP\.?|CO\.?|LTD\.?|LLC|LP|GROUP|HOLDINGS))/mi);
  if (companyMatch) {
    company = companyMatch[1].trim()
      .replace(/,?\s*(INC\.?|CORP\.?|CO\.?)$/i, '')
      .trim();
    // Title case
    company = company.split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  // Try ticker from "Common Stock, ... AAPL"
  if (!company) {
    const tickerMatch = text.match(/Common Stock[^)]*?\b([A-Z]{1,5})\b[^)]*?(?:Nasdaq|NYSE|Stock Market)/i);
    if (tickerMatch) company = tickerMatch[1];
  }

  // Detect filing type
  if (/\b10-?Q\b/i.test(text)) filingType = '10-Q';
  if (/\b8-?K\b/i.test(text)) filingType = '8-K';
  if (/\bannual\s+report\b/i.test(text)) filingType = '10-K';

  // Find fiscal year
  const yearMatch = text.match(/(?:fiscal\s+year|year\s+ended|for\s+the\s+year)[^0-9]*?(20\d{2})/i);
  const year = yearMatch ? yearMatch[1] : '';

  if (company) {
    const parts = [company, filingType, year].filter(Boolean);
    return parts.join(' ') + '.pdf';
  }

  return originalName;
}

const Index = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [savedDocuments, setSavedDocuments] = useState<DocumentAnalysis[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>();
  const [selectedTableIndex, setSelectedTableIndex] = useState(0);
  const [classifiedTables, setClassifiedTables] = useState<ClassifiedTable[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [statementOverrides, setStatementOverrides] = useState<Record<string, ClassifiedTable>>({});
  const { toast } = useToast();
  const { signOut, isAdmin, profile, user } = useAuth();
  const navigate = useNavigate();
  const pendingCount = usePendingApprovals(isAdmin);

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

  // Get the unit multiplier from the response
  const unitMultiplier = useMemo(() => {
    return response?.reportedUnit?.multiplier || 1;
  }, [response?.reportedUnit]);

  // Compute financial metrics from classified tables
  const financialMetrics = useMemo<FinancialMetrics | null>(() => {
    if (classifiedTables.length === 0 || !response?.fileName) return null;
    return extractFinancialMetrics(classifiedTables, response.fileName, unitMultiplier);
  }, [classifiedTables, response?.fileName, unitMultiplier]);

  const loadSavedDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('document_analyses')
        .select('*')
        .eq('processing_status', 'completed')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setSavedDocuments(data || []);
    } catch (error) {
      console.error('Error loading documents:', error);
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
      reportedUnit: doc.financials?.reportedUnit || null,
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
          
          // Step 1: Submit PDF to Azure (returns immediately with documentId)
          const { data: submitData, error: submitError } = await supabase.functions.invoke("extract-pdf", {
            body: {
              fileName: selectedFile.name,
              fileData: base64Data,
            },
          });

          if (submitError) throw submitError;
          if (!submitData?.documentId) throw new Error('No document ID returned');

          const documentId = submitData.documentId;
          console.log(`PDF submitted, document ID: ${documentId}`);

          toast({
            title: "Processing",
            description: "PDF submitted. Processing may take a minute for large filings...",
          });

          // Step 2: Poll for results
          let attempts = 0;
          const maxAttempts = 60; // 5 minutes (every 5 seconds)
          
          const pollForResults = async (): Promise<any> => {
            while (attempts < maxAttempts) {
              attempts++;
              await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds

              const { data: pollData, error: pollError } = await supabase.functions.invoke("poll-pdf-result", {
                body: { documentId },
              });

              if (pollError) throw pollError;

              if (pollData?.status === 'completed') {
                return pollData.data;
              }

              if (pollData?.status === 'failed') {
                throw new Error(pollData.error || 'Processing failed');
              }

              // Still processing, continue polling
              console.log(`Poll attempt ${attempts}: still processing...`);
            }
            throw new Error('Processing timed out after 5 minutes');
          };

          const resultData = await pollForResults();

          // Derive a clean file name if the original is messy
          const cleanName = deriveCleanFileName(selectedFile.name, resultData.pdfText);
          resultData.fileName = cleanName;

          // Update the document name in DB if it was cleaned
          if (cleanName !== selectedFile.name) {
            await supabase.from('document_analyses').update({ file_name: cleanName }).eq('id', documentId);
          }

          setResponse(resultData);
          setSelectedDocId(documentId);
          await loadSavedDocuments();
          
          toast({
            title: "Success",
            description: "PDF processed and saved",
          });
        } catch (error) {
          console.error("Error:", error);
          toast({
            title: "Error",
            description: error instanceof Error ? error.message : "Failed to process PDF",
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
    <div className="min-h-screen bg-background relative">
      {/* Background effects */}
      <div className="fixed inset-0 grid-pattern opacity-30 pointer-events-none" />
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-accent/10 rounded-full blur-3xl pointer-events-none" />
      
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-primary">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold font-mono tracking-tight">
                  <span className="gradient-text">FinAnalyzer</span>
                </h1>
                <p className="text-xs text-muted-foreground">
                  AI-powered document analysis
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {profile && (
                <span className="text-sm text-muted-foreground hidden sm:inline px-3 py-1.5 rounded-lg bg-muted/50">
                  {profile.email}
                </span>
              )}
              {savedDocuments.length >= 2 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowComparison(true)}
                  className="border-border/50 hover:border-primary/50 hover:bg-primary/10"
                >
                  <GitCompare className="h-4 w-4 mr-2" />
                  Compare
                </Button>
              )}
              {isAdmin && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => navigate('/admin')}
                  className="border-border/50 hover:border-primary/50 hover:bg-primary/10 relative"
                >
                  <Shield className="h-4 w-4 mr-2" />
                  Admin
                  {pendingCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center animate-pulse">
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  )}
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={signOut}
                className="hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6 py-6 relative max-w-[1920px] mx-auto">
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* Left Sidebar - Upload & History */}
          <div className="space-y-6">
            {/* Upload Section */}
            <div className="glass-card rounded-2xl p-5 hover-lift">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <h2 className="font-semibold text-sm">Upload Document</h2>
              </div>
              
              <FileUpload
                onFileSelect={handleFileSelect}
                selectedFile={selectedFile}
                onClearFile={handleClearFile}
              />

              {selectedFile && (
                <Button
                  onClick={handleExtractTables}
                  disabled={isProcessing}
                  className="w-full mt-4 h-11 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 glow-primary"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      Analyze Document
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Document History */}
            <DocumentHistory
              documents={savedDocuments}
              onSelect={handleSelectSavedDocument}
              onDelete={handleDeleteDocument}
              selectedId={selectedDocId}
            />
          </div>

          {/* Main Content Area */}
          <div className="xl:col-span-4 space-y-6">
            {response ? (
              <div className="animate-fade-in">
                {/* AI Financial Snapshot + Excel Export */}
                {financialMetrics && (
                  <div className="mb-6 space-y-4">
                    <FinancialSnapshot metrics={financialMetrics} />
                    {classifiedTables.some(t => t.type !== 'other') && (
                      <Button
                        onClick={() => {
                          const overrides: any = {};
                          if (statementOverrides.income_statement) overrides.incomeStatement = statementOverrides.income_statement;
                          if (statementOverrides.balance_sheet) overrides.balanceSheet = statementOverrides.balance_sheet;
                          if (statementOverrides.cash_flow) overrides.cashFlow = statementOverrides.cash_flow;
                          const success = generateExcelExport({
                            companyName: financialMetrics.companyName,
                            fileName: response.fileName || 'Document',
                            classifiedTables,
                            overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
                            unitMultiplier,
                          });
                          toast({
                            title: success ? 'Excel exported!' : 'Export failed',
                            description: success
                              ? 'Analyst-ready 3-statement model downloaded'
                              : 'No financial statements could be normalized. Try a different document.',
                            variant: success ? 'default' : 'destructive',
                          });
                        }}
                        className="w-full h-12 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 font-semibold text-sm glow-primary"
                      >
                        <FileSpreadsheet className="h-5 w-5 mr-2" />
                        Export 3-Statement Model (.xlsx)
                      </Button>
                    )}
                  </div>
                )}

                {/* Key Financial Ratios */}
                {financialMetrics && (
                  <div className="mb-6">
                    <KeyRatiosCard metrics={financialMetrics} />
                  </div>
                )}

                {/* Interview Prep Mode */}
                {financialMetrics && (
                  <div className="mb-6">
                    <InterviewPrepMode 
                      metrics={financialMetrics} 
                      documentName={response.fileName || selectedFile?.name || "Document"}
                    />
                  </div>
                )}

                {/* Document Overview */}
                <div className="mb-6">
                  <DocumentOverview
                    fileName={response.fileName || selectedFile?.name || "Unknown"}
                    tableCount={response.tablesCount || response.tables?.length || 0}
                    azureTableCount={response.azureTablesCount || 0}
                    textLength={response.pdfText?.length || 0}
                    textPreview={response.pdfTextPreview || response.pdfText?.substring(0, 500)}
                  />
                </div>

                {/* Core Financial Statements */}
                {classifiedTables.length > 0 && (
                  <div className="mb-6">
                    <CoreFinancialStatements
                      classifiedTables={classifiedTables}
                      onSelectTable={setSelectedTableIndex}
                      selectedIndex={selectedTableIndex}
                      onOverride={(type: FinancialStatementType, table: ClassifiedTable) => {
                        setStatementOverrides(prev => ({ ...prev, [type]: table }));
                      }}
                    />
                  </div>
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
                  <div className="glass-card rounded-2xl p-6 border-destructive/30 bg-destructive/5">
                    <h2 className="text-lg font-semibold mb-2 text-destructive flex items-center gap-2">
                      <span>⚠</span>
                      Processing Error
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {response.azureError}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="glass-card rounded-2xl p-16 text-center animate-fade-in">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 mb-6">
                  <Sparkles className="h-10 w-10 text-primary" />
                </div>
                <h2 className="text-xl font-semibold mb-3">
                  No Document Selected
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Upload a new PDF or select a document from history to start analyzing financial data with AI-powered insights
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Company Comparison Modal */}
      <CompanyComparison 
        documents={savedDocuments}
        isOpen={showComparison}
        onClose={() => setShowComparison(false)}
      />
    </div>
  );
};

export default Index;