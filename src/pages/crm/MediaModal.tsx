import { useState } from "react";
import { X, ChevronLeft, ChevronRight, Play, Camera, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

type MediaTag = "before" | "after" | "general";
type MediaItem = {
  id: string;
  tag: MediaTag;
  url: string;
  file_name: string;
  file_type: string;
  notes?: string | null;
};

const TAG_COLORS: Record<MediaTag, string> = {
  before: "bg-[#fff3e0] text-[#e65100] border-[#ffcc80]",
  after: "bg-[#e8f5e9] text-[#2e7d32] border-[#a5d6a7]",
  general: "bg-paper-warm text-ink-soft border-paper-deep",
};

type Tab = "all" | "before" | "after" | "general";

interface MediaModalProps {
  media: MediaItem[];
  initialIdx: number | null;
  onClose: () => void;
  onDeleted?: (id: string) => void;
}

export function MediaModal({ media: initialMedia, initialIdx, onClose, onDeleted }: MediaModalProps) {
  const [items, setItems] = useState<MediaItem[]>(initialMedia);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [lightboxItem, setLightboxItem] = useState<MediaItem | null>(
    initialIdx !== null ? (initialMedia[initialIdx] ?? null) : null
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "before", label: "Before" },
    { key: "after", label: "After" },
    { key: "general", label: "General" },
  ].filter((t) => t.key === "all" || items.some((m) => m.tag === t.key));

  const visible = activeTab === "all" ? items : items.filter((m) => m.tag === activeTab);
  const currentIdx = lightboxItem ? visible.indexOf(lightboxItem) : -1;

  function prev() {
    if (currentIdx > 0) setLightboxItem(visible[currentIdx - 1]);
  }
  function next() {
    if (currentIdx < visible.length - 1) setLightboxItem(visible[currentIdx + 1]);
  }

  async function handleDelete(item: MediaItem, e?: React.MouseEvent) {
    e?.stopPropagation();
    setDeletingId(item.id);

    const parts = item.url.split("/job-media/");
    if (parts[1]) await supabase.storage.from("job-media").remove([parts[1]]);
    await supabase.from("job_media").delete().eq("id", item.id);

    const remaining = items.filter((m) => m.id !== item.id);
    setItems(remaining);
    onDeleted?.(item.id);
    setDeletingId(null);

    // Advance lightbox to next item or close if none left
    if (lightboxItem?.id === item.id) {
      const visibleAfter = (activeTab === "all" ? remaining : remaining.filter((m) => m.tag === activeTab));
      const nextItem = visibleAfter[Math.min(currentIdx, visibleAfter.length - 1)];
      setLightboxItem(nextItem ?? null);
    }
  }

  if (items.length === 0) {
    return (
      <>
        <div className="flex items-center justify-between px-5 py-4 border-b border-paper-deep">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-ink-quiet" />
            <h2 className="text-[15px] font-semibold text-ink">Before & After Photos</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="py-16 flex flex-col items-center text-center">
          <Camera className="w-8 h-8 text-ink-quiet opacity-30 mb-2" />
          <p className="text-[13px] text-ink-quiet">All photos deleted</p>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-paper-deep">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-ink-quiet" />
          <h2 className="text-[15px] font-semibold text-ink">Before & After Photos</h2>
          <span className="text-[12px] text-ink-quiet">({items.length})</span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex gap-1 px-5 pt-3 pb-0">
          {tabs.map((t) => {
            const count = t.key === "all" ? items.length : items.filter((m) => m.tag === t.key).length;
            return (
              <button key={t.key}
                onClick={() => { setActiveTab(t.key); setLightboxItem(null); }}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                  activeTab === t.key ? "bg-ink text-white" : "text-ink-soft hover:bg-paper-warm"
                }`}>
                {t.label} <span className="opacity-60 text-[11px]">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Lightbox view */}
      {lightboxItem ? (
        <div className="p-4">
          <div className="relative rounded-xl overflow-hidden bg-black">
            {lightboxItem.file_type?.startsWith("video/") ? (
              <video src={lightboxItem.url} controls autoPlay className="w-full max-h-[400px] object-contain" />
            ) : (
              <img src={lightboxItem.url} alt={lightboxItem.file_name} className="w-full max-h-[400px] object-contain" />
            )}
            {currentIdx > 0 && (
              <button onClick={prev}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            {currentIdx < visible.length - 1 && (
              <button onClick={next}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {/* Delete overlay button */}
            <button
              onClick={(e) => handleDelete(lightboxItem, e)}
              disabled={deletingId === lightboxItem.id}
              className="absolute top-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/60 text-white text-[12px] font-medium hover:bg-red-600/80 transition-colors"
            >
              {deletingId === lightboxItem.id
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Trash2 className="w-3.5 h-3.5" />}
              Delete
            </button>
          </div>

          {/* Info row */}
          <div className="flex items-center justify-between mt-3">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${TAG_COLORS[lightboxItem.tag]}`}>
              {lightboxItem.tag.charAt(0).toUpperCase() + lightboxItem.tag.slice(1)}
            </span>
            <div className="flex items-center gap-3">
              {lightboxItem.notes && <span className="text-[12px] text-ink-quiet">{lightboxItem.notes}</span>}
              <span className="text-[12px] text-ink-quiet">{currentIdx + 1} / {visible.length}</span>
              <button onClick={() => setLightboxItem(null)} className="text-[12px] text-ink-quiet hover:text-ink transition-colors">
                ← Back to grid
              </button>
            </div>
          </div>

          {/* Filmstrip */}
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {visible.map((m) => (
              <div key={m.id} onClick={() => setLightboxItem(m)}
                className={`w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                  m.id === lightboxItem.id ? "border-ink" : "border-transparent hover:border-ink/30"
                }`}>
                {m.file_type?.startsWith("video/")
                  ? <div className="w-full h-full bg-paper-dark flex items-center justify-center"><Play className="w-3 h-3 text-ink-quiet" /></div>
                  : <img src={m.url} alt="" className="w-full h-full object-cover" />}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Grid view */
        <div className="p-4">
          {visible.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-center">
              <Camera className="w-8 h-8 text-ink-quiet opacity-30 mb-2" />
              <p className="text-[13px] text-ink-quiet">No photos in this category</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {visible.map((m) => (
                <div key={m.id} onClick={() => setLightboxItem(m)}
                  className="aspect-square rounded-xl overflow-hidden border border-paper-deep cursor-pointer hover:opacity-90 hover:shadow-md transition-all relative group">
                  {m.file_type?.startsWith("video/")
                    ? <div className="w-full h-full bg-paper-dark flex items-center justify-center"><Play className="w-6 h-6 text-ink-quiet" /></div>
                    : <img src={m.url} alt={m.file_name} className="w-full h-full object-cover" />}
                  {/* Tag badge */}
                  <div className="absolute bottom-1.5 left-1.5">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${TAG_COLORS[m.tag]}`}>
                      {m.tag.charAt(0).toUpperCase() + m.tag.slice(1)}
                    </span>
                  </div>
                  {/* Delete button - appears on hover */}
                  <button
                    onClick={(e) => handleDelete(m, e)}
                    disabled={deletingId === m.id}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600/80"
                  >
                    {deletingId === m.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <X className="w-3 h-3" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
