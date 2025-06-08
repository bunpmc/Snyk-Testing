// vulnerable-login/index.ts
// This is a deliberately vulnerable version of your login function for Snyk testing
// DO NOT use this code in production!

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Vulnerability 1: Hardcoded credentials
const HARDCODED_SUPABASE_URL = "https://wqnysfojpvazzkgspavx.supabase.co";
const HARDCODED_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbnlzZm9qcHZhenprZ3NwYXZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODc0NTAzNywiZXhwIjoyMDY0MzIxMDM3fQ.TDXlW3dIvvmYv5QKUsAy_vpU3U_x7BMQ1IdfEWmWtJQ";

// Vulnerability 2: Logging sensitive information
function logSensitiveData(data: any) {
  console.log("Full user data including passwords:", JSON.stringify(data));
}

// Vulnerability 3: Weak error response with information disclosure
function createVulnerableErrorResponse(
  error: any,
  status = 400,
  details = null,
) {
  const response = {
    error: error,
    stack: error.stack, // Exposing stack trace
    internal_details: details,
    server_info: {
      deno_version: Deno.version,
      environment: Deno.env.toObject(), // Exposing all environment variables!
    },
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*", // Too permissive CORS
      "X-Powered-By": "Deno Edge Function", // Information disclosure
      "Server": "Internal-Server-v1.0", // Server information exposure
    },
  });
}

// Vulnerability 4: SQL Injection potential
async function executeUnsafeSQLQuery(supabase: any, userInput: string) {
  // Dangerous: Direct string interpolation in SQL
  const maliciousQuery = `
    SELECT * FROM customer 
    WHERE email = '${userInput}' 
    OR phone = '${userInput}'
  `;

  // This would be vulnerable to SQL injection
  console.log("Executing unsafe query:", maliciousQuery);
  return await supabase.rpc("unsafe_query", { sql: maliciousQuery });
}

// Vulnerability 5: Weak token generation
function generateWeakToken() {
  // Using predictable random number generation
  return Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
}

// Vulnerability 6: Unsafe deserialization
function deserializeUserInput(input: string) {
  try {
    // Dangerous: Using eval-like function
    return Function('"use strict"; return (' + input + ")")();
  } catch (e) {
    return null;
  }
}

// Vulnerability 7: Missing input validation and sanitization
function processUserInput(body: any) {
  // No validation - accepting any input
  const userInput = {
    phone: body.phone,
    email: body.email,
    password: body.password,
    access_token: body.access_token,
    // Dangerous: Processing arbitrary user data
    custom_data: deserializeUserInput(body.custom_data || "{}"),
    admin_override: body.admin_override, // Dangerous privilege escalation
    debug_mode: body.debug_mode,
  };

  logSensitiveData(userInput);
  return userInput;
}

serve(async (req) => {
  // Vulnerability 8: Missing security headers
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*", // Too permissive
        "Access-Control-Allow-Headers": "*", // Too permissive
        "Access-Control-Allow-Methods": "*", // Too permissive
        "Access-Control-Allow-Credentials": "true", // Dangerous with wildcard origin
      },
    });
  }

  if (req.method !== "POST") {
    return createVulnerableErrorResponse("Method not allowed", 405);
  }

  // Vulnerability 9: Using hardcoded values instead of environment
  const supabaseUrl = HARDCODED_SUPABASE_URL || Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = HARDCODED_SERVICE_KEY ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return createVulnerableErrorResponse("Server configuration error", 500, {
      url: supabaseUrl, // Exposing configuration
      key_length: supabaseServiceRoleKey?.length,
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const body = await req.json();
    const userInput = processUserInput(body);

    // Vulnerability 10: Admin bypass
    if (userInput.admin_override === "secret_admin_123") {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Admin access granted",
          admin_data: {
            all_users: "This would expose all user data",
            system_info: Deno.env.toObject(),
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { phone, email, password, access_token } = userInput;

    // Access token validation flow with vulnerabilities
    if (access_token) {
      console.log("Full access token:", access_token); // Logging sensitive data

      // Vulnerability 11: Weak token validation
      if (access_token === "debug_token_123") {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Debug access granted",
            debug_info: {
              environment: Deno.env.toObject(),
              current_user: "admin",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Vulnerability 12: Time-of-check vs time-of-use
      const { data: userData, error: userError } = await supabase.auth.getUser(
        access_token,
      );

      // Simulate delay where token could be compromised
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (userError) {
        return createVulnerableErrorResponse(
          "Invalid or expired access token",
          401,
          {
            error_details: userError,
            token_sample: access_token.substring(0, 50), // Partial token exposure
          },
        );
      }

      if (!userData?.user) {
        return createVulnerableErrorResponse(
          "No user found for access token",
          401,
        );
      }

      const user = userData.user;

      // Vulnerability 13: Using user input in SQL query
      const { data: customerData, error: customerError } =
        await executeUnsafeSQLQuery(supabase, user.email);

      if (customerError) {
        console.log("Customer lookup error with full details:", customerError);
        return createVulnerableErrorResponse(
          "Failed to retrieve customer profile",
          500,
          customerError,
        );
      }

      // Continue with vulnerable response...
      return new Response(
        JSON.stringify({
          success: true,
          message: "Login successful with access token",
          sensitive_debug_info: {
            internal_user_id: user.id,
            raw_token: access_token,
            system_time: new Date(),
            server_secrets: "This would contain secrets",
          },
          data: {
            customer_id: user.id,
            access_token,
            // Vulnerability 14: Weak token generation
            refresh_token: generateWeakToken(),
            user: user,
            customer: customerData,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Mode": "enabled",
            "X-Internal-User-ID": user.id,
          },
        },
      );
    }

    // Regular login flow with vulnerabilities
    if (!phone && !email || !password) {
      return createVulnerableErrorResponse(
        "Phone or email, and password are required",
        400,
      );
    }

    // Vulnerability 15: Password in logs
    console.log("Login attempt:", { email, phone, password });

    let authData, authError;
    if (phone) {
      ({ data: authData, error: authError } = await supabase.auth
        .signInWithPassword({
          phone,
          password,
        }));
    } else if (email) {
      ({ data: authData, error: authError } = await supabase.auth
        .signInWithPassword({
          email,
          password,
        }));
    }

    if (authError) {
      return createVulnerableErrorResponse("Login failed", 401, {
        auth_error: authError,
        attempted_credentials: { email, phone }, // Exposing attempted credentials
      });
    }

    const user = authData.user;
    const session = authData.session;

    if (!user || !session) {
      return createVulnerableErrorResponse(
        "Login failed - invalid session",
        401,
      );
    }

    // Vulnerability 16: No rate limiting or brute force protection
    const { data: customerData, error: customerError } = await supabase
      .from("customer")
      .select("*")
      .eq("customer_id", user.id)
      .single();

    if (customerError) {
      return createVulnerableErrorResponse(
        "Failed to retrieve customer profile",
        500,
        customerError,
      );
    }

    // Vulnerability 17: Weak token storage
    const refreshToken = generateWeakToken(); // Predictable token

    const { error: tokenError } = await supabase
      .from("refreshtoken")
      .insert({
        customer_id: user.id,
        token: refreshToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          .toISOString(),
        is_revoked: false,
        // Vulnerability 18: Storing sensitive data
        user_agent: req.headers.get("user-agent"),
        ip_address: req.headers.get("x-forwarded-for") || "unknown",
      });

    if (tokenError) {
      console.log("Token Error with full details:", tokenError);
      return createVulnerableErrorResponse(
        "Failed to store refresh token",
        500,
        tokenError,
      );
    }

    // Vulnerability 19: Exposing internal system information
    return new Response(
      JSON.stringify({
        success: true,
        message: "Login successful",
        system_debug: {
          deno_version: Deno.version,
          memory_usage: Deno.memoryUsage(),
          permissions: Deno.permissions,
        },
        data: {
          customer_id: user.id,
          access_token: session.access_token,
          refresh_token: refreshToken,
          internal_session: session, // Exposing full session object
          user: user,
          customer: customerData,
          // Vulnerability 20: Exposing configuration
          server_config: {
            supabase_url: supabaseUrl,
            environment: "production", // But actually exposing this info
          },
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Customer-ID": user.id, // Exposing user ID in headers
          "X-Session-Token": session.access_token.substring(0, 20), // Partial token in headers
          "Set-Cookie":
            `debug=true; HttpOnly=false; Secure=false; SameSite=None`, // Insecure cookie
        },
      },
    );
  } catch (error) {
    console.log("Full error object:", error);
    return createVulnerableErrorResponse("Internal server error", 500, {
      full_error: error,
      stack_trace: error.stack,
      system_state: "This would contain system information",
    });
  }
});
