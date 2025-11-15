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

    // Call Lovable AI with document as file attachment
    let pdfText = "";
    let tables = [];
    let pdfError = null;
    let azureMessage = null;
    
    try {
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      
      console.log('Calling Lovable AI with PDF document...');
      
      // Create form data with the PDF file
      const formData = new FormData();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      formData.append('file', blob, fileName);
      formData.append('model', 'google/gemini-2.5-flash');
      formData.append('purpose', 'document-analysis');
      
      // First, upload the file
      const uploadResponse = await fetch(
        'https://ai.gateway.lovable.dev/v1/files',
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${lovableApiKey}`,
          },
          body: formData,
        }
      );

      if (!uploadResponse.ok) {
        throw new Error(`File upload failed: ${uploadResponse.status}`);
      }

      const uploadData = await uploadResponse.json();
      const fileId = uploadData.id;
      
      console.log('File uploaded, analyzing...');

      // Now analyze the uploaded document
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
                content: "You are a financial document analyzer. Extract text and tables from PDFs. Return your response as JSON with this structure: {\"summary\": \"brief summary\", \"text\": \"full extracted text\", \"tables\": [{\"title\": \"table name\", \"columns\": [\"col1\", \"col2\"], \"rows\": [[\"val1\", \"val2\"]]}]}"
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Analyze this PDF document "${fileName}" and extract all text and tables. Return the response as JSON.`
                  },
                  {
                    type: "file",
                    file_id: fileId
                  }
                ]
              }
            ],
            response_format: { type: "json_object" }
          }),
        }
      );

      if (!aiResponse.ok) {
        const errorData = await aiResponse.text();
        throw new Error(`AI analysis failed: ${errorData}`);
      }

      const data = await aiResponse.json();
      const responseContent = data.choices?.[0]?.message?.content;
      
      if (responseContent) {
        try {
          const parsed = JSON.parse(responseContent);
          pdfText = parsed.text || "";
          tables = parsed.tables || [];
          azureMessage = parsed.summary || "Document analyzed successfully";
        } catch (e) {
          pdfText = responseContent;
          azureMessage = responseContent;
        }
      }
      
      console.log(`Extracted ${pdfText.length} characters, ${tables.length} tables`);

    } catch (error) {
      pdfError = error instanceof Error ? error.message : 'Unknown error';
      azureMessage = `Error: ${pdfError}`;
      console.error('Processing error:', pdfError);
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
