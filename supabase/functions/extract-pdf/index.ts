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

    // Convert PDF to Base64
    const pdfBase64 = fileData.split(',')[1] || fileData;
    console.log(`PDF Base64 size: ${pdfBase64.length} characters`);

    // Call Lovable AI with PDF support
    let azureMessage = null;
    let pdfError = null;
    try {
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      
      console.log('Calling Lovable AI for PDF extraction...');
      
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
                content: [
                  {
                    type: "text",
                    text: `Please analyze this PDF file named "${fileName}" and provide a summary of its contents, including any key financial data or tables you find.`
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:application/pdf;base64,${pdfBase64}`
                    }
                  }
                ]
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
        console.log('AI response received:', azureMessage?.slice(0, 200) + '...');
      }
    } catch (error) {
      azureMessage = `AI error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      pdfError = azureMessage;
      console.error('AI exception:', azureMessage);
    }

    const pdfText = "[PDF processed by Lovable AI]";

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
