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
    
    const { fileName, fileData } = await req.json();
    
    console.log(`Processing file: ${fileName}`);
    console.log(`File data size: ${fileData?.length || 0} characters`);

    // Call Azure OpenAI
    let azureMessage = null;
    try {
      const azureResponse = await fetch(
        "https://gmmcg-mhzuwy7o-eastus2.openai.azure.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": Deno.env.get('AZURE_OPENAI_API_KEY') || '',
          },
          body: JSON.stringify({
            model: "pdf-extractor",
            messages: [
              { role: "system", content: "You help with financial PDF extraction." },
              {
                role: "user",
                content: `A file named ${fileName} was uploaded. Reply with a short confirmation that Azure is connected.`,
              },
            ],
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

    // Return response with Azure message
    const response = {
      success: true,
      message: "PDF received successfully",
      fileName: fileName,
      timestamp: new Date().toISOString(),
      fileSize: fileData ? fileData.length : 0,
      azureMessage: azureMessage
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
