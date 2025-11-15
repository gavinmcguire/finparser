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

    // Get Azure OpenAI configuration from environment variables
    const azureEndpoint = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const azureApiKey = Deno.env.get('AZURE_OPENAI_API_KEY');
    const azureDeployment = Deno.env.get('AZURE_OPENAI_DEPLOYMENT') || 'pdf-extractor';
    const azureApiVersion = Deno.env.get('AZURE_OPENAI_API_VERSION');

    let azureMessage = null;
    let azureError = null;

    // Only call Azure if all required credentials are configured
    if (azureEndpoint && azureApiKey && azureApiVersion) {
      try {
        console.log('Calling Azure OpenAI...');
        
        const azureUrl = `${azureEndpoint}/openai/deployments/${azureDeployment}/chat/completions?api-version=${azureApiVersion}`;
        
        const azureResponse = await fetch(azureUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': azureApiKey,
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: 'You help with PDF financial extraction for investment banking.'
              },
              {
                role: 'user',
                content: `I just uploaded a file called ${fileName}. Reply with a short confirmation that Azure is connected and working.`
              }
            ],
            temperature: 0,
          }),
        });

        if (!azureResponse.ok) {
          const errorText = await azureResponse.text();
          console.error('Azure OpenAI error:', azureResponse.status, errorText);
          azureError = `Azure OpenAI error: ${azureResponse.status} - ${errorText}`;
        } else {
          const azureData = await azureResponse.json();
          azureMessage = azureData.choices?.[0]?.message?.content || 'No response from Azure';
          console.log('Azure OpenAI response received:', azureMessage);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error calling Azure OpenAI:', errorMessage);
        azureError = `Failed to call Azure OpenAI: ${errorMessage}`;
      }
    } else {
      console.log('Azure OpenAI not configured - skipping Azure call');
      azureMessage = 'Azure OpenAI not configured. Please set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_API_VERSION.';
    }

    // Return the combined response
    const response = {
      success: true,
      message: "PDF received successfully",
      fileName: fileName,
      timestamp: new Date().toISOString(),
      dataReceived: !!fileData,
      fileSize: fileData ? fileData.length : 0,
      azureMessage: azureMessage,
      azureError: azureError,
      note: "This is a dummy response. Table extraction will be implemented next."
    };

    console.log('Sending response with Azure message');

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
