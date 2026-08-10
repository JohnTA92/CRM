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

    // Verify caller is admin via their JWT
    const anonClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
    if (!user.app_metadata?.is_admin) return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });

    // Use service role to read all businesses + owner emails
    const service = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const { data: businesses, error } = await service
      .from("businesses")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Attach owner emails from auth.users
    const userIds = businesses.map((b: any) => b.owner_id).filter(Boolean);
    const { data: users } = await service.auth.admin.listUsers();
    const emailMap: Record<string, string> = {};
    (users?.users ?? []).forEach((u: any) => { emailMap[u.id] = u.email; });

    const enriched = businesses.map((b: any) => ({
      ...b,
      owner_email: emailMap[b.owner_id] ?? null,
    }));

    return new Response(JSON.stringify({ businesses: enriched }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
