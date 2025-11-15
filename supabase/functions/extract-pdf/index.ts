import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import pdfParse from "https://esm.sh/pdf-parse@1.1.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('PDF extraction request received');
    
    const { fileName, fileData } = await req.json();
    
    console.log(`Processing file: ${fileName}`);
    console.log(`File data size: ${fileData?.length || 0} characters`);

    // Convert PDF to Base64
    const pdfBase64 = fileData.split(',')[1] || fileData;
    console.log(`PDF Base64 size: ${pdfBase64.length} characters`);

    // Extract text from PDF using pdf-parse
    let pdfText = "";
    let pdfError = null;
    try {
      // Convert base64 to buffer
      const binaryString = atob(pdfBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const fileBuffer = bytes.buffer;
      
      // Parse PDF
      const pdfData = await pdfParse(fileBuffer);
      pdfText = pdfData.text;
      
      console.log(`Extracted ${pdfText.length} characters of text from PDF`);
    } catch (error) {
      pdfError = error instanceof Error ? error.message : 'PDF parse failed';
      console.error('Error extracting PDF text:', pdfError);
      pdfText = "";
    }

    // Call Azure OpenAI
    let azureMessage = null;
    try {
      const azureEndpoint = Deno.env.get('AZURE_OPENAI_ENDPOINT');
      const azureApiKey = Deno.env.get('AZURE_OPENAI_API_KEY');
      
      console.log('Calling Azure OpenAI...');
      
      const azureResponse = await fetch(
        `${azureEndpoint}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": azureApiKey || '',
          },
          body: JSON.stringify({
            model: "pdf-extractor",
            messages: [
              {
                role: "system",
                content: "You extract tables and key financial information from PDF documents like 10-Ks and earnings decks."
              },
              {
                role: "user",
                content: `Here is the beginning of a PDF:\n\n${pdfText.slice(0, 8000)}\n\nBased on this text, briefly summarize what this document is about.`
              }
            ]
          }),
        }
      );

      if (!azureResponse.ok) {
        const errorData = await azureResponse.text();
        azureMessage = `Azure OpenAI error: ${azureResponse.status} - ${errorData}`;
        console.error('Azure error:', azureMessage);
      } else {
        const data = await azureResponse.json();
        azureMessage = data.choices?.[0]?.message?.content ?? null;
        console.log('Azure response:', azureMessage);
      }
    } catch (error) {
      azureMessage = `Azure OpenAI error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('Azure exception:', azureMessage);
    }

    // Return simple dummy response with Azure message
    const response = {
      success: true,
      message: "PDF received successfully",
      fileName: fileName,
      timestamp: new Date().toISOString(),
      fileSize: fileData ? fileData.length : 0,
      azureMessage: azureMessage,
      pdfTextPreview: pdfText?.slice(0, 500) || null,
      pdfError: pdfError
    };

    console.log('Sending response');

    return new Response(
      JSON.stringify(response),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error processing PDF:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
