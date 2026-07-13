import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/design-system/primitives/Button";
import { MediaModal } from "./MediaModal";
import {
  Camera, Upload, X, Play, Loader2, Briefcase, Tag, Search, Filter, Users,
} from "lucide-react";

type MediaTag = "before" | "after" | "general";
type MediaItem = {
  id: string;
  job_id: string | null;
  customer_id: string | null;
  tag: MediaTag;
  url: string;
  file_name: string;
  file_type: string;
  notes: string | null;
  created_at: string;
  // joined
  jobTitle?: string;
  customerName?: string;
};


export function MediaPage() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [jobs, setJobs] = useState<{ id: string; title: string; customer_id: string; status: string }[]>([]);
  const [customerList, setCustomerList] = useState<{ id: string; name: string }[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // filters
  const [searchQ, setSearchQ] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [filterJob, setFilterJob] = useState("all");
  const [filterTag, setFilterTag] = useState("all");

  // upload
  const [showUpload, setShowUpload] = useState(false);
  const [uploadCustomerId, setUploadCustomerId] = useState("");
  const [uploadJobId, setUploadJobId] = useState("");
  const [uploadTag, setUploadTag] = useState<MediaTag>("general");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // modal: which job's media is open
  const [modalJobId, setModalJobId] = useState<string | null>(null);

  // delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [mediaRes, jobRes, custRes] = await Promise.all([
      supabase.from("job_media").select("*").order("created_at", { ascending: false }),
      supabase.from("jobs").select("id, title, customer_id, status").order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name"),
    ]);

    const custMap: Record<string, string> = {};
    if (custRes.data) {
      custRes.data.forEach((c: any) => { custMap[c.id] = c.name; });
      setCustomerList(custRes.data.map((c: any) => ({ id: c.id, name: c.name })));
    }
    setCustomers(custMap);

    const jobList = jobRes.data ?? [];
    setJobs(jobList);

    if (mediaRes.data) {
      const jobMap: Record<string, string> = {};
      jobList.forEach((j: any) => { jobMap[j.id] = j.title; });
      const items: MediaItem[] = mediaRes.data.map((row: any) => ({
        ...row,
        jobTitle: row.job_id ? jobMap[row.job_id] : undefined,
        customerName: row.customer_id ? custMap[row.customer_id] : undefined,
      }));
      setMedia(items);
    }
    setLoading(false);
  }

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) setUploadFiles(Array.from(e.target.files));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    setUploadFiles(files);
  }

  function resetUploadModal() {
    setShowUpload(false);
    setUploadFiles([]);
    setUploadNotes("");
    setUploadTag("general");
    setUploadJobId("");
    setUploadCustomerId("");
    setUploadError(null);
  }

  function handleCustomerChange(custId: string) {
    setUploadCustomerId(custId);
    // clear job if it doesn't belong to this customer
    if (custId && uploadJobId) {
      const job = jobs.find((j) => j.id === uploadJobId);
      if (job && job.customer_id !== custId) setUploadJobId("");
    }
  }

  function handleJobChange(jobId: string) {
    setUploadJobId(jobId);
    // auto-fill customer from job
    if (jobId) {
      const job = jobs.find((j) => j.id === jobId);
      if (job) setUploadCustomerId(job.customer_id);
    }
  }

  async function handleUpload() {
    if (uploadFiles.length === 0) return;
    setUploading(true);
    setUploadError(null);

    const resolvedCustomerId = uploadCustomerId ||
      (uploadJobId ? jobs.find((j) => j.id === uploadJobId)?.customer_id : undefined) || null;

    for (const file of uploadFiles) {
      const ext = file.name.split(".").pop();
      const path = `${uploadJobId || "no-job"}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: storageErr } = await supabase.storage
        .from("job-media")
        .upload(path, file, { contentType: file.type });

      if (storageErr) { setUploadError(storageErr.message); setUploading(false); return; }

      const { data: urlData } = supabase.storage.from("job-media").getPublicUrl(path);

      await supabase.from("job_media").insert({
        job_id: uploadJobId || null,
        customer_id: resolvedCustomerId,
        tag: uploadTag,
        url: urlData.publicUrl,
        file_name: file.name,
        file_type: file.type,
        notes: uploadNotes.trim() || null,
      });
    }

    setUploading(false);
    resetUploadModal();
    loadAll();
  }

  async function handleDelete(item: MediaItem) {
    setDeletingId(item.id);
    const parts = item.url.split("/job-media/");
    if (parts[1]) await supabase.storage.from("job-media").remove([parts[1]]);
    await supabase.from("job_media").delete().eq("id", item.id);
    setMedia((prev) => prev.filter((m) => m.id !== item.id));
    setDeletingId(null);
  }

  const filtered = media.filter((m) => {
    if (filterCustomer !== "all" && m.customer_id !== filterCustomer) return false;
    if (filterJob !== "all" && m.job_id !== filterJob) return false;
    if (filterTag !== "all" && m.tag !== filterTag) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      if (!(m.jobTitle ?? "").toLowerCase().includes(q) &&
          !(m.customerName ?? "").toLowerCase().includes(q) &&
          !(m.notes ?? "").toLowerCase().includes(q) &&
          !(m.file_name ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Group filtered media by job
  const jobGroups: { jobId: string | null; jobTitle: string; customerName: string; items: MediaItem[] }[] = [];
  const seenJobs = new Set<string>();
  for (const m of filtered) {
    const key = m.job_id ?? "__no_job__";
    if (!seenJobs.has(key)) {
      seenJobs.add(key);
      jobGroups.push({
        jobId: m.job_id,
        jobTitle: m.jobTitle ?? "Unlinked",
        customerName: m.customerName ?? "",
        items: [],
      });
    }
    jobGroups.find((g) => (g.jobId ?? "__no_job__") === key)!.items.push(m);
  }

  const modalMedia = modalJobId
    ? media.filter((m) => m.job_id === modalJobId)
    : [];

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-ink flex items-center gap-2">
            <Camera className="w-5 h-5 text-ink-quiet" /> Job Media
          </h1>
          <p className="text-[13px] text-ink-quiet mt-0.5">Before & after photos and videos tied to jobs</p>
        </div>
        <Button className="w-auto gap-1.5" onClick={() => setShowUpload(true)}>
          <Upload className="w-4 h-4" /> Upload Job Media
        </Button>
      </div>

      {/* Stats strip */}
      {!loading && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Files", value: media.length },
            { label: "Before", value: media.filter((m) => m.tag === "before").length },
            { label: "After", value: media.filter((m) => m.tag === "after").length },
            { label: "Jobs Covered", value: new Set(media.filter((m) => m.job_id).map((m) => m.job_id)).size },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl border border-paper-deep px-5 py-3.5 flex items-center justify-between">
              <p className="text-[13px] text-ink-quiet font-medium">{label}</p>
              <p className="text-[22px] font-bold text-ink leading-none">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-quiet" />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search by job, customer, notes…"
            className="w-full pl-8 pr-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-ink-quiet" />
          <select value={filterCustomer} onChange={(e) => { setFilterCustomer(e.target.value); setFilterJob("all"); }}
            className="px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none appearance-none">
            <option value="all">All Customers</option>
            {customerList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterJob} onChange={(e) => setFilterJob(e.target.value)}
            className="px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none appearance-none">
            <option value="all">All Jobs</option>
            {(filterCustomer === "all" ? jobs : jobs.filter((j) => j.customer_id === filterCustomer))
              .map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
          <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}
            className="px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none appearance-none">
            <option value="all">All Tags</option>
            <option value="before">Before</option>
            <option value="after">After</option>
            <option value="general">General</option>
          </select>
        </div>
      </div>

      {/* Job-grouped cards */}
      {loading ? (
        <div className="flex items-center gap-2 text-ink-quiet py-16 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /><span className="text-[14px]">Loading media…</span>
        </div>
      ) : jobGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-paper-dark flex items-center justify-center mb-3">
            <Camera className="w-6 h-6 text-ink-quiet" />
          </div>
          <p className="text-[14px] font-medium text-ink mb-1">No media yet</p>
          <p className="text-[13px] text-ink-quiet">Upload before & after photos or videos for your jobs</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobGroups.map((group) => {
            const beforeCount = group.items.filter((m) => m.tag === "before").length;
            const afterCount = group.items.filter((m) => m.tag === "after").length;
            const preview = group.items.slice(0, 4);
            return (
              <div
                key={group.jobId ?? "__no_job__"}
                onClick={() => setModalJobId(group.jobId)}
                className="bg-white rounded-xl border border-paper-deep overflow-hidden cursor-pointer hover:border-ink/20 hover:shadow-md transition-all group"
              >
                {/* 2x2 photo preview grid */}
                <div className="grid grid-cols-2 gap-0.5 bg-paper-deep aspect-video">
                  {preview.map((m) => (
                    <div key={m.id} className="overflow-hidden bg-paper-dark">
                      {m.file_type?.startsWith("video/")
                        ? <div className="w-full h-full flex items-center justify-center min-h-[60px]"><Play className="w-5 h-5 text-ink-quiet" /></div>
                        : <img src={m.url} alt="" className="w-full h-full object-cover" loading="lazy" />}
                    </div>
                  ))}
                  {/* Fill empty slots */}
                  {Array.from({ length: Math.max(0, 4 - preview.length) }).map((_, i) => (
                    <div key={`empty-${i}`} className="bg-paper-warm flex items-center justify-center min-h-[60px]">
                      <Camera className="w-4 h-4 text-ink-quiet opacity-30" />
                    </div>
                  ))}
                </div>

                {/* Card footer */}
                <div className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-ink truncate group-hover:text-accent transition-colors">
                        {group.jobTitle}
                      </p>
                      {group.customerName && (
                        <p className="text-[11px] text-ink-quiet truncate mt-0.5 flex items-center gap-1">
                          <Users className="w-3 h-3 flex-shrink-0" />{group.customerName}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {beforeCount > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#fff3e0] text-[#e65100] border border-[#ffcc80]">
                          {beforeCount} before
                        </span>
                      )}
                      {afterCount > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#e8f5e9] text-[#2e7d32] border border-[#a5d6a7]">
                          {afterCount} after
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-ink-quiet mt-2">
                    {group.items.length} file{group.items.length !== 1 ? "s" : ""} · tap to view
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-job media modal */}
      {modalJobId !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setModalJobId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}>
            <MediaModal
              media={modalMedia}
              initialIdx={0}
              onClose={() => setModalJobId(null)}
            />
          </div>
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-paper-deep">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-paper-dark flex items-center justify-center">
                  <Camera className="w-4 h-4 text-ink-soft" />
                </div>
                <h2 className="text-[15px] font-semibold text-ink">Upload Job Media</h2>
              </div>
              <button onClick={resetUploadModal}
                className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  uploadFiles.length > 0
                    ? "border-accent bg-accent/5"
                    : "border-paper-deep hover:border-ink/30 hover:bg-paper-warm"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  capture="environment"
                  className="hidden"
                  onChange={onFilePick}
                />
                {uploadFiles.length > 0 ? (
                  <div>
                    <p className="text-[14px] font-semibold text-ink">{uploadFiles.length} file{uploadFiles.length > 1 ? "s" : ""} selected</p>
                    <p className="text-[12px] text-ink-quiet mt-1">{uploadFiles.map((f) => f.name).join(", ")}</p>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-6 h-6 text-ink-quiet mx-auto mb-2" />
                    <p className="text-[13px] font-medium text-ink">Drag & drop or tap to pick</p>
                    <p className="text-[12px] text-ink-quiet mt-1">Photos or videos · multiple allowed · use camera on mobile</p>
                  </div>
                )}
              </div>

              {/* Tag */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" /> Tag
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["before", "after", "general"] as MediaTag[]).map((t) => (
                    <button key={t} onClick={() => setUploadTag(t)}
                      className={`py-2 rounded-lg text-[13px] font-medium border transition-colors ${
                        uploadTag === t
                          ? TAG_COLORS[t] + " border"
                          : "border-paper-deep text-ink-soft hover:border-ink/30"
                      }`}>
                      {TAG_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Customer */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Customer
                </label>
                <select value={uploadCustomerId} onChange={(e) => handleCustomerChange(e.target.value)}
                  className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors appearance-none">
                  <option value="">Select a customer…</option>
                  {customerList.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Job */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5" /> Job (optional)
                </label>
                <select value={uploadJobId} onChange={(e) => handleJobChange(e.target.value)}
                  className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors appearance-none">
                  <option value="">No specific job</option>
                  {(uploadCustomerId
                    ? jobs.filter((j) => j.customer_id === uploadCustomerId)
                    : jobs
                  ).filter((j) => ["complete", "invoiced"].includes(j.status))
                   .map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}{!uploadCustomerId && customers[j.customer_id] ? ` — ${customers[j.customer_id]}` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-ink-quiet mt-1">
                  {uploadCustomerId
                    ? "Showing completed jobs for selected customer"
                    : "Select a customer to filter · only completed jobs shown"}
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-1.5">Notes (optional)</label>
                <input type="text" value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="e.g. Front lawn, south side…"
                  className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors" />
              </div>

              {uploadError && (
                <div className="bg-[#fef2f2] border border-[#fecaca] rounded-xl px-4 py-3 text-[13px] text-[#dc2626]">
                  {uploadError}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-paper-deep flex gap-2 justify-end">
              <Button variant="secondary" size="sm" className="w-auto" onClick={resetUploadModal}>
                Cancel
              </Button>
              <Button size="sm" className="w-auto gap-1.5" onClick={handleUpload}
                disabled={uploading || uploadFiles.length === 0}>
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {uploading ? "Uploading…" : `Upload ${uploadFiles.length > 0 ? uploadFiles.length + " file" + (uploadFiles.length > 1 ? "s" : "") : ""}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
