-- Add user_id column to document_analyses
ALTER TABLE public.document_analyses 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Assign all existing documents to the admin user
UPDATE public.document_analyses 
SET user_id = 'f69c4d2b-6219-4ebd-b1c7-156743c145aa';

-- Make user_id required for future inserts
ALTER TABLE public.document_analyses 
ALTER COLUMN user_id SET NOT NULL;

-- Drop existing public policies
DROP POLICY IF EXISTS "Allow public read access" ON public.document_analyses;
DROP POLICY IF EXISTS "Allow public insert access" ON public.document_analyses;
DROP POLICY IF EXISTS "Allow public delete access" ON public.document_analyses;

-- Create user-specific RLS policies
CREATE POLICY "Users can view own documents"
ON public.document_analyses
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
ON public.document_analyses
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
ON public.document_analyses
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
ON public.document_analyses
FOR DELETE
USING (auth.uid() = user_id);