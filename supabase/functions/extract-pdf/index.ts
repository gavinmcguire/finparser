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
    
    // Decode to binary
    const binaryString = atob(pdfBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Write PDF to temp file
    const tempPath = `/tmp/${fileName}`;
    await Deno.writeFile(tempPath, bytes);
    
    console.log('PDF saved to temp, parsing...');

    // Parse PDF using external service (pdf.co or similar)
    // For now, extract basic text structure
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const rawText = decoder.decode(bytes);
    
    // Extract text from PDF structure
    const textMatches = rawText.match(/\(([^)]+)\)/g);
    let extractedText = "";
    
    if (textMatches) {
      extractedText = textMatches
        .map(match => match.slice(1, -1))
        .filter(text => text.trim().length > 2)
        .join(' ')
        .replace(/\\n/g, '\n')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .slice(0, 30000);
    }
    
    console.log(`Extracted ${extractedText.length} characters`);

    // Call Lovable AI with the extracted text
    let pdfText = extractedText;
    let tables = [];
    let pdfError = null;
    let azureMessage = null;
    
    if (pdfText.length < 100) {
      pdfError = "Insufficient text extracted from PDF";
      azureMessage = "Unable to extract sufficient content from PDF";
    } else {
      try {
        const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
        
        console.log('Calling Lovable AI for analysis...');

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
                  content: "You analyze financial documents. Extract key information and identify any tables. Respond in JSON format with: {\"summary\": \"brief summary\", \"tables\": [{\"title\": \"table name\", \"columns\": [\"col names\"], \"rows\": [[\"data\"]]}]}"
                },
                {
                  role: "user",
                  content: `Analyze this text from "${fileName}":\n\n${pdfText.slice(0, 15000)}\n\nProvide a summary and extract any tables found. Return as JSON.`
                }
              ],
              response_format: { type: "json_object" }
            }),
          }
        );

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          throw new Error(`AI error: ${aiResponse.status} - ${errorText}`);
        }

        const data = await aiResponse.json();
        const responseContent = data.choices?.[0]?.message?.content;
        
        if (responseContent) {
          try {
            const parsed = JSON.parse(responseContent);
            tables = parsed.tables || [];
            azureMessage = parsed.summary || "Document analyzed";
          } catch (e) {
            azureMessage = responseContent;
          }
        }
        
        console.log(`Analysis complete: ${tables.length} tables found`);

      } catch (error) {
        pdfError = error instanceof Error ? error.message : 'Unknown error';
        azureMessage = `Error: ${pdfError}`;
        console.error('AI error:', pdfError);
      }
    }

    // Clean up temp file
    try {
      await Deno.remove(tempPath);
    } catch (e) {
      console.log('Temp file cleanup failed (non-critical)');
    }

    return new Response(
      JSON.stringify({
        success: pdfError === null,
        message: "PDF processed",
        fileName: fileName,
        timestamp: new Date().toISOString(),
        pdfText: pdfText,
        pdfTextPreview: pdfText.slice(0, 500) || null,
        tables: tables,
        azureMessage: azureMessage,
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
