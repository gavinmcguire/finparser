-- Create table for storing document analysis history
CREATE TABLE public.document_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  pdf_text TEXT,
  tables JSONB,
  equity_summary JSONB,
  financials JSONB,
  summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS (public access for now since no auth)
ALTER TABLE public.document_analyses ENABLE ROW LEVEL SECURITY;

-- Allow public read/write access (no auth in this app)
CREATE POLICY "Allow public read access" 
ON public.document_analyses 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert access" 
ON public.document_analyses 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public delete access" 
ON public.document_analyses 
FOR DELETE 
USING (true);