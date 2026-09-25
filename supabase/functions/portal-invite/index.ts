import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Staff-only. Mirrors the auth pattern in admin-manage-team/index.ts: verify the
// caller via their own JWT, then use the service role only for the privileged parts
// (generating the magic link, upserting the access grant).
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json();
    const { action, customer_id } = body;
    if (!customer_id || !/^[0-9a-f-]{36}$/i.test(customer_id) || (action && !["invite", "revoke"].includes(action))) {
      return new Response(JSON.stringify({ error: "customer_id required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Load the customer and confirm the caller is a member of that customer's
    // business — never trust a business_id passed in the request body.
    const { data: customer } = await service
      .from("customers")
      .select("id, name, email, business_id")
      .eq("id", customer_id)
      .single();

    if (!customer || !customer.business_id) {
      return new Response(JSON.stringify({ error: "Customer not found or not assigned to a business yet." }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: membership } = await service
      .from("business_members")
      .select("id")
      .eq("business_id", customer.business_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "You don't have access to this customer's business." }), {
        status: 403, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (action === "revoke") {
      const { error: revokeError } = await service
        .from("customer_portal_access")
        .update({ revoked_at: new Date().toISOString() })
        .eq("customer_id", customer_id)
        .eq("business_id", customer.business_id)
        .is("revoked_at", null);

      if (revokeError) throw revokeError;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Default action: create/refresh an invite.
    if (!customer.email) {
      return new Response(JSON.stringify({ error: "This customer has no email on file yet — add one before sending a portal invite." }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Local development default only; configure APP_URL before customer launch.
    const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:58227";
    // Never mint a login for the customer's real email: it could belong to an
    // existing staff/admin user or a customer of a different business. Each invite
    // has a dedicated principal, authorized only by its expiring grant.
    const portalEmail = `portal-${crypto.randomUUID()}@example.invalid`;

    const { error: createError } = await service.auth.admin.createUser({
      email: portalEmail, email_confirm: true, app_metadata: { portal_only: true },
    });
    if (createError) throw createError;

    const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
      type: "magiclink",
      email: portalEmail,
      options: { redirectTo: `${APP_URL}/portal/${customer_id}` },
    });

    if (linkError || !linkData) {
      return new Response(JSON.stringify({ error: linkError?.message ?? "Could not generate a portal link." }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const authUserId = linkData.user?.id;
    if (!authUserId) {
      return new Response(JSON.stringify({ error: "Could not resolve the portal user." }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { error: identityError } = await service.auth.admin.updateUserById(authUserId, {
      app_metadata: { portal_only: true },
    });
    if (identityError) throw identityError;
    // Revoke any prior active grants for this customer before issuing a new one —
    // one active invite at a time keeps "revoke" unambiguous from the staff side.
    const { error: priorRevokeError } = await service
      .from("customer_portal_access")
      .update({ revoked_at: new Date().toISOString() })
      .eq("customer_id", customer_id)
      .is("revoked_at", null);

    if (priorRevokeError) throw priorRevokeError;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: grantError } = await service.from("customer_portal_access").insert({
      user_id: authUserId,
      customer_id,
      business_id: customer.business_id,
      expires_at: expiresAt,
      created_by: user.id,
    });

    if (grantError) {
      return new Response(JSON.stringify({ error: grantError.message }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      link: `${APP_URL}/portal/${customer_id}#portal_token=${encodeURIComponent(linkData.properties.hashed_token)}`,
      expires_at: expiresAt,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
