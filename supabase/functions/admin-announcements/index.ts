import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const service = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await anonClient.auth.getUser();
    const body = await req.json();
    const { action } = body;

    // GET active announcements — any authenticated user can call this
    if (action === "get_active") {
      if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
      const { data } = await service
        .from("announcements")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1);
      return new Response(JSON.stringify({ announcement: data?.[0] ?? null }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // All write actions require admin
    if (!user?.app_metadata?.is_admin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (action === "list") {
      const { data } = await service
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return new Response(JSON.stringify({ announcements: data ?? [] }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (action === "create") {
      const { message, type } = body;
      if (!message?.trim()) return new Response(JSON.stringify({ error: "message required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

      // Deactivate any existing active announcements first
      await service.from("announcements").update({ active: false }).eq("active", true);

      const { data, error } = await service.from("announcements").insert({
        message: message.trim(),
        type: type ?? "info",
        active: true,
        created_by: user.id,
        created_by_email: user.email,
      }).select().single();

      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, announcement: data }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (action === "dismiss") {
      const { id } = body;
      if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      await service.from("announcements").update({ active: false }).eq("id", id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
