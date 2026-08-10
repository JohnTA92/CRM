import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const APP_URL = Deno.env.get("APP_URL") ?? "https://example.com";

    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not configured in Supabase secrets." }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Get the authenticated user's business_id from the JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: business } = await supabase
      .from("businesses")
      .select("id, name, stripe_account_id")
      .eq("owner_id", user.id)
      .single();

    if (!business) {
      return new Response(JSON.stringify({ error: "Business not found" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let accountId = business.stripe_account_id;

    // Create a new Express account if none exists yet
    if (!accountId) {
      const accountParams = new URLSearchParams({
        type: "express",
        "capabilities[card_payments][requested]": "true",
        "capabilities[transfers][requested]": "true",
        "business_profile[name]": business.name,
        "metadata[business_id]": business.id,
      });

      const accountRes = await fetch("https://api.stripe.com/v1/accounts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: accountParams.toString(),
      });

      const account = await accountRes.json();
      if (!accountRes.ok) {
        return new Response(JSON.stringify({ error: account.error?.message ?? "Failed to create Stripe account" }), {
          status: accountRes.status, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      accountId = account.id;

      // Save the account ID immediately
      await serviceSupabase
        .from("businesses")
        .update({ stripe_account_id: accountId, stripe_onboarding_complete: false })
        .eq("id", business.id);
    }

    // Create an account link for onboarding
    const linkParams = new URLSearchParams({
      account: accountId,
      "refresh_url": `${APP_URL}/settings?stripe=refresh`,
      "return_url": `${APP_URL}/stripe/callback?business_id=${business.id}`,
      type: "account_onboarding",
    });

    const linkRes = await fetch("https://api.stripe.com/v1/account_links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: linkParams.toString(),
    });

    const link = await linkRes.json();
    if (!linkRes.ok) {
      return new Response(JSON.stringify({ error: link.error?.message ?? "Failed to create onboarding link" }), {
        status: linkRes.status, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: link.url }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
