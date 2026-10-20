import assert from 'node:assert/strict';
import { validateAttachmentFile, formatFileSize, ATTACHMENT_MAX_BYTES } from '../../../src/lib/attachmentValidation.ts';

// Every allowed type is accepted at a normal size.
for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf']) {
  assert.deepEqual(validateAttachmentFile({ type, size: 1024 }), { ok: true });
}

// A disallowed type is rejected with a clear reason.
{
  const result = validateAttachmentFile({ type: 'application/zip', size: 1024 });
  assert.equal(result.ok, false);
  assert.match(result.reason, /not supported|image, video, or PDF/i);
}

// An empty file is rejected.
{
  const result = validateAttachmentFile({ type: 'image/png', size: 0 });
  assert.equal(result.ok, false);
}

// Exactly at the limit is accepted; one byte over is rejected.
assert.deepEqual(validateAttachmentFile({ type: 'image/png', size: ATTACHMENT_MAX_BYTES }), { ok: true });
{
  const result = validateAttachmentFile({ type: 'image/png', size: ATTACHMENT_MAX_BYTES + 1 });
  assert.equal(result.ok, false);
  assert.match(result.reason, /too large/i);
}

// formatFileSize is human-readable across scales.
assert.equal(formatFileSize(512), '512 B');
assert.equal(formatFileSize(2048), '2 KB');
assert.equal(formatFileSize(1536), '1.5 KB');
assert.equal(formatFileSize(5 * 1024 * 1024), '5 MB');
assert.equal(formatFileSize(ATTACHMENT_MAX_BYTES), '50 MB');

console.log('PASS: attachment type/size validation and human-readable file size formatting.');
