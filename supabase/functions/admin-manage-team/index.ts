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

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await anonClient.auth.getUser();

    // Only super admins can manage the team
    if (!user?.app_metadata?.is_super_admin) {
      return new Response(JSON.stringify({ error: "Only super admins can manage team access" }), {
        status: 403, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "list": {
        const { data } = await service.auth.admin.listUsers();
        const admins = (data?.users ?? [])
          .filter((u: any) => u.app_metadata?.is_admin)
          .map((u: any) => ({
            id: u.id,
            email: u.email,
            is_super_admin: u.app_metadata?.is_super_admin === true,
            created_at: u.created_at,
          }));
        return new Response(JSON.stringify({ admins }), { headers: { ...CORS, "Content-Type": "application/json" } });
      }

      case "grant": {
        const { email } = body;
        if (!email) return new Response(JSON.stringify({ error: "email required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

        // Find user by email
        const { data } = await service.auth.admin.listUsers();
        const target = (data?.users ?? []).find((u: any) => u.email === email);
        if (!target) return new Response(JSON.stringify({ error: "No user found with that email. They must sign up first." }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });

        await service.auth.admin.updateUserById(target.id, {
          app_metadata: { ...target.app_metadata, is_admin: true },
        });

        return new Response(JSON.stringify({ ok: true, message: `${email} is now an admin.` }), { headers: { ...CORS, "Content-Type": "application/json" } });
      }

      case "revoke": {
        const { user_id } = body;
        if (!user_id) return new Response(JSON.stringify({ error: "user_id required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

        // Prevent revoking your own access
        if (user_id === user.id) {
          return new Response(JSON.stringify({ error: "You cannot revoke your own admin access." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
        }

        const { data: targetData } = await service.auth.admin.getUserById(user_id);
        const meta = { ...targetData?.user?.app_metadata };
        delete meta.is_admin;
        delete meta.is_super_admin;

        await service.auth.admin.updateUserById(user_id, { app_metadata: meta });

        return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
