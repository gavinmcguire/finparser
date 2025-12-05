import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GraduationCap, Loader2, RefreshCw, Lightbulb, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FinancialMetrics } from "@/lib/extractFinancialMetrics";
import { useToast } from "@/hooks/use-toast";

interface InterviewPrepModeProps {
  metrics: FinancialMetrics;
  documentName: string;
}

interface InterviewQuestion {
  question: string;
  category: string;
  difficulty: 'basic' | 'intermediate' | 'advanced';
  hint: string;
}

export const InterviewPrepMode = ({ metrics, documentName }: InterviewPrepModeProps) => {
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const generateQuestions = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-interview-questions', {
        body: { metrics, documentName }
      });

      if (error) throw error;

      if (data.error) {
        if (data.error.includes('Rate limit') || data.error.includes('429')) {
          setError('Rate limit reached. Please try again in a moment.');
        } else if (data.error.includes('402') || data.error.includes('Payment')) {
          setError('Usage limit reached. Please add credits to continue.');
        } else {
          setError(data.error);
        }
        return;
      }

      setQuestions(data.questions || []);
    } catch (err) {
      console.error('Error generating questions:', err);
      setError('Failed to generate questions. Please try again.');
      toast({
        title: "Error",
        description: "Failed to generate interview questions",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const difficultyColors = {
    basic: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    intermediate: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    advanced: 'bg-rose-500/10 text-rose-500 border-rose-500/30',
  };

  return (
    <Card className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <GraduationCap className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Interview Prep Mode</h3>
            <p className="text-xs text-muted-foreground">AI-generated questions from real data</p>
          </div>
        </div>
        <Button 
          onClick={generateQuestions} 
          disabled={isLoading}
          size="sm"
          className="bg-gradient-to-r from-primary to-primary/80"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : questions.length > 0 ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerate
            </>
          ) : (
            <>
              <Lightbulb className="h-4 w-4 mr-2" />
              Generate Questions
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 mb-4">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">{error}</span>
        </div>
      )}

      {questions.length === 0 && !isLoading && !error && (
        <div className="text-center py-8">
          <GraduationCap className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-2">
            Generate practice interview questions based on this company's financials
          </p>
          <p className="text-xs text-muted-foreground">
            Questions are created from extracted data only — no invented numbers
          </p>
        </div>
      )}

      {questions.length > 0 && (
        <ScrollArea className="h-[400px]">
          <div className="space-y-3">
            {questions.map((q, index) => (
              <div key={index} className="p-4 rounded-xl bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${difficultyColors[q.difficulty]}`}>
                    {q.difficulty}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {q.category}
                  </span>
                </div>
                <p className="text-sm font-medium mb-2">{q.question}</p>
                <details className="group">
                  <summary className="text-xs text-primary cursor-pointer hover:underline">
                    Show hint
                  </summary>
                  <p className="text-xs text-muted-foreground mt-2 pl-3 border-l-2 border-primary/30">
                    {q.hint}
                  </p>
                </details>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      <p className="text-[10px] text-muted-foreground text-center mt-4 italic">
        Questions reference only actual extracted metrics. AI does not invent or estimate financial data.
      </p>
    </Card>
  );
};
