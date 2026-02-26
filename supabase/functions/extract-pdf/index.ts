import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileData: z.string().min(1).max(100_000_000),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('PDF extraction request received');

    // Get auth user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user from JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    // Parse input
    const rawBody = await req.json();
    const parseResult = requestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid input: ' + parseResult.error.errors.map(e => e.message).join(', ')
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { fileName, fileData } = parseResult.data;
    console.log(`Processing file: ${fileName}`);

    // Get Azure credentials
    const docIntelEndpoint = Deno.env.get('AZURE_DOC_INTELLIGENCE_ENDPOINT');
    const docIntelKey = Deno.env.get('AZURE_DOC_INTELLIGENCE_KEY');
    if (!docIntelEndpoint || !docIntelKey) {
      throw new Error('Azure Document Intelligence credentials not configured');
    }

    // Extract base64
    const pdfBase64 = fileData.split(',')[1] || fileData;
    console.log(`PDF base64 length: ${pdfBase64.length}, estimated size: ~${Math.round(pdfBase64.length * 0.75 / 1024 / 1024 * 100) / 100} MB`);

    // Submit to Azure (non-blocking) — limit to first 150 pages to keep response size manageable
    // Financial statements are always in the first ~100 pages of any 10-K filing
    const analyzeUrl = `${docIntelEndpoint}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31&pages=1-150`;
    const analyzeResponse = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': docIntelKey,
      },
      body: JSON.stringify({ base64Source: pdfBase64 })
    });

    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text();
      throw new Error(`Azure error: ${analyzeResponse.status} - ${errorText}`);
    }

    const operationLocation = analyzeResponse.headers.get('Operation-Location');
    if (!operationLocation) throw new Error('No operation location from Azure');

    console.log('Azure analysis started, operation:', operationLocation);

    // Create DB record with pending status
    const { data: docRecord, error: insertError } = await supabase
      .from('document_analyses')
      .insert({
        file_name: fileName,
        user_id: user.id,
        processing_status: 'processing',
        azure_operation_url: operationLocation,
      })
      .select('id')
      .single();

    if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);

    console.log(`Created document record: ${docRecord.id}`);

    // Return immediately with the document ID
    return new Response(
      JSON.stringify({
        success: true,
        documentId: docRecord.id,
        status: 'processing',
        message: 'PDF submitted for processing. Poll for results.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        pdfError: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
