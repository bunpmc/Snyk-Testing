// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.
// Setup type definitions for built-in Supabase Runtime APIs
// Deno Edge Function to handle Google OAuth callback and manage staff data
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Utility functions for consistent responses
function createErrorResponse(error: string, status = 400, details?: Record<string, unknown> | null) {
  const response: Record<string, unknown> = {
    error
  };
  if (details) response.details = details;
  return new Response(JSON.stringify(response), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
function createSuccessResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
serve(async (req)=>{
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-code-verifier, x-user-role",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    });
  }
  // Restrict to POST requests
  if (req.method !== "POST") {
    return createErrorResponse("Method not allowed", 405);
  }
  // Validate environment variables
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.log("Missing environment variables:", {
      supabaseUrl: !!supabaseUrl,
      supabaseServiceRoleKey: !!supabaseServiceRoleKey
    });
    return createErrorResponse("Server configuration error", 500);
  }
  // Initialize Supabase client
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  try {
    // Parse request body
    const body = await req.json();
    const { code, codeVerifier, role = "staff" } = body;
    console.log("Received request:", {
      code: code?.substring(0, 20) + "...",
      codeVerifier: codeVerifier?.substring(0, 20) + "...",
      role
    });
    // Validate inputs
    if (!code || !codeVerifier) {
      return createErrorResponse("Missing code or codeVerifier", 400, {
        codeProvided: !!code,
        codeVerifierProvided: !!codeVerifier
      });
    }
    // Validate role
    const validRoles = [
      "staff",
      "doctor",
      "admin"
    ];
    if (!validRoles.includes(role)) {
      return createErrorResponse("Invalid role provided", 400, {
        role,
        validRoles
      });
    }
    // Exchange authorization code for session
    const { data: authData, error: authError } = await supabase.auth.exchangeCodeForSession({
      authCode: code,
      codeVerifier
    });
    console.log("Auth result:", {
      hasUser: !!authData?.user,
      userId: authData?.user?.id,
      hasSession: !!authData?.session,
      error: authError?.message
    });
    if (authError) {
      return createErrorResponse("OAuth authentication failed", 401, {
        message: authError.message,
        code: authError.code || "oauth_error"
      });
    }
    const { user, session } = authData;
    if (!user || !user.email) {
      return createErrorResponse("No user data or email returned", 401, {
        userExists: !!user,
        emailExists: !!user?.email
      });
    }
    // Extract user metadata
    const fullName = user.user_metadata?.full_name || "Unknown";
    const email = user.email;
    // Upsert staff_members record
    const { data: staffData, error: staffError } = await supabase.from("staff_members").upsert({
      staff_id: user.id,
      full_name: fullName,
      working_email: email,
      role: role,
      years_experience: 0,
      hired_at: new Date().toISOString().split("T")[0],
      is_available: true,
      updated_at: new Date().toISOString()
    }, {
      onConflict: "staff_id"
    }).select().single();
    console.log("Staff upsert result:", {
      staffId: staffData?.staff_id,
      error: staffError?.message
    });
    if (staffError) {
      return createErrorResponse("Failed to create/update staff member", 500, {
        message: staffError.message,
        userId: user.id
      });
    }
    // If role is doctor, upsert doctor_details
    let doctorData = null;
    if (role === "doctor") {
      const { data, error: doctorError } = await supabase.from("doctor_details").upsert({
        doctor_id: user.id,
        department: "general",
        speciality: "general",
        license_no: `LIC-${crypto.randomUUID().substring(0, 8)}`
      }, {
        onConflict: "doctor_id"
      }).select().single();
      console.log("Doctor upsert result:", {
        doctorId: data?.doctor_id,
        error: doctorError?.message
      });
      if (doctorError) {
        return createErrorResponse("Failed to create/update doctor details", 500, {
          message: doctorError.message,
          userId: user.id
        });
      }
      doctorData = data;
    }
    // Create a default schedule
    const { data: scheduleData, error: scheduleError } = await supabase.from("staff_schedules").insert({
      staff_id: user.id,
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 3600000).toISOString(),
      is_recurring: false
    }).select().single();
    console.log("Schedule insert result:", {
      scheduleId: scheduleData?.schedule_id,
      error: scheduleError?.message
    });
    if (scheduleError) {
      return createErrorResponse("Failed to create schedule", 500, {
        message: scheduleError.message,
        userId: user.id
      });
    }
    // Return success response
    return createSuccessResponse({
      success: true,
      message: "OAuth login and staff registration successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: fullName,
          last_sign_in_at: user.last_sign_in_at
        },
        staff: {
          staff_id: staffData.staff_id,
          full_name: staffData.full_name,
          working_email: staffData.working_email,
          role: staffData.role,
          years_experience: staffData.years_experience,
          hired_at: staffData.hired_at,
          is_available: staffData.is_available,
          created_at: staffData.created_at,
          updated_at: staffData.updated_at
        },
        doctor: doctorData ? {
          doctor_id: doctorData.doctor_id,
          department: doctorData.department,
          speciality: doctorData.speciality,
          license_no: doctorData.license_no
        } : null,
        schedule: {
          schedule_id: scheduleData.schedule_id,
          staff_id: scheduleData.staff_id,
          start_time: scheduleData.start_time,
          end_time: scheduleData.end_time,
          is_recurring: scheduleData.is_recurring
        },
        access_token: session?.access_token,
        token_type: "Bearer",
        expires_in: session?.expires_in || 3600,
        refresh_token: session?.refresh_token
      }
    });
  } catch (error) {
    console.log("General Error:", {
      message: error.message,
      stack: error.stack
    });
    return createErrorResponse("Internal server error", 500, error.message);
  }
}); /* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/google-oauth-callback' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/ 
