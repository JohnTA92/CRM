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
    const STRIPE_PRICE_ID = Deno.env.get("STRIPE_SUBSCRIPTION_PRICE_ID");
    const APP_URL = Deno.env.get("APP_URL") ?? "https://example.com";

    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not configured" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!STRIPE_PRICE_ID) {
      return new Response(JSON.stringify({ error: "STRIPE_SUBSCRIPTION_PRICE_ID not configured" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

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
      .select("id, name, stripe_customer_id")
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

    let customerId = business.stripe_customer_id;

    // Create a Stripe customer if this business doesn't have one yet
    if (!customerId) {
      const customerParams = new URLSearchParams({
        email: user.email ?? "",
        name: business.name,
        "metadata[business_id]": business.id,
      });

      const customerRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: customerParams.toString(),
      });

      const customer = await customerRes.json();
      if (!customerRes.ok) {
        return new Response(JSON.stringify({ error: customer.error?.message ?? "Failed to create customer" }), {
          status: customerRes.status, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      customerId = customer.id;
      await serviceSupabase.from("businesses").update({ stripe_customer_id: customerId }).eq("id", business.id);
    }

    const params = new URLSearchParams({
      customer: customerId,
      "line_items[0][price]": STRIPE_PRICE_ID,
      "line_items[0][quantity]": "1",
      mode: "subscription",
      "metadata[business_id]": business.id,
      "subscription_data[metadata][business_id]": business.id,
      "subscription_data[trial_period_days]": "14",
      success_url: `${APP_URL}/?subscription=success`,
      cancel_url: `${APP_URL}/?subscription=cancelled`,
    });

    const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await sessionRes.json();
    if (!sessionRes.ok) {
      return new Response(JSON.stringify({ error: session.error?.message ?? "Stripe error" }), {
        status: sessionRes.status, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
