import { supabase } from "@/lib/supabase";

export async function createPaymentSession(invoiceId: string): Promise<{ url?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("create-payment-session", {
    body: { invoiceId },
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { url: data.url };
}
