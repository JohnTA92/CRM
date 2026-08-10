import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

  if (!STRIPE_WEBHOOK_SECRET || !STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: "Stripe not configured" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing stripe-signature" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const body = await req.text();

  // Verify webhook signature using Stripe's HMAC approach
  const encoder = new TextEncoder();
  const parts = signature.split(",").reduce((acc: Record<string, string>, part) => {
    const [k, v] = part.split("=");
    acc[k] = v;
    return acc;
  }, {});

  const timestamp = parts["t"];
  const sigV1 = parts["v1"];
  const signedPayload = `${timestamp}.${body}`;

  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");

  if (hex !== sigV1) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const event = JSON.parse(body);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const invoiceId = session.metadata?.invoice_id;

    if (invoiceId && session.payment_status === "paid") {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );

      // Get invoice to calculate amount
      const { data: invoice } = await supabase
        .from("invoices")
        .select("id, total, status")
        .eq("id", invoiceId)
        .single();

      if (invoice && invoice.status !== "paid") {
        const amount = session.amount_total ? session.amount_total / 100 : (invoice.total ?? 0);

        await supabase.from("invoice_payments").insert({
          invoice_id: invoiceId,
          amount,
          method: "stripe",
          note: `Stripe session ${session.id}`,
          paid_at: new Date().toISOString(),
        });

        await supabase.from("invoices").update({
          status: "paid",
          paid_at: new Date().toISOString(),
        }).eq("id", invoiceId);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
