import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    
    const { fileName, pdfText } = await req.json();
    
    console.log(`Processing file: ${fileName}`);
    console.log(`PDF text length: ${pdfText?.length || 0} characters`);

    // Call Lovable AI with extracted text
    let azureMessage = null;
    let pdfError = null;
    try {
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      
      console.log('Calling Lovable AI for PDF analysis...');
      
      const aiResponse = await fetch(
        'https://ai.gateway.lovable.dev/v1/chat/completions',
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${lovableApiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: "You extract tables and key financial information from PDF documents like 10-Ks and earnings decks. Provide clear, structured summaries."
              },
              {
                role: "user",
                content: `Please analyze this text extracted from "${fileName}" and provide a summary of its contents, including any key financial data or tables:\n\n${pdfText.slice(0, 20000)}`
              }
            ]
          }),
        }
      );

      if (!aiResponse.ok) {
        const errorData = await aiResponse.text();
        azureMessage = `AI error: ${aiResponse.status} - ${errorData}`;
        pdfError = azureMessage;
        console.error('AI error:', azureMessage);
      } else {
        const data = await aiResponse.json();
        azureMessage = data.choices?.[0]?.message?.content ?? null;
        console.log('AI response received');
      }
    } catch (error) {
      azureMessage = `AI error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      pdfError = azureMessage;
      console.error('AI exception:', azureMessage);
    }

    // Return response
    const response = {
      success: true,
      message: "PDF received successfully",
      fileName: fileName,
      timestamp: new Date().toISOString(),
      textLength: pdfText?.length || 0,
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
