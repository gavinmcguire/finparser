import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('PDF extraction request received');
    
    const { fileName, fileData } = await req.json();
    
    console.log(`Processing file: ${fileName}`);

    // Extract base64 content
    const pdfBase64 = fileData.split(',')[1] || fileData;
    
    // Decode base64 to binary for text extraction
    const binaryString = atob(pdfBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Simple text extraction from PDF structure
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const rawText = decoder.decode(bytes);
    
    // Extract readable text
    const textMatches = rawText.match(/\(([^)]+)\)/g);
    let pdfText = "";
    if (textMatches) {
      pdfText = textMatches
        .map(match => match.slice(1, -1))
        .filter(text => text.trim().length > 0)
        .join(' ')
        .replace(/\\n/g, '\n')
        .slice(0, 20000);
    }
    
    console.log(`Extracted ${pdfText.length} characters of text`);

    // Call Lovable AI for analysis
    let azureMessage = null;
    let pdfError = null;
    
    if (pdfText.length < 100) {
      pdfError = "Could not extract sufficient text from PDF";
      azureMessage = "Unable to analyze PDF - insufficient text extracted";
    } else {
      try {
        const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
        
        console.log('Calling Lovable AI...');
        
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
                  content: "You extract and summarize key financial information from PDF documents."
                },
                {
                  role: "user",
                  content: `Analyze this text from "${fileName}":\n\n${pdfText}`
                }
              ]
            }),
          }
        );

        if (!aiResponse.ok) {
          const errorData = await aiResponse.text();
          azureMessage = `AI error: ${aiResponse.status}`;
          pdfError = errorData;
          console.error('AI error:', errorData);
        } else {
          const data = await aiResponse.json();
          azureMessage = data.choices?.[0]?.message?.content ?? null;
          console.log('AI analysis complete');
        }
      } catch (error) {
        pdfError = error instanceof Error ? error.message : 'Unknown error';
        azureMessage = `Error: ${pdfError}`;
        console.error('AI exception:', pdfError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "PDF processed",
        fileName: fileName,
        timestamp: new Date().toISOString(),
        textLength: pdfText.length,
        azureMessage: azureMessage,
        pdfTextPreview: pdfText.slice(0, 500) || null,
        pdfError: pdfError
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
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
