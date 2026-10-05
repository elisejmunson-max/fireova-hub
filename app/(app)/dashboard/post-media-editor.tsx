"use client";

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createMediaBankVideoPoster } from '@/lib/media-bank-video-poster';
import { browserReadyFile, isHeic } from '@/lib/media-bank/heic';
import { editableMedia, mediaMode, mediaSelectionError, movePostMedia, type MediaMode } from '@/lib/post-media-editor';
import type { ManualAsset as Asset } from '@/lib/manual-content-drafts';

type Upload = { id: string; name: string; type: string; size: number; path: string; token: string };
const json = async (response: Response) => response.json().catch(() => ({}));

export default function PostMediaEditor({ media, onChange, onAssets, busy, onBusy, onSave, onCancel }: {
  media: Asset[];
  onChange: (media: Asset[]) => void;
  onAssets: (assets: Asset[]) => void;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<MediaMode>(() => mediaMode(media));
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Asset[]>([]);
  const [page, setPage] = useState({ nextOffset: 0, hasMore: false });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const uploadLock = useRef(false);
  const requestVersion = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const onAssetsRef = useRef(onAssets);
  onAssetsRef.current = onAssets;
  const selectionError = mediaSelectionError(media);
  useEffect(() => { headingRef.current?.focus(); }, []);

  async function load(offset = 0) {
    const version = ++requestVersion.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true); setLoadError('');
    try {
      const params = new URLSearchParams({ q: query.trim(), filter: mode, offset: String(offset), limit: '24' });
      const response = await fetch(`/api/media-bank/library?${params}`, { cache: 'no-store', signal: controller.signal });
      const data = await json(response);
      if (!response.ok || !Array.isArray(data.items)) throw new Error(data.error || 'Could not load Media Bank. Please retry.');
      if (requestVersion.current !== version) return;
      const assets = (data.items as Asset[]).filter(editableMedia);
      setItems(current => [...new Map((offset ? [...current, ...assets] : assets).map(asset => [asset.id, asset])).values()]);
      setPage({ nextOffset: data.nextOffset, hasMore: Boolean(data.hasMore) });
      onAssetsRef.current(assets);
    } catch (error) {
      if (requestVersion.current === version && !controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Could not load Media Bank.');
    } finally { if (requestVersion.current === version) setLoading(false); }
  }
  useEffect(() => {
    // Invalidate immediately, before debounce, so older searches cannot flash results.
    requestVersion.current++; controllerRef.current?.abort(); setItems([]); setPage({ nextOffset: 0, hasMore: false }); setLoading(true);
    const timer = setTimeout(() => void load(), 200);
    return () => { clearTimeout(timer); requestVersion.current++; controllerRef.current?.abort(); };
  }, [query, mode, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  function switchMode(next: MediaMode) {
    if (busy || uploadLock.current || next === mode) return;
    setMode(next); onChange([]); setMessage('Choose replacement media, then save to update this draft.');
  }
  function select(asset: Asset) {
    if (busy || uploadLock.current || !editableMedia(asset) || (mode === 'video') !== asset.file_type.startsWith('video/')) return;
    if (media.some(item => item.id === asset.id)) { onChange(media.filter(item => item.id !== asset.id)); return; }
    if (mode === 'video') { onChange([asset]); setMessage(''); return; }
    if (media.length >= 10) { setMessage('A carousel can contain up to 10 photos. Remove a photo before adding another.'); return; }
    onChange([...media, asset]); setMessage('');
  }
  async function upload(files: FileList | null) {
    if (!files?.length || busy || uploadLock.current) return;
    const incoming = Array.from(files);
    const wrongType = incoming.some(file => mode === 'video' ? !file.type.startsWith('video/') : !(file.type.startsWith('image/') || isHeic(file)));
    if (wrongType) { setMessage(mode === 'video' ? 'Choose one video for a Reel.' : 'Choose photos only, or switch to Video Reel.'); return; }
    if ((mode === 'video' && incoming.length !== 1) || (mode === 'photo' && incoming.length + media.length > 10)) {
      setMessage(mode === 'video' ? 'Choose one video for a Reel.' : 'A carousel can contain up to 10 photos. Remove a photo before uploading more.'); return;
    }
    uploadLock.current = true; setUploading(true); onBusy(true); setMessage('Preparing upload…');
    const added: Asset[] = [], problems: string[] = [];
    try {
      const converted: File[] = [];
      for (const file of incoming) {
        try { converted.push(await browserReadyFile(file)); }
        catch { problems.push(`${file.name}: could not convert this photo. Try a JPEG or PNG copy.`); }
      }
      if (!converted.length) return;
      const start = await fetch('/api/media-bank/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', files: converted.map(file => ({ name: file.name, type: file.type, size: file.size })) }) });
      const prepared = await json(start);
      if (!start.ok || !Array.isArray(prepared.uploads)) throw new Error(prepared.error || 'Could not prepare upload.');
      if (prepared.duplicates?.length) problems.push(`${prepared.duplicates.length} already in Media Bank; search for them below.`);
      const sb = createClient() as any;
      for (const [index, item] of (prepared.uploads as Upload[]).entries()) {
        setMessage(`Uploading ${index + 1} of ${prepared.uploads.length}…`);
        try {
          const file = converted.find(candidate => candidate.name === item.name && candidate.size === item.size);
          if (!file) throw new Error('Could not match selected file.');
          const { error } = await sb.storage.from('media').uploadToSignedUrl(item.path, item.token, file, { contentType: file.type });
          if (error) throw error;
          // Finalize each file separately, so a later failure cannot hide earlier successes.
          const { token: _token, ...uploaded } = item;
          const complete = await fetch('/api/media-bank/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'complete', files: [uploaded] }) });
          const data = await json(complete);
          if (!complete.ok || !Array.isArray(data.assets)) throw new Error(data.error || 'Could not confirm upload. Check Media Bank before retrying.');
          const assets = (data.assets as Asset[]).filter(editableMedia);
          added.push(...assets);
          for (const asset of assets.filter(value => value.file_type.startsWith('video/'))) {
            try {
              const poster = await createMediaBankVideoPoster(file);
              if (!poster) throw new Error('Preview unavailable');
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 15000);
              try {
                const saved = await fetch(`/api/media-bank/poster/${encodeURIComponent(asset.id)}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: poster, signal: controller.signal });
                if (!saved.ok) throw new Error('Preview unavailable');
              } finally { clearTimeout(timeout); }
            } catch { problems.push(`${item.name}: video preview is unavailable; the original is uploaded and can still be used.`); }
          }
          if (!assets.length) problems.push(`${item.name} is already in Media Bank; search for it below.`);
        } catch (error) { problems.push(`${item.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`); }
      }
    } catch (error) { problems.push(error instanceof Error ? error.message : 'Upload failed.'); }
    finally {
      if (added.length) {
        onAssetsRef.current(added);
        const next = [...new Map([...media, ...added].map(asset => [asset.id, asset])).values()];
        onChange(mode === 'video' ? [added[0]] : next);
      }
      setMessage([added.length ? `${added.length} uploaded to Media Bank. Save media to apply to this post.` : '', ...problems].filter(Boolean).join(' ') || 'No new media uploaded.');
      setRefresh(value => value + 1); uploadLock.current = false; setUploading(false); onBusy(false);
    }
  }

  return <section aria-labelledby="edit-post-media-title" className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-3">
    <h3 id="edit-post-media-title" ref={headingRef} tabIndex={-1} className="text-sm font-semibold outline-none">Edit media</h3>
    <p className="mt-1 text-xs leading-5 text-stone-500">Use up to 10 photos or one video. Switching formats replaces this selection when you save.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={busy} aria-pressed={mode === 'photo'} onClick={() => switchMode('photo')} className={`btn-secondary ${mode === 'photo' ? 'ring-2 ring-orange-600' : ''}`}>Photos / carousel</button>
      <button type="button" disabled={busy} aria-pressed={mode === 'video'} onClick={() => switchMode('video')} className={`btn-secondary ${mode === 'video' ? 'ring-2 ring-orange-600' : ''}`}>Video Reel</button>
    </div>
    <ol aria-label="Post media" className="mt-3 space-y-2">
      {media.map((asset, index) => <li key={asset.id} data-media-id={asset.id} className="flex flex-wrap items-center gap-2 rounded border bg-white p-2">
        <span className="min-w-0 flex-1 break-all text-xs">{index + 1}. {asset.filename || (asset.missing ? 'Unavailable media' : asset.id)}</span>
        <div className="flex gap-1">
          <button type="button" disabled={busy || index === 0} aria-label={`Move media ${index + 1} earlier`} onClick={() => onChange(movePostMedia(media, index, -1))} className="rounded border px-2 py-1">↑</button>
          <button type="button" disabled={busy || index === media.length - 1} aria-label={`Move media ${index + 1} later`} onClick={() => onChange(movePostMedia(media, index, 1))} className="rounded border px-2 py-1">↓</button>
          <button type="button" disabled={busy} aria-label={`Remove media ${index + 1}`} onClick={() => onChange(media.filter((_, at) => at !== index))} className="rounded border px-2 py-1 text-xs">Remove</button>
        </div>
      </li>)}
    </ol>
    <label className="mt-4 block text-xs font-medium" htmlFor="post-media-upload">Upload photos or video</label>
    <input id="post-media-upload" type="file" multiple={mode === 'photo'} accept={mode === 'video' ? 'video/*' : 'image/*,.heic,.heif'} disabled={busy} onChange={event => { void upload(event.target.files); event.target.value = ''; }} className="mt-2 block w-full min-w-0 text-xs" />
    <p className="mt-1 text-xs leading-5 text-stone-500">Uploads are added to Media Bank, even if you cancel these post edits. Photographer credit stays blank unless already known.</p>
    <h4 className="mt-4 text-xs font-semibold">Choose from Media Bank</h4>
    <input aria-label="Search Media Bank for post" value={query} disabled={busy} onChange={event => setQuery(event.target.value)} placeholder="Search Media Bank" className="input mt-2" />
    <div aria-label="Choose from Media Bank" className="mt-2 grid max-h-52 grid-cols-3 gap-2 overflow-y-auto">
      {items.map(asset => <button type="button" key={asset.id} disabled={busy} aria-label={`Select ${asset.filename || asset.id}`} aria-pressed={media.some(item => item.id === asset.id)} onClick={() => select(asset)} className={`relative aspect-square overflow-hidden rounded bg-stone-200 ${media.some(item => item.id === asset.id) ? 'ring-2 ring-orange-600 ring-inset' : ''}`}>
        <img src={`/api/media-bank/thumbnail/${encodeURIComponent(asset.id)}`} alt="" loading="lazy" className="h-full w-full object-cover" />
        {media.some(item => item.id === asset.id) && <span aria-hidden="true" className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-orange-600 text-sm font-bold text-white">✓</span>}
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 p-1 text-[10px] text-white">{asset.file_type.startsWith('video/') ? '▶ ' : ''}{asset.filename || 'Media'}</span>
      </button>)}
    </div>
    {loading && <p role="status" className="mt-2 text-xs">Loading media…</p>}
    {!loading && !loadError && !items.length && <p className="mt-2 text-xs text-stone-500">No matching media found.</p>}
    {loadError && <div className="mt-2"><p role="alert" className="text-xs text-red-700">{loadError}</p><button type="button" disabled={busy || loading} onClick={() => void load(page.nextOffset && items.length ? page.nextOffset : 0)} className="mt-1 text-xs underline">Retry Media Bank</button></div>}
    {page.hasMore && <button type="button" disabled={busy || loading} onClick={() => void load(page.nextOffset)} className="btn-secondary mt-2">Load more media</button>}
    {message && <p role="status" className="mt-3 text-xs leading-5">{message}</p>}
    {selectionError && <p className="mt-3 text-xs text-amber-800">{selectionError}</p>}
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <button type="button" disabled={busy} onClick={onCancel} className="btn-secondary">Cancel media edits</button>
      <button type="button" disabled={busy || Boolean(selectionError)} onClick={onSave} className="btn-primary">{uploading ? 'Uploading…' : busy ? 'Saving media…' : 'Save media'}</button>
    </div>
  </section>;
}
