'use client';

const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm', 'video/x-msvideo']);
export const MEDIA_BANK_POSTER_LIMITS = Object.freeze({ sourceBytes: 50 * 1024 * 1024, inputPixels: 16_777_216, edge: 480, bytes: 256 * 1024, timeoutMs: 8000 });

/** Best-effort extraction from an explicitly selected local File, never a remote URL. */
export async function createMediaBankVideoPoster(file: File): Promise<File | undefined> {
  if (typeof document === 'undefined' || !VIDEO_TYPES.has(file.type) || !file.size || file.size > MEDIA_BANK_POSTER_LIMITS.sourceBytes) return undefined;
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  try {
    return await new Promise<File | undefined>((resolve) => {
      let settled = false, capturing = false;
      let timer: ReturnType<typeof setTimeout>;
      const finish = (poster?: File) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        video.onloadedmetadata = video.onloadeddata = video.onseeked = video.onerror = null;
        video.removeAttribute('src');
        video.load();
        resolve(poster);
      };
      const validDimensions = () => Number.isSafeInteger(video.videoWidth) && Number.isSafeInteger(video.videoHeight)
        && video.videoWidth > 0 && video.videoHeight > 0
        && video.videoWidth * video.videoHeight <= MEDIA_BANK_POSTER_LIMITS.inputPixels;
      const capture = async () => {
        if (settled || capturing || video.readyState < 2) return;
        if (!validDimensions()) { finish(); return; }
        capturing = true;
        try {
          const scale = Math.min(1, MEDIA_BANK_POSTER_LIMITS.edge / Math.max(video.videoWidth, video.videoHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          const context = canvas.getContext('2d');
          if (!context) { finish(); return; }
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          for (const quality of [.82, .72, .62, .52]) {
            if (settled) return;
            const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/jpeg', quality));
            if (settled) return;
            if (blob?.type === 'image/jpeg' && blob.size > 0 && blob.size <= MEDIA_BANK_POSTER_LIMITS.bytes) {
              finish(new File([blob], 'video-poster.jpg', { type: 'image/jpeg' }));
              return;
            }
          }
          finish();
        } catch { finish(); }
      };
      video.onloadedmetadata = () => {
        if (!validDimensions() || !Number.isFinite(video.duration) || video.duration <= 0) { finish(); return; }
        try {
          video.currentTime = Math.min(.5, video.duration / 2);
        } catch { finish(); }
      };
      video.onseeked = () => { void capture(); };
      video.onloadeddata = () => { if (!video.seeking && video.currentTime > 0) void capture(); };
      video.onerror = () => finish();
      timer = setTimeout(() => finish(), MEDIA_BANK_POSTER_LIMITS.timeoutMs);
      video.src = url;
    });
  } catch { return undefined; }
  finally { URL.revokeObjectURL(url); }
}
