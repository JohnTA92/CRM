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
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not configured" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { business_id } = await req.json();
    if (!business_id) {
      return new Response(JSON.stringify({ error: "business_id required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: business } = await supabase
      .from("businesses")
      .select("stripe_account_id")
      .eq("id", business_id)
      .single();

    if (!business?.stripe_account_id) {
      return new Response(JSON.stringify({ error: "No Stripe account found for this business" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Retrieve the account from Stripe to check its current status
    const accountRes = await fetch(`https://api.stripe.com/v1/accounts/${business.stripe_account_id}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });

    const account = await accountRes.json();
    if (!accountRes.ok) {
      return new Response(JSON.stringify({ error: account.error?.message ?? "Failed to retrieve Stripe account" }), {
        status: accountRes.status, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const chargesEnabled = account.charges_enabled === true;
    const detailsSubmitted = account.details_submitted === true;

    // Update the business record with current Stripe status
    await supabase.from("businesses").update({
      stripe_onboarding_complete: detailsSubmitted,
      stripe_charges_enabled: chargesEnabled,
    }).eq("id", business_id);

    return new Response(JSON.stringify({
      charges_enabled: chargesEnabled,
      details_submitted: detailsSubmitted,
      account_id: business.stripe_account_id,
    }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
