import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { invoiceId } = await req.json();
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: "invoiceId required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Stripe not configured. Add STRIPE_SECRET_KEY to Supabase secrets." }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*, customers(name, email)")
      .eq("id", invoiceId)
      .single();

    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (invoice.status === "paid") {
      return new Response(JSON.stringify({ error: "Invoice already paid" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const amountCents = Math.round((invoice.total ?? 0) * 100);
    if (amountCents < 50) {
      return new Response(JSON.stringify({ error: "Invoice total too small for online payment (min $0.50)" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const appUrl = Deno.env.get("APP_URL") ?? "https://example.com";

    const params = new URLSearchParams({
      "payment_method_types[]": "card",
      "mode": "payment",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][product_data][name]": `Invoice — ${invoice.customers?.name ?? "Customer"}`,
      "line_items[0][price_data][unit_amount]": String(amountCents),
      "line_items[0][quantity]": "1",
      "metadata[invoice_id]": invoiceId,
      "success_url": `${appUrl}/portal/${invoice.customer_id}?payment=success`,
      "cancel_url": `${appUrl}/portal/${invoice.customer_id}?payment=cancelled`,
    });

    const email = invoice.customers?.email;
    if (email) params.set("customer_email", email);

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();
    if (!stripeRes.ok) {
      return new Response(JSON.stringify({ error: session.error?.message ?? "Stripe error" }), {
        status: stripeRes.status, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Save the session URL on the invoice for reference
    await supabase.from("invoices").update({ stripe_session_id: session.id }).eq("id", invoiceId);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
