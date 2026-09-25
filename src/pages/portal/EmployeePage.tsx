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

const button = "border rounded-lg px-3 py-2 bg-white disabled:opacity-40";
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
  return (
    <main className="min-h-screen bg-paper-warm p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="flex flex-wrap justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Employee Hub</h1>
            <p>
              {preview
                ? "Workspace view"
                : context
                ? `${context.business_name} · ${context.name}`
                : "Employee sign-in"}
            </p>
          </div>
          {preview && (
            <a href="/crew" className={button}>
              Back to crew
            </a>
          )}
          {user && !preview && (
            <button
              className={button}
              onClick={() => {
                stopSharing();
                void signOut();
              }}
            >
              Sign out
            </button>
          )}
        </header>
        {preview && (
          <section className="p-3 border rounded bg-white space-y-3">
            <p>This is an empty view of the employee hub. No employee is selected.
              Work actions and location sharing are available through an invited employee’s login.</p>
            <p>To test with saved information, add a crew member, enter a customer,
              then create a job and assign it to that crew member.</p>
            <div className="flex flex-wrap gap-3">
              <a className="underline" href="/crew">Add crew &amp; manage invitations</a>
              <a className="underline" href="/customers">Enter customers</a>
              <a className="underline" href="/jobs">Enter &amp; assign jobs</a>
              <a className="underline" href="/employee">Employee sign-in</a>
            </div>
          </section>
        )}
        {error && (
          <p
            role="alert"
            className="border border-red-300 p-3 rounded text-red-800"
          >
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="p-3 bg-white rounded">
            {notice}
          </p>
        )}
        {authLoading ? (
          <p>Loading…</p>
        ) : !user ? (
          <section className="bg-white p-4 rounded-xl space-y-3">
            <p>
              Use the email your manager invited. Employee accounts do not need
              a business account.
            </p>
            <label className="block">
              Email
              <input
                className="block border p-2 w-full rounded"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block">
              Password
              <input
                className="block border p-2 w-full rounded"
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button
              disabled={busy || preview || !email || !password}
              className={button}
              onClick={auth}
            >
              {signup ? "Create employee login" : "Sign in"}
            </button>
            <button className={button} onClick={() => setSignup(!signup)}>
              {signup ? "I already have a login" : "Create a login"}
            </button>
            <a href="/forgot-password" className="block underline">
              Forgot password
            </a>
          </section>
        ) : (
          <>
            {invite && (
              <section className="p-4 bg-white rounded">
                <p>
                  Accept your manager’s invitation using the matching verified
                  email.
                </p>
                <button
                  disabled={busy || preview}
                  className={button}
                  onClick={accept}
                >
                  Accept employee invitation
                </button>
              </section>
            )}
            {!context ? (
              <button className={button} onClick={load}>
                Refresh employee access
              </button>
            ) : (
              <>
                <section className="p-4 bg-white rounded-xl space-y-3">
                  <h2 className="font-semibold">Shift & breaks</h2>
                  <p>
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
                        className={button}
                        onClick={() => work("clock_in")}
                      >
                        Clock in
                      </button>
                    ) : (
                      <>
                        <button
                          disabled={busy || preview}
                          className={button}
                          onClick={() => work("clock_out")}
                        >
                          Clock out
                        </button>
                        {onBreak ? (
                          <button
                            disabled={busy || preview}
                            className={button}
                            onClick={() => work("end_break")}
                          >
                            End break
                          </button>
                        ) : (
                          <>
                            <button
                              disabled={busy || preview}
                              className={button}
                              onClick={() => work("break_short")}
                            >
                              Short break
                            </button>
                            <button
                              disabled={busy || preview}
                              className={button}
                              onClick={() => work("break_lunch")}
                            >
                              Lunch break
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </section>
                <section className="p-4 bg-white rounded-xl space-y-3">
                  <h2 className="font-semibold">
                    Location sharing · {sharing ? "On" : "Off"}
                  </h2>
                  <p className="text-sm">
                    Your business owner can see your latest location while you
                    are clocked in and this page is visible. Sharing stops when
                    you hide the app, take a break, clock out or press Stop.
                    This version stores the latest fix, not a travel history.
                  </p>
                  <p role="status">{geoStatus}</p>
                  {sharing ? (
                    <button className={button} onClick={() => stopSharing()}>
                      Stop sharing
                    </button>
                  ) : (
                    <button
                      disabled={preview || !shift || !!onBreak || busy}
                      className={button}
                      onClick={startSharing}
                    >
                      Start sharing location
                    </button>
                  )}
                </section>
                <section className="p-4 bg-white rounded-xl space-y-3">
                  <h2 className="font-semibold">My route</h2>
                  <label>
                    Work date{" "}
                    <input
                      aria-label="Work date"
                      className="border rounded p-2"
                      type="date"
                      value={day}
                      onChange={(e) => {
                        setDay(e.target.value);
                        setOptimized(false);
                      }}
                    />
                  </label>
                  <p className="text-sm">
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
                    <p>No open stops for this date.</p>
                  ) : (
                    <ol className="space-y-3">
                      {route.map((j: any, i: number) => (
                        <li key={j.id} className="border rounded p-3">
                          <strong>
                            {i + 1}. {j.title}
                          </strong>
                          <p>
                            {j.scheduled_time?.slice(0, 5) ?? "Flexible time"} ·{" "}
                            {j.customer_name}
                          </p>
                          <p>{j.address || "Address not set"}</p>
                          {!preview && navigationLink(j) && (
                            <a
                              className="underline"
                              href={navigationLink(j)!}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Navigate in Google Maps
                            </a>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
                <section className="space-y-3">
                  <h2 className="font-semibold">Assigned jobs</h2>
                  {jobs.length === 0 && <p>No assigned jobs for this date.</p>}
                  {jobs.map((j: any) => (
                    <article
                      key={j.id}
                      className="bg-white rounded-xl p-4 space-y-3"
                    >
                      <h3 className="font-semibold">{j.title}</h3>
                      <p>
                        {j.customer_name} · {j.status}
                      </p>
                      {j.phone && (
                        <a className="underline" href={`tel:${j.phone}`}>
                          Call customer
                        </a>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {j.status === "scheduled" && (
                          <button
                            disabled={busy || preview}
                            className={button}
                            onClick={() => work("start_job", j.id)}
                          >
                            Start job
                          </button>
                        )}
                        {j.status === "in-progress" && (
                          <button
                            disabled={busy || preview}
                            className={button}
                            onClick={() => work("complete_job", j.id)}
                          >
                            Complete job
                          </button>
                        )}
                      </div>
                      {(j.checklist ?? []).map((t: any) => (
                        <label key={t.id} className="flex gap-2">
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
                      {["scheduled", "in-progress", "complete"].includes(
                        j.status,
                      ) && (
                        <label className="block">
                          Add job photo
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
                            className="block max-w-full"
                          />
                        </label>
                      )}
                    </article>
                  ))}
                </section>
                <details className="bg-white p-4 rounded">
                  <summary>My recent time entries</summary>
                  {context.entries.map((e: any) => (
                    <p key={e.id} className="py-2 border-b">
                      {e.break_type ? `${e.break_type} break` : "Shift"} ·{" "}
                      {new Date(e.clocked_in_at).toLocaleString()} →{" "}
                      {e.clocked_out_at
                        ? new Date(e.clocked_out_at).toLocaleString()
                        : "Active"}
                    </p>
                  ))}
                </details>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
