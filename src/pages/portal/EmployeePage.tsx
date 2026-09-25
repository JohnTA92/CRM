import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { newFilePath } from "@/lib/privateStorage";
import { foregroundLocation } from "@/lib/foregroundLocation";
import {
  navigationLink,
  suggestRoute,
  type Point,
} from "@/lib/employeeRouting";
import { cn } from "@/lib/utils";
import {
  Clock, MapPin, Navigation as NavigationIcon, LogOut, AlertCircle,
  CheckCircle2, Loader2, Camera, Phone, Play, Square, Coffee,
  UtensilsCrossed, ListChecks, Leaf,
} from "lucide-react";

const button = "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-paper-deep bg-white text-ink-soft hover:bg-paper-warm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const buttonPrimary = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold bg-ink text-white hover:bg-ink/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const linkClass = "text-[12px] text-ink-quiet hover:text-ink transition-colors underline inline-flex items-center gap-1";
const inputClass = "w-full px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors";
const labelClass = "block text-[12px] font-semibold text-ink-quiet mb-1";

function jobStatusPill(s: string) {
  const m: Record<string, string> = {
    draft: "bg-paper-warm text-ink-soft border-paper-deep",
    quoted: "bg-[#fff3e0] text-[#e65100] border-[#ffe0b2]",
    scheduled: "bg-[#e3f2fd] text-[#1565c0] border-[#bfdbfe]",
    "in-progress": "bg-[#fff8e1] text-[#f57f17] border-[#fde68a]",
    complete: "bg-[#e8f5e9] text-[#2e7d32] border-[#bbf7d0]",
    invoiced: "bg-paper-warm text-ink-soft border-paper-deep",
  };
  return m[s] ?? "bg-paper-warm text-ink-soft border-paper-deep";
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function EmployeePage({ preview = false }: { preview?: boolean }) {
  const { user, loading: authLoading, signOut } = useAuth();
  const [context, setContext] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [signup, setSignup] = useState(false);
  const [invite, setInvite] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get("invite") ?? "",
  );
  const [day, setDay] = useState(today()),
    [optimized, setOptimized] = useState(false),
    [point, setPoint] = useState<Point>();
  const [sharing, setSharing] = useState(false),
    [geoStatus, setGeoStatus] = useState("Location sharing is off.");
  const tracker = useRef<ReturnType<typeof foregroundLocation> | null>(null),
    session = useRef<string | null>(null);
  const generation = useRef(0),
    loadVersion = useRef(0);
  const shift = context?.entries.find(
      (e: any) => !e.break_type && !e.clocked_out_at,
    ),
    onBreak = context?.entries.find(
      (e: any) => e.break_type && !e.clocked_out_at,
    );
  async function load() {
    const version = ++loadVersion.current;
    if (preview) {
      setContext({ entries: [], jobs: [] });
      setError("");
      return;
    }
    const { data, error } = await supabase.rpc("employee_context");
    if (version !== loadVersion.current) return;
    if (error) {
      setContext(null);
      setError(error.message);
    } else {
      setContext(data);
      setError("");
    }
  }
  useEffect(() => {
    setContext(null);
    if (user) void load();
    return () => {
      loadVersion.current++;
    };
  }, [user?.id, preview]);
  function stopSharing(message = "Location sharing is off.") {
    generation.current++;
    tracker.current?.stop();
    tracker.current = null;
    const previous = session.current;
    session.current = null;
    setSharing(false);
    setPoint(undefined);
    setGeoStatus(message);
    if (previous)
      void supabase
        .rpc("employee_location", { _session: previous, _action: "stop" })
        .then(({ error }) => {
          if (error && !session.current)
            setGeoStatus(
              "Stopped on this device. Server will mark the last fix stale within 2 minutes.",
            );
        });
  }
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState !== "visible")
        stopSharing(
          "Sharing stopped because the app was hidden. Press Start to resume.",
        );
    };
    const leave = () =>
      stopSharing("Sharing stopped because this page closed.");
    const offline = () =>
      stopSharing("Offline. Sharing stopped; the last fix will expire.");
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    window.addEventListener("offline", offline);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("offline", offline);
      stopSharing();
    };
  }, [user?.id]);
  async function startSharing() {
    if (preview || !shift || onBreak || sharing || busy) return;
    if (!window.isSecureContext || !navigator.geolocation) {
      setGeoStatus("Location needs HTTPS and a browser with location support.");
      return;
    }
    const version = ++generation.current,
      token = crypto.randomUUID();
    session.current = token;
    setBusy(true);
    setGeoStatus("Starting location sharing…");
    const { error } = await supabase.rpc("employee_location", {
      _session: token,
      _action: "start",
    });
    setBusy(false);
    if (error) {
      session.current = null;
      setGeoStatus(error.message);
      return;
    }
    if (
      version !== generation.current ||
      document.visibilityState !== "visible"
    ) {
      void supabase.rpc("employee_location", {
        _session: token,
        _action: "stop",
      });
      return;
    }
    setSharing(true);
    setGeoStatus("Waiting for device location permission and a fresh fix…");
    let poll: number | undefined;
    tracker.current = foregroundLocation({
      visible: () => document.visibilityState === "visible",
      watch: (ok, fail) => {
        const options = {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 20000,
        };
        const id = navigator.geolocation.watchPosition(ok, fail, options);
        poll = window.setInterval(() => {
          if (document.visibilityState === "visible")
            navigator.geolocation.getCurrentPosition(ok, fail, options);
        }, 30000);
        return id;
      },
      clear: (id) => {
        navigator.geolocation.clearWatch(id);
        if (poll !== undefined) clearInterval(poll);
      },
      send: async (p) => {
        const { error } = await supabase.rpc("employee_location", {
          _session: token,
          _action: "update",
          _latitude: p.latitude,
          _longitude: p.longitude,
          _accuracy: p.accuracy,
        });
        if (error) throw Error(error.message);
        if (session.current === token) {
          setPoint(p);
          setGeoStatus(
            `Shared at ${new Date().toLocaleTimeString()} · accuracy about ${Math.round(p.accuracy)} m`,
          );
        }
      },
      onError: (message) => stopSharing(message),
    });
    tracker.current.start();
  }
  async function auth() {
    setBusy(true);
    setError("");
    const result = signup
      ? await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/employee` },
        })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    setPassword("");
    if (result.error) setError(result.error.message);
    else if (signup)
      setNotice(
        "Check your email to verify your account, then reopen your invitation and sign in.",
      );
  }
  async function accept() {
    setBusy(true);
    const { error } = await supabase.rpc("accept_employee_invite", {
      _token: invite,
    });
    setBusy(false);
    if (error) setError(error.message);
    else {
      setInvite("");
      history.replaceState(null, "", location.pathname);
      await load();
    }
  }
  async function work(
    action: string,
    jobId?: string,
    taskId?: string,
    done?: boolean,
  ) {
    if (preview) return;
    if (busy) return;
    setBusy(true);
    setError("");
    if (["clock_out", "break_lunch", "break_short"].includes(action))
      stopSharing();
    const { error } = await supabase.rpc("employee_work", {
      _action: action,
      _job_id: jobId ?? null,
      _task_id: taskId ?? null,
      _done: done ?? null,
    });
    setBusy(false);
    if (error) setError(error.message);
    else await load();
  }
  async function upload(job: any, file?: File) {
    if (preview) return;
    if (!file || busy) return;
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      setError("Choose a photo under 10 MB.");
      return;
    }
    setBusy(true);
    setError("");
    const path = newFilePath(context.business_id, job.id, file);
    const { error } = await supabase.storage
      .from("job-media")
      .upload(path, file);
    if (error) setError(error.message);
    else {
      const result = await supabase.rpc("employee_attach_photo", {
        _job_id: job.id,
        _path: path,
        _file_name: file.name,
        _file_type: file.type,
      });
      if (result.error)
        setError(
          `Photo uploaded, but could not attach it: ${result.error.message}. Ask your manager to review uploads.`,
        );
      else setNotice("Photo saved to the job.");
    }
    setBusy(false);
  }
  const jobs = context?.jobs.filter((j: any) => j.scheduled_date === day) ?? [];
  const route = optimized
    ? suggestRoute(jobs, point)
    : jobs.filter((j: any) =>
        ["scheduled", "in-progress", "quoted"].includes(j.status),
      );

  const body = (
    <>
        {preview && (
          <section className="bg-white rounded-xl border border-paper-deep p-4 space-y-3">
            <p className="text-[13px] text-ink-soft">This is an empty view of the employee hub. No employee is selected.
              Work actions and location sharing are available through an invited employee's login.</p>
            <p className="text-[13px] text-ink-soft">To test with saved information, add a crew member, enter a customer,
              then create a job and assign it to that crew member.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <a className={linkClass} href="/crew">Add crew &amp; manage invitations</a>
              <a className={linkClass} href="/customers">Enter customers</a>
              <a className={linkClass} href="/jobs">Enter &amp; assign jobs</a>
              <a className={linkClass} href="/employee">Employee sign-in</a>
            </div>
          </section>
        )}

        {error && (
          <p role="alert" className="bg-[#fef2f2] border border-[#fecaca] rounded-lg px-4 py-3 text-[13px] text-[#dc2626] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </p>
        )}
        {notice && (
          <p role="status" className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg px-4 py-3 text-[13px] text-[#166534] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {notice}
          </p>
        )}

        {authLoading ? (
          <p className="text-[13px] text-ink-quiet flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
        ) : !user ? (
          <section className="bg-white rounded-xl border border-paper-deep p-5 space-y-3">
            <p className="text-[13px] text-ink-soft">
              Use the email your manager invited. Employee accounts do not need
              a business account.
            </p>
            <label className="block">
              <span className={labelClass}>Email</span>
              <input
                className={inputClass}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Password</span>
              <input
                className={inputClass}
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy || preview || !email || !password}
                className={buttonPrimary}
                onClick={auth}
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {signup ? "Create employee login" : "Sign in"}
              </button>
              <button className={button} onClick={() => setSignup(!signup)}>
                {signup ? "I already have a login" : "Create a login"}
              </button>
            </div>
            <a href="/forgot-password" className={linkClass}>
              Forgot password
            </a>
          </section>
        ) : (
          <>
            {invite && (
              <section className="bg-white rounded-xl border border-paper-deep p-4 space-y-3">
                <p className="text-[13px] text-ink-soft">
                  Accept your manager's invitation using the matching verified
                  email.
                </p>
                <button
                  disabled={busy || preview}
                  className={buttonPrimary}
                  onClick={accept}
                >
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Accept employee invitation
                </button>
              </section>
            )}
            {!context ? (
              <button className={button} onClick={load}>Refresh employee access</button>
            ) : (
              <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <section className="bg-white rounded-xl border border-paper-deep p-4 space-y-3">
                  <h2 className="text-[15px] font-semibold text-ink flex items-center gap-2">
                    <Clock className="w-4 h-4 text-ink-quiet" /> Shift &amp; breaks
                  </h2>
                  <p className="text-[13px] text-ink-soft">
                    {shift
                      ? onBreak
                        ? "On break"
                        : "Clocked in"
                      : preview ? "No employee selected" : "Clocked out"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {!shift ? (
                      <button
                        disabled={busy || preview}
                        className={buttonPrimary}
                        onClick={() => work("clock_in")}
                      >
                        <Play className="w-3.5 h-3.5" /> Clock in
                      </button>
                    ) : (
                      <>
                        <button
                          disabled={busy || preview}
                          className={button}
                          onClick={() => work("clock_out")}
                        >
                          <Square className="w-3.5 h-3.5" /> Clock out
                        </button>
                        {onBreak ? (
                          <button
                            disabled={busy || preview}
                            className={button}
                            onClick={() => work("end_break")}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> End break
                          </button>
                        ) : (
                          <>
                            <button
                              disabled={busy || preview}
                              className={button}
                              onClick={() => work("break_short")}
                            >
                              <Coffee className="w-3.5 h-3.5" /> Short break
                            </button>
                            <button
                              disabled={busy || preview}
                              className={button}
                              onClick={() => work("break_lunch")}
                            >
                              <UtensilsCrossed className="w-3.5 h-3.5" /> Lunch break
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </section>
                <section className="bg-white rounded-xl border border-paper-deep p-4 space-y-3">
                  <h2 className="text-[15px] font-semibold text-ink flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-ink-quiet" /> Location sharing · {sharing ? "On" : "Off"}
                  </h2>
                  <p className="text-[13px] text-ink-quiet">
                    Your business owner can see your latest location while you
                    are clocked in and this page is visible. Sharing stops when
                    you hide the app, take a break, clock out or press Stop.
                    This version stores the latest fix, not a travel history.
                  </p>
                  <p role="status" className="text-[12px] text-ink-quiet">{geoStatus}</p>
                  {sharing ? (
                    <button className={button} onClick={() => stopSharing()}>
                      <Square className="w-3.5 h-3.5" /> Stop sharing
                    </button>
                  ) : (
                    <button
                      disabled={preview || !shift || !!onBreak || busy}
                      className={buttonPrimary}
                      onClick={startSharing}
                    >
                      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <MapPin className="w-3.5 h-3.5" /> Start sharing location
                    </button>
                  )}
                </section>
              </div>
                <section className="bg-white rounded-xl border border-paper-deep p-4 space-y-3">
                  <h2 className="text-[15px] font-semibold text-ink flex items-center gap-2">
                    <NavigationIcon className="w-4 h-4 text-ink-quiet" /> My route
                  </h2>
                  <label className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] text-ink">Work date</span>
                    <input
                      aria-label="Work date"
                      className={cn(inputClass, "w-auto")}
                      type="date"
                      value={day}
                      onChange={(e) => {
                        setDay(e.target.value);
                        setOptimized(false);
                      }}
                    />
                  </label>
                  <p className="text-[12px] text-ink-quiet">
                    Timed appointments keep their order. Suggest order arranges
                    flexible stops by straight-line distance using saved site
                    pins. It does not account for roads, traffic or arrival
                    windows. Stops without pins stay listed for manual review.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={button}
                      onClick={() => setOptimized(!optimized)}
                    >
                      {optimized ? "Use schedule order" : "Suggest stop order"}
                    </button>
                    <button
                      className={button}
                      disabled={busy || preview}
                      onClick={load}
                    >
                      Refresh jobs
                    </button>
                  </div>
                  {route.length === 0 ? (
                    <p className="text-[13px] text-ink-quiet">No open stops for this date.</p>
                  ) : (
                    <ol className="space-y-2.5">
                      {route.map((j: any, i: number) => (
                        <li key={j.id} className="border border-paper-deep rounded-lg p-3.5">
                          <p className="text-[13px] font-semibold text-ink">
                            {i + 1}. {j.title}
                          </p>
                          <p className="text-[12px] text-ink-quiet mt-0.5">
                            {j.scheduled_time?.slice(0, 5) ?? "Flexible time"} ·{" "}
                            {j.customer_name}
                          </p>
                          <p className="text-[12px] text-ink-quiet">{j.address || "Address not set"}</p>
                          {!preview && navigationLink(j) && (
                            <a
                              className={cn(linkClass, "mt-1.5")}
                              href={navigationLink(j)!}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <NavigationIcon className="w-3 h-3" /> Navigate in Google Maps
                            </a>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
                <section className="space-y-2.5">
                  <h2 className="text-[15px] font-semibold text-ink flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-ink-quiet" /> Assigned jobs
                  </h2>
                  {jobs.length === 0 && <p className="text-[13px] text-ink-quiet">No assigned jobs for this date.</p>}
                  {jobs.map((j: any) => (
                    <article
                      key={j.id}
                      className="bg-white rounded-xl border border-paper-deep p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <h3 className="text-[14px] font-semibold text-ink">{j.title}</h3>
                          <p className="text-[12px] text-ink-quiet mt-0.5">{j.customer_name}</p>
                        </div>
                        <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize border", jobStatusPill(j.status))}>
                          {j.status.replace("-", " ")}
                        </span>
                      </div>
                      {j.phone && (
                        <a className={linkClass} href={`tel:${j.phone}`}>
                          <Phone className="w-3 h-3" /> Call customer
                        </a>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {j.status === "scheduled" && (
                          <button
                            disabled={busy || preview}
                            className={buttonPrimary}
                            onClick={() => work("start_job", j.id)}
                          >
                            <Play className="w-3.5 h-3.5" /> Start job
                          </button>
                        )}
                        {j.status === "in-progress" && (
                          <button
                            disabled={busy || preview}
                            className={buttonPrimary}
                            onClick={() => work("complete_job", j.id)}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Complete job
                          </button>
                        )}
                      </div>
                      {(j.checklist ?? []).length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {(j.checklist ?? []).map((t: any) => (
                            <label key={t.id} className="flex gap-2 items-center text-[13px] text-ink">
                              <input
                                type="checkbox"
                                checked={t.done}
                                disabled={
                                  busy ||
                                  preview ||
                                  !["scheduled", "in-progress"].includes(j.status)
                                }
                                onChange={(e) =>
                                  work("check_task", j.id, t.id, e.target.checked)
                                }
                              />
                              {t.text}
                            </label>
                          ))}
                        </div>
                      )}
                      {["scheduled", "in-progress", "complete"].includes(
                        j.status,
                      ) && (
                        <label className="block pt-1">
                          <span className={labelClass}>
                            <Camera className="w-3.5 h-3.5 inline mr-1 -mt-0.5" /> Add job photo
                          </span>
                          <input
                            aria-label={`Add photo to ${j.title}`}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            disabled={busy || preview}
                            onChange={(e) => {
                              void upload(j, e.target.files?.[0]);
                              e.target.value = "";
                            }}
                            className="block max-w-full text-[12px] text-ink-quiet file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-paper-deep file:bg-white file:text-[12px] file:font-medium file:text-ink-soft hover:file:bg-paper-warm file:transition-colors file:cursor-pointer"
                          />
                        </label>
                      )}
                    </article>
                  ))}
                </section>
                <details className="bg-white rounded-xl border border-paper-deep overflow-hidden [&_summary::-webkit-details-marker]:hidden">
                  <summary className="text-[13px] font-semibold text-ink cursor-pointer px-4 py-3 hover:bg-paper-warm transition-colors">
                    My recent time entries
                  </summary>
                  <div className="px-4 pb-3 border-t border-paper-deep divide-y divide-paper-deep">
                    {context.entries.map((e: any) => (
                      <p key={e.id} className="py-2.5 text-[13px] text-ink-soft">
                        {e.break_type ? `${e.break_type} break` : "Shift"} ·{" "}
                        {new Date(e.clocked_in_at).toLocaleString()} →{" "}
                        {e.clocked_out_at
                          ? new Date(e.clocked_out_at).toLocaleString()
                          : "Active"}
                      </p>
                    ))}
                  </div>
                </details>
              </>
            )}
          </>
        )}
    </>
  );

  // Owner preview renders inside the real app shell (Sidebar + content area) via
  // the /employee-preview route nested in AppLayout — same page-header convention
  // as every other CRM page (Dashboard, Crew, Jobs), not a standalone screen.
  if (preview) {
    return (
      <div className="p-8 max-w-4xl">
        <div className="mb-7">
          <h1 className="text-[22px] font-semibold text-ink">Employee Hub</h1>
          <p className="text-[14px] text-ink-quiet mt-1">Workspace view</p>
        </div>
        <div className="space-y-5">{body}</div>
      </div>
    );
  }

  // A real employee is never staff and must never see office/admin navigation —
  // this mirrors the customer portal's own header bar (logo + business name, no
  // nav links) rather than reusing the staff Sidebar.
  return (
    <main className="min-h-screen bg-paper-warm">
      <div className="bg-white border-b border-paper-deep">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-moss flex items-center justify-center flex-shrink-0">
              <Leaf className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-ink truncate">{context ? context.business_name : "Employee Hub"}</p>
              <p className="text-[12px] text-ink-quiet truncate">{context ? context.name : "Employee sign-in"}</p>
            </div>
          </div>
          {user && (
            <button
              className={cn(button, "flex-shrink-0")}
              onClick={() => {
                stopSharing();
                void signOut();
              }}
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          )}
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">{body}</div>
    </main>
  );
}
