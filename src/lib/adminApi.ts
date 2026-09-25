import { supabase } from "@/lib/supabase";

export type AdminErrorKind = "unauthenticated" | "forbidden" | "backend";

export interface AdminCallResult<T> {
  data: T | null;
  errorKind: AdminErrorKind | null;
  errorMessage: string | null;
}

/**
 * Invokes an admin-* edge function and classifies the failure instead of collapsing
 * every non-2xx response into a generic "Edge Function returned a non-2xx status code".
 * All admin-* functions in this project return { error: string } with 401 (no/invalid
 * session), 403 (authenticated but not an admin), or another status (unexpected backend
 * failure) — this reads the actual response body+status to tell those apart.
 */
export async function callAdminFunction<T = any>(name: string, body?: object): Promise<AdminCallResult<T>> {
  const { data, error } = await supabase.functions.invoke(name, body ? { body } : undefined);

  if (!error) {
    return { data: data as T, errorKind: null, errorMessage: null };
  }

  let status: number | undefined;
  let message: string | undefined;

  const ctx: Response | undefined = (error as any)?.context;
  if (ctx && typeof ctx.json === "function") {
    status = ctx.status;
    try {
      const parsed = await ctx.json();
      message = parsed?.error;
    } catch {
      // Non-JSON error body — fall through to the generic message below.
    }
  }

  if (status === 401) {
    return {
      data: null,
      errorKind: "unauthenticated",
      errorMessage: message ?? "Your session has expired or is missing. Please sign in again.",
    };
  }

  if (status === 403) {
    return {
      data: null,
      errorKind: "forbidden",
      errorMessage: message ?? "This account doesn't have admin access.",
    };
  }

  return {
    data: null,
    errorKind: "backend",
    errorMessage: message ?? error.message ?? "Couldn't reach the server. Please try again.",
  };
}
