import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { X, Info, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Announcement {
  id: string;
  message: string;
  type: "info" | "warning" | "success";
}

export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    supabase.functions.invoke("admin-announcements", { body: { action: "get_active" } })
      .then(({ data }) => {
        if (data?.announcement) setAnnouncement(data.announcement);
      });
  }, []);

  if (!announcement || dismissed === announcement.id) return null;

  const styles = {
    info: { bg: "bg-[#eff6ff] border-[#bfdbfe]", text: "text-[#1d4ed8]", icon: <Info className="w-4 h-4 flex-shrink-0 mt-0.5" /> },
    warning: { bg: "bg-[#fffbeb] border-[#fde68a]", text: "text-[#92400e]", icon: <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> },
    success: { bg: "bg-[#f0fdf4] border-[#bbf7d0]", text: "text-[#166534]", icon: <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> },
  };

  const s = styles[announcement.type] ?? styles.info;

  return (
    <div className={cn("flex items-start gap-3 px-5 py-3 border-b", s.bg, s.text)}>
      {s.icon}
      <p className="flex-1 text-[13px] font-medium">{announcement.message}</p>
      <button
        onClick={() => setDismissed(announcement.id)}
        className="flex-shrink-0 p-0.5 rounded hover:opacity-70 transition-opacity"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
