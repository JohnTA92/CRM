import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Minimal HMAC-SHA256 verification for Stripe webhook signature
async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=")));
    const timestamp = parts["t"];
    const signature = parts["v1"];
    const signed = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
    const computed = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return computed === signature;
  } catch {
    return false;
  }
}

serve(async (req) => {
  const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_SUBSCRIPTION_WEBHOOK_SECRET");
  const body = await req.text();

  if (STRIPE_WEBHOOK_SECRET) {
    const sig = req.headers.get("stripe-signature") ?? "";
    const valid = await verifyStripeSignature(body, sig, STRIPE_WEBHOOK_SECRET);
    if (!valid) {
      return new Response("Invalid signature", { status: 400 });
    }
  }

  const event = JSON.parse(body);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const obj = event.data?.object;
  const businessId = obj?.metadata?.business_id;

  switch (event.type) {
    case "checkout.session.completed": {
      // Subscription checkout completed — set trialing/active based on payment status
      if (obj.mode !== "subscription") break;
      if (!businessId) break;
      const subId = obj.subscription;
      await supabase.from("businesses").update({
        subscription_id: subId,
        subscription_status: obj.payment_status === "paid" ? "active" : "trialing",
      }).eq("id", businessId);
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const meta = obj.metadata?.business_id;
      if (!meta) break;
      const status = mapStripeStatus(obj.status);
      const trialEnd = obj.trial_end ? new Date(obj.trial_end * 1000).toISOString() : null;
      await supabase.from("businesses").update({
        subscription_id: obj.id,
        subscription_status: status,
        trial_ends_at: trialEnd,
      }).eq("id", meta);
      break;
    }

    case "customer.subscription.deleted": {
      const meta = obj.metadata?.business_id;
      if (!meta) break;
      await supabase.from("businesses").update({
        subscription_status: "cancelled",
        subscription_id: null,
      }).eq("id", meta);
      break;
    }

    case "invoice.payment_failed": {
      // Find business by stripe_customer_id
      const customerId = obj.customer;
      if (!customerId) break;
      const { data: business } = await supabase
        .from("businesses")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();
      if (business) {
        await supabase.from("businesses").update({ subscription_status: "past_due" }).eq("id", business.id);
      }
      break;
    }
  }

  return new Response("ok", { status: 200 });
});

function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "active": return "active";
    case "trialing": return "trialing";
    case "past_due": return "past_due";
    case "canceled":
    case "cancelled": return "cancelled";
    case "unpaid": return "past_due";
    default: return stripeStatus;
  }
}
