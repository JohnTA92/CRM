import { supabase } from "@/lib/supabase";

export async function createPaymentSession(invoiceId: string): Promise<{ url?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("create-payment-session", {
    body: { invoiceId },
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { url: data.url };
}

export async function startConnectOnboarding(): Promise<{ url?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("stripe-connect-onboard");
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { url: data.url };
}

export async function refreshConnectStatus(businessId: string): Promise<{
  charges_enabled?: boolean;
  details_submitted?: boolean;
  error?: string;
}> {
  const { data, error } = await supabase.functions.invoke("stripe-connect-callback", {
    body: { business_id: businessId },
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { charges_enabled: data.charges_enabled, details_submitted: data.details_submitted };
}
