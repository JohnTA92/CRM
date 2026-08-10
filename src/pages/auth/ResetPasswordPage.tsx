import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Leaf, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(() => navigate("/", { replace: true }), 2000);
  }

  return (
    <div className="min-h-screen bg-paper-warm flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-moss flex items-center justify-center">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <span className="text-[20px] font-bold text-ink">FieldCRM</span>
        </div>

        <div className="bg-white rounded-2xl border border-paper-deep shadow-sm p-8">
          {done ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#e8f5e9] flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6 text-[#2e7d32]" />
              </div>
              <h1 className="text-[18px] font-semibold text-ink mb-2">Password updated</h1>
              <p className="text-[13px] text-ink-quiet">Redirecting you to the dashboard…</p>
            </div>
          ) : (
            <>
              <h1 className="text-[20px] font-semibold text-ink mb-1">Set new password</h1>
              <p className="text-[13px] text-ink-quiet mb-6">Choose a new password for your account.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">New Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    required
                    autoFocus
                    className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Confirm Password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter password"
                    required
                    className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#fef2f2] border border-[#fecaca] text-[13px] text-[#dc2626]">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !password || !confirm}
                  className="w-full py-2.5 rounded-lg text-[14px] font-semibold bg-moss text-white hover:bg-moss/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? "Updating…" : "Update Password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
