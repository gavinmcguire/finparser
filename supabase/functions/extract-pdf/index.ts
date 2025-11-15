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

    // For now, return a dummy response
    const response = {
      success: true,
      message: "PDF received successfully",
      fileName: fileName,
      timestamp: new Date().toISOString(),
      dataReceived: !!fileData,
      fileSize: fileData ? fileData.length : 0,
      note: "This is a dummy response. Table extraction will be implemented next."
    };

    console.log('Sending response:', response);

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
