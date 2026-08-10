import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

    const anonClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user?.app_metadata?.is_admin) return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });

    const service = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const body = await req.json();
    const { action, business_id } = body;

    if (!business_id) return new Response(JSON.stringify({ error: "business_id required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

    switch (action) {
      case "set_status": {
        await service.from("businesses").update({ subscription_status: body.status }).eq("id", business_id);
        break;
      }
      case "extend_trial": {
        await service.from("businesses").update({
          subscription_status: "trialing",
          trial_ends_at: body.trial_ends_at,
        }).eq("id", business_id);
        break;
      }
      case "grant_free": {
        await service.from("businesses").update({
          subscription_status: "active",
          subscription_id: "comped",
        }).eq("id", business_id);
        break;
      }
      case "reset_onboarding": {
        await service.from("businesses").update({ onboarding_complete: false }).eq("id", business_id);
        break;
      }
      case "sync_stripe": {
        if (!STRIPE_SECRET_KEY) return new Response(JSON.stringify({ error: "Stripe not configured" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
        const { data: biz } = await service.from("businesses").select("stripe_account_id, stripe_customer_id, subscription_id").eq("id", business_id).single();
        const updates: Record<string, any> = {};

        if (biz?.stripe_account_id) {
          const res = await fetch(`https://api.stripe.com/v1/accounts/${biz.stripe_account_id}`, { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } });
          const account = await res.json();
          if (res.ok) {
            updates.stripe_charges_enabled = account.charges_enabled;
            updates.stripe_onboarding_complete = account.details_submitted;
          }
        }

        if (biz?.subscription_id && biz.subscription_id !== "comped") {
          const res = await fetch(`https://api.stripe.com/v1/subscriptions/${biz.subscription_id}`, { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } });
          const sub = await res.json();
          if (res.ok) {
            updates.subscription_status = sub.status;
            updates.trial_ends_at = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
          }
        }

        if (Object.keys(updates).length > 0) {
          await service.from("businesses").update(updates).eq("id", business_id);
        }
        break;
      }
      case "send_password_reset": {
        const { data: biz } = await service.from("businesses").select("owner_id").eq("id", business_id).single();
        if (!biz) return new Response(JSON.stringify({ error: "Business not found" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
        const APP_URL = Deno.env.get("APP_URL") ?? "https://example.com";
        await anonClient.auth.resetPasswordForEmail(body.email, { redirectTo: `${APP_URL}/reset-password` });
        break;
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Return the updated business
    const { data: updated } = await service.from("businesses").select("*").eq("id", business_id).single();
    return new Response(JSON.stringify({ business: updated }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
