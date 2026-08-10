import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { X, Loader2, CheckCircle2, AlertCircle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "billing", label: "Billing" },
  { value: "bug", label: "Something's broken" },
  { value: "question", label: "General question" },
  { value: "other", label: "Other" },
] as const;

type Category = typeof CATEGORIES[number]["value"];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SupportModal({ open, onClose }: Props) {
  const { user, business } = useAuth();
  const [category, setCategory] = useState<Category>("question");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  if (!open) return null;

  async function handleSubmit() {
    if (!message.trim()) return;
    setStatus("sending");
    setErrorMsg("");

    const { error } = await supabase.from("support_requests").insert({
      business_id: business?.id ?? null,
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      business_name: business?.name ?? null,
      category,
      message: message.trim(),
      status: "open",
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }

    setStatus("sent");
  }

  function handleClose() {
    if (status === "sending") return;
    setMessage("");
    setCategory("question");
    setStatus("idle");
    setErrorMsg("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-white rounded-2xl border border-paper-deep shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-paper-deep">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-ink flex items-center justify-center">
              <MessageSquare className="w-3.5 h-3.5 text-white" />
            </div>
            <h2 className="text-[15px] font-semibold text-ink">Get Support</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-ink-quiet hover:text-ink hover:bg-paper-warm transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {status === "sent" ? (
          <div className="px-6 py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-[#f0fdf4] border border-[#86efac] flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-[#16a34a]" />
            </div>
            <p className="text-[15px] font-semibold text-ink">Message sent!</p>
            <p className="text-[13px] text-ink-quiet mt-2">
              We'll get back to you at <span className="font-medium text-ink">{user?.email}</span> as soon as possible.
            </p>
            <button
              onClick={handleClose}
              className="mt-6 px-5 py-2.5 rounded-lg text-[13px] font-semibold bg-ink text-white hover:bg-ink/80 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            {/* Category */}
            <div>
              <label className="block text-[12px] font-semibold text-ink-quiet mb-2">What do you need help with?</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setCategory(c.value)}
                    className={cn(
                      "px-3 py-2 rounded-lg text-[13px] font-medium border text-left transition-colors",
                      category === c.value
                        ? "bg-ink text-white border-ink"
                        : "bg-white border-paper-deep text-ink hover:border-ink/30 hover:bg-paper-warm"
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div>
              <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Describe the issue</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what's happening and we'll help you out…"
                rows={4}
                className="w-full px-3 py-2.5 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors resize-none"
              />
            </div>

            {/* Sender info */}
            <div className="bg-paper-warm rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-ink-quiet">
                Sending as <span className="font-medium text-ink">{user?.email}</span>
                {business?.name ? <> from <span className="font-medium text-ink">{business.name}</span></> : null}
              </p>
            </div>

            {errorMsg && (
              <p className="text-[12px] text-[#dc2626] flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {errorMsg}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={status === "sending" || !message.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors"
            >
              {status === "sending" ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
              ) : "Send Message"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
