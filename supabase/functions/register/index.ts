// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.
// Setup type definitions for built-in Supabase Runtime APIs
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
function createErrorResponse(error, status = 400, details = null) {
  const response = {
    error
  };
  if (details) response.details = details;
  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
function createSuccessResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      }
    });
  }
  if (req.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405);
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return createErrorResponse('Server configuration error', 500);
  }
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  try {
    const body = await req.json();
    const { phone, password, full_name, sex_identify } = body;
    if (!phone || !password) {
      return createErrorResponse('Phone and password are required', 400);
    }
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      phone,
      password,
      phone_confirm: true,
      user_metadata: {
        full_name
      }
    });
    if (authError) {
      return createErrorResponse('User creation failed', 400, {
        message: authError.message,
        code: authError.code || 'unknown'
      });
    }
    const user = authData.user;
    if (!user) {
      return createErrorResponse('User creation failed', 500);
    }
    // Insert into customer table
    const { error: customerError } = await supabase.from('customer').insert({
      customer_id: user.id,
      full_name,
      sex_identify: sex_identify || null,
      login_type: 'phone',
      status: 'active'
    });
    if (customerError) {
      console.log('Customer Error:', customerError);
      return createErrorResponse('Failed to create customer profile', 500, customerError.message);
    }
    let accessToken = null;
    let expiresIn = 3600;
    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        phone,
        password
      });
      if (!signInError && signInData.session) {
        accessToken = signInData.session.access_token;
        expiresIn = signInData.session.expires_in || 3600;
      } else {}
    } catch (signInErr) {}
    const refreshToken = crypto.randomUUID();
    const { error: tokenError } = await supabase.from('refreshtoken').insert({
      customer_id: user.id,
      token: refreshToken,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      is_revoked: false
    });
    if (tokenError) {
      return createErrorResponse('Failed to store refresh token', 500, tokenError.message);
    }
    return createSuccessResponse({
      success: true,
      message: 'User created successfully. Phone number pre-verified.',
      data: {
        customer_id: user.id,
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: expiresIn || 3600,
        user: {
          id: user.id,
          phone: user.phone,
          phone_confirmed_at: user.phone_confirmed_at
        },
        customer: {
          customer_id: user.id,
          full_name,
          sex_identify: sex_identify || null,
          login_type: 'phone',
          status: 'active'
        }
      }
    }, 201);
  } catch (error) {
    console.log('General Error:', error);
    return createErrorResponse('Internal server error', 500, error.message);
  }
}); /* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/register' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/ 
