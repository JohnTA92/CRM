import { useEffect, useState, type ImgHTMLAttributes, type VideoHTMLAttributes } from "react";
import { supabase } from "./supabase";

export type FileBucket = "job-media" | "expense-receipts";

// Persist object paths, never expiring signed URLs. Read old Supabase URLs too.
export function storagePath(bucket: FileBucket, value: string): string {
  if (!value.includes("://")) return value;
  const url = new URL(value);
  const marker = `/${bucket}/`;
  const index = url.pathname.indexOf(marker);
  if (index < 0) throw new Error("This file does not belong to the expected storage bucket.");
  return decodeURIComponent(url.pathname.slice(index + marker.length));
}

export function newFilePath(businessId: string, parentId: string, file: File): string {
  if (!businessId) throw new Error("Sign in to a business before uploading files.");
  const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "bin";
  return `${businessId}/${parentId}/${crypto.randomUUID()}.${extension}`;
}

function usePrivateFile(bucket: FileBucket, path: string) {
  const [result, setResult] = useState<{ path: string; url: string; error: boolean }>({ path: "", url: "", error: false });
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath(bucket, path), 3600);
        if (error || !data) throw error;
        if (!cancelled) setResult({ path, url: data.signedUrl, error: false });
      } catch {
        if (!cancelled) setResult({ path, url: "", error: true });
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 45 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [bucket, path]);
  return result.path === path ? result : { url: "", error: false };
}

export function PrivateImage({ bucket = "job-media", src = "", alt, ...props }: ImgHTMLAttributes<HTMLImageElement> & { bucket?: FileBucket }) {
  const { url, error } = usePrivateFile(bucket, src);
  if (!url) return <span role="status" className="text-xs text-ink-quiet">{error ? "Image unavailable" : "Loading image…"}</span>;
  return <img {...props} src={url} alt={alt} />;
}

export function PrivateVideo({ src = "", ...props }: VideoHTMLAttributes<HTMLVideoElement>) {
  const { url, error } = usePrivateFile("job-media", src);
  if (!url) return <span role="status" className="text-xs text-ink-quiet">{error ? "Video unavailable" : "Loading video…"}</span>;
  return <video {...props} src={url} />;
}

export async function deletePrivateMedia(id: string, path: string) {
  const { error: fileError } = await supabase.storage.from("job-media").remove([storagePath("job-media", path)]);
  if (fileError) throw fileError;
  const { error } = await supabase.from("job_media").delete().eq("id", id).select("id").single();
  if (error) throw error;
}
