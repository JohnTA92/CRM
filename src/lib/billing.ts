import { supabase } from "@/lib/supabase";

export async function startSubscriptionCheckout(): Promise<{ url?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("create-subscription-checkout");
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { url: data.url };
}

export async function openBillingPortal(): Promise<{ url?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("create-billing-portal");
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { url: data.url };
}

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled" | null;

export function isSubscriptionActive(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trialing";
}

export function subscriptionLabel(status: SubscriptionStatus): string {
  switch (status) {
    case "active": return "Active";
    case "trialing": return "Free Trial";
    case "past_due": return "Payment Due";
    case "cancelled": return "Cancelled";
    default: return "No Subscription";
  }
}
