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
    const { request_id, status, admin_notes } = await req.json();

    if (!request_id) return new Response(JSON.stringify({ error: "request_id required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    const updates: Record<string, any> = {};
    if (status) updates.status = status;
    if (admin_notes !== undefined) updates.admin_notes = admin_notes;
    if (status === "resolved") updates.resolved_at = new Date().toISOString();

    await service.from("support_requests").update(updates).eq("id", request_id);

    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
