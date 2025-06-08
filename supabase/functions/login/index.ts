// Enhanced version with better debugging for access token issues
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
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    });
  }
  if (req.method !== "POST") {
    return createErrorResponse("Method not allowed", 405);
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return createErrorResponse("Server configuration error", 500);
  }
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  try {
    const body = await req.json();
    const { phone, email, password, access_token } = body;
    // Access token validation flow
    if (access_token) {
      console.log("Attempting login with access token:", access_token.substring(0, 20) + "...");
      // Validate the access token format
      if (!access_token.startsWith('eyJ')) {
        return createErrorResponse("Invalid access token format - should be JWT", 401, {
          hint: "Access token should start with 'eyJ'"
        });
      }
      // Try to get user with access token
      const { data: userData, error: userError } = await supabase.auth.getUser(access_token);
      console.log("User data result:", {
        hasUser: !!userData?.user,
        userId: userData?.user?.id,
        error: userError?.message
      });
      if (userError) {
        return createErrorResponse("Invalid or expired access token", 401, {
          message: userError.message,
          code: userError.code || "invalid_token",
          hint: "The access token may be expired or malformed"
        });
      }
      if (!userData?.user) {
        return createErrorResponse("No user found for access token", 401, {
          hint: "Token validation succeeded but no user returned"
        });
      }
      const user = userData.user;
      // Get customer data
      const { data: customerData, error: customerError } = await supabase.from("customer").select("*").eq("customer_id", user.id).single();
      if (customerError) {
        console.log("Customer lookup error:", customerError);
        return createErrorResponse("Failed to retrieve customer profile", 500, {
          message: customerError.message,
          userId: user.id
        });
      }
      if (!customerData) {
        return createErrorResponse("Customer profile not found", 404, {
          userId: user.id,
          hint: "User exists in auth but not in customer table"
        });
      }
      if (customerData.status !== "active") {
        return createErrorResponse("Account is not active", 403, {
          status: customerData.status,
          hint: "Account status must be 'active' to login"
        });
      }
      // Optional: Check for refresh token (remove this if not needed)
      const { data: tokenData, error: tokenError } = await supabase.from("refreshtoken").select("token").eq("customer_id", user.id).eq("is_revoked", false).gt("expires_at", new Date().toISOString()).single();
      // Note: This might be causing issues - consider removing this check
      if (tokenError && tokenError.code !== 'PGRST116') {
        console.log("Refresh token check failed:", tokenError);
        return createErrorResponse("Refresh token validation failed", 401, {
          message: tokenError.message,
          hint: "Consider removing refresh token requirement for access token login"
        });
      }
      return createSuccessResponse({
        success: true,
        message: "Login successful with access token",
        data: {
          customer_id: user.id,
          access_token,
          token_type: "Bearer",
          expires_in: 3600,
          user: {
            id: user.id,
            email: user.email,
            phone: user.phone,
            email_confirmed_at: user.email_confirmed_at,
            phone_confirmed_at: user.phone_confirmed_at,
            last_sign_in_at: user.last_sign_in_at
          },
          customer: {
            customer_id: customerData.customer_id,
            email: customerData.email,
            phone: customerData.phone,
            full_name: customerData.full_name,
            sex_identify: customerData.sex_identify,
            login_type: customerData.login_type,
            is_email_verified: customerData.is_email_verified,
            is_phone_verified: customerData.is_phone_verified,
            status: customerData.status,
            create_at: customerData.create_at,
            update_at: customerData.update_at
          }
        }
      }, 200);
    }
    if (!phone && !email || !password) {
      return createErrorResponse("Phone or email, and password are required", 400);
    }
    let authData, authError;
    if (phone) {
      ({ data: authData, error: authError } = await supabase.auth.signInWithPassword({
        phone,
        password
      }));
    } else if (email) {
      ({ data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      }));
    }
    if (authError) {
      return createErrorResponse("Login failed", 401, {
        message: authError.message,
        code: authError.code || "invalid_credentials"
      });
    }
    const user = authData.user;
    const session = authData.session;
    if (!user || !session) {
      return createErrorResponse("Login failed - invalid session", 401);
    }
    const { data: customerData, error: customerError } = await supabase.from("customer").select("*").eq("customer_id", user.id).single();
    if (customerError) {
      return createErrorResponse("Failed to retrieve customer profile", 500, customerError.message);
    }
    if (customerData.status !== "active") {
      return createErrorResponse("Account is not active", 403, {
        status: customerData.status
      });
    }
    // Revoke existing refresh tokens
    await supabase.from("refreshtoken").update({
      is_revoked: true
    }).eq("customer_id", user.id).eq("is_revoked", false);
    // Create new refresh token
    const refreshToken = crypto.randomUUID();
    const { error: tokenError } = await supabase.from("refreshtoken").insert({
      customer_id: user.id,
      token: refreshToken,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      is_revoked: false
    });
    if (tokenError) {
      console.log("Token Error:", tokenError);
      return createErrorResponse("Failed to store refresh token", 500, tokenError.message);
    }
    // Update customer's last login timestamp
    await supabase.from("customer").update({
      update_at: new Date().toISOString()
    }).eq("customer_id", user.id);
    return createSuccessResponse({
      success: true,
      message: "Login successful",
      data: {
        customer_id: user.id,
        access_token: session.access_token,
        token_type: "Bearer",
        expires_in: session.expires_in || 3600,
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          email_confirmed_at: user.email_confirmed_at,
          phone_confirmed_at: user.phone_confirmed_at,
          last_sign_in_at: user.last_sign_in_at
        },
        customer: {
          customer_id: customerData.customer_id,
          email: customerData.email,
          phone: customerData.phone,
          full_name: customerData.full_name,
          sex_identify: customerData.sex_identify,
          login_type: customerData.login_type,
          is_email_verified: customerData.is_email_verified,
          is_phone_verified: customerData.is_phone_verified,
          status: customerData.status,
          create_at: customerData.create_at,
          update_at: customerData.update_at
        }
      }
    }, 200);
  } catch (error) {
    console.log("General Error:", error);
    return createErrorResponse("Internal server error", 500, error.message);
  }
});
