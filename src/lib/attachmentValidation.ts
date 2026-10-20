// Single source of truth for the client-side pre-flight check. Mirrors the
// customer_attachments_file_type_allowed / customer_attachments_file_size_valid
// CHECK constraints in supabase/migrations/20260927020000_customer_attachments.sql
// and the customer-media bucket's allowed_mime_types/file_size_limit — the two
// cannot literally share code, so keep both in sync by hand if either changes.
export const ATTACHMENT_ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic",
  "video/mp4", "video/quicktime", "video/webm",
  "application/pdf",
] as const;

export const ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

export type AttachmentValidation = { ok: true } | { ok: false; reason: string };

export function validateAttachmentFile(file: { type: string; size: number }): AttachmentValidation {
  if (!ATTACHMENT_ALLOWED_TYPES.includes(file.type as (typeof ATTACHMENT_ALLOWED_TYPES)[number])) {
    return { ok: false, reason: "That file type isn't supported. Upload an image, video, or PDF." };
  }
  if (file.size <= 0) {
    return { ok: false, reason: "That file appears to be empty." };
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return { ok: false, reason: `That file is too large. The limit is ${formatFileSize(ATTACHMENT_MAX_BYTES)}.` };
  }
  return { ok: true };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unitIndex]}`;
}
