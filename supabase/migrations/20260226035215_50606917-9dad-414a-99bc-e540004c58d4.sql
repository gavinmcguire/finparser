ALTER TABLE public.document_analyses 
ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS azure_operation_url text,
ADD COLUMN IF NOT EXISTS error_message text;

COMMENT ON COLUMN public.document_analyses.processing_status IS 'pending, processing, completed, failed';