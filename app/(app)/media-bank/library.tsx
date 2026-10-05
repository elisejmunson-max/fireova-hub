"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { browserReadyFile, isHeic } from "@/lib/media-bank/heic";
import {
  MEDIA_PAGE_SIZE,
  mergeMediaPages,
  type MediaBankAsset,
  type MediaFilter,
} from "@/lib/media-bank-pagination";
import { MediaPageRequests } from "@/lib/media-bank-requests";
import { createMediaBankVideoPoster } from "@/lib/media-bank-video-poster";
type A = MediaBankAsset;
type Counts = { all: number; photo: number; video: number };
type U = {
  id: string;
  name: string;
  type: string;
  size: number;
  path: string;
  token: string;
};
type Page = {
  items: A[];
  total: number;
  counts: Counts;
  hasMore: boolean;
  nextOffset: number;
};
const vals = (a: A, p: string) =>
  (a.tags || []).filter((t) => t.startsWith(p)).map((t) => t.slice(p.length));
async function responseJson(r: Response) {
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return { error: "Unexpected server response." };
  }
}
function MediaThumbnail({ asset }: { asset: A }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-stone-500">
        <span className="line-clamp-2">{asset.filename}</span>
        <span>Preview unavailable. Open to view.</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFailed(false);
          }}
          className="underline"
        >
          Retry preview
        </button>
      </div>
    );
  return (
    <>
      <img
        src={`/api/media-bank/thumbnail/${encodeURIComponent(asset.id)}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        alt={asset.filename}
        className="h-full w-full object-cover"
      />
      {asset.file_type.startsWith("video/") && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-2xl text-white">
            ▶
          </span>
        </span>
      )}
    </>
  );
}
export default function MediaLibrary({
  initialAssets,
  initialCounts,
  initialError = "",
}: {
  initialAssets: A[];
  initialCounts: Counts;
  initialError?: string;
}) {
  const uploadInFlight = useRef(false);
  const [assets, setAssets] = useState<A[]>(initialAssets),
    [counts, setCounts] = useState(initialCounts),
    [total, setTotal] = useState(initialCounts.all),
    [hasMore, setHasMore] = useState(initialAssets.length < initialCounts.all),
    [selected, setSelected] = useState<A | null>(null),
    [detailAssets, setDetailAssets] = useState<A[] | null>(null),
    [detailLoading, setDetailLoading] = useState(false),
    [checked, setChecked] = useState<Set<string>>(new Set()),
    [filter, setFilter] = useState<MediaFilter>("all"),
    [search, setSearch] = useState(""),
    [settledSearch, setSettledSearch] = useState(""),
    [credit, setCredit] = useState(""),
    [people, setPeople] = useState(""),
    [uploading, setUploading] = useState(false),
    [retagging, setRetagging] = useState(false),
    [saving, setSaving] = useState(false),
    [drag, setDrag] = useState(false),
    [msg, setMsg] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(initialError),
    [show, setShow] = useState(false),
    [slides, setSlides] = useState<A[]>([]),
    [showIndex, setShowIndex] = useState(0),
    [playing, setPlaying] = useState(true);
  const mounted = useRef(true);
  const input = useRef<HTMLInputElement>(null),
    sentinel = useRef<HTMLDivElement>(null),
    requests = useRef(new MediaPageRequests("all:", initialAssets.length)),
    queryRef = useRef({ filter, search: settledSearch }),
    selectedRef = useRef<A | null>(null),
    navigation = useRef(0),
    slideshowStarting = useRef(false),
    first = useRef(true),
    sb = useMemo(() => createClient(), []),
    peopleFor = (a: A) => vals(a, "person:"),
    creditFor = (a: A) => vals(a, "photographer:")[0] || "",
    originalUrl = (a: A) =>
      sb.storage.from("media").getPublicUrl(a.storage_path).data.publicUrl;
  queryRef.current = { filter, search: settledSearch };
  selectedRef.current = selected;
  useEffect(() => {
    mounted.current = true;
    const state = requests.current;
    return () => {
      mounted.current = false;
      state.cancel();
    };
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSettledSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  const load = useCallback(async (reset: boolean) => {
    if (!mounted.current) return;
    const query = queryRef.current,
      attempt = requests.current.begin(
        `${query.filter}:${query.search}`,
        reset,
      );
    if (!attempt) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        offset: String(attempt.offset),
        limit: String(MEDIA_PAGE_SIZE),
        filter: query.filter,
        q: query.search,
      });
      const response = await fetch(`/api/media-bank/library?${params}`, {
        signal: attempt.signal,
      });
      const data = (await responseJson(response)) as Page & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load media.");
      if (
        !Array.isArray(data.items) ||
        !data.counts ||
        !Number.isSafeInteger(data.nextOffset) ||
        data.nextOffset < attempt.offset ||
        (data.hasMore && data.nextOffset === attempt.offset)
      )
        throw new Error("Unexpected media response. Please retry.");
      if (!requests.current.complete(attempt.token, data.nextOffset)) return;
      setAssets((current) =>
        mergeMediaPages(current, data.items, attempt.reset),
      );
      setCounts(data.counts);
      setTotal(data.total);
      setHasMore(data.hasMore);
      setLoading(false);
    } catch (reason) {
      if (!requests.current.fail(attempt.token, attempt.reset)) return;
      if ((reason as Error).name !== "AbortError")
        setError(
          reason instanceof Error ? reason.message : "Could not load media.",
        );
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (filter === "all" && !settledSearch) return;
    }
    setAssets([]);
    setHasMore(false);
    void load(true);
  }, [filter, settledSearch, load]);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || loading || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void load(false);
      },
      { rootMargin: "500px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, error, load]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (show) setShow(false);
        else if (selected) close();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [show, selected]);
  useEffect(() => {
    if (!show || !playing || !slides.length) return;
    const t = setInterval(
      () => setShowIndex((i) => (i + 1) % slides.length),
      3000,
    );
    return () => clearInterval(t);
  }, [show, playing, slides.length]);
  useEffect(() => {
    if (!msg || uploading || retagging) return;
    const t = setTimeout(() => setMsg(""), 2500);
    return () => clearTimeout(t);
  }, [msg, uploading, retagging]);
  function toggle(id: string) {
    setChecked((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function open(a: A) {
    selectedRef.current = a;
    navigation.current++;
    setDetailAssets(null);
    setSelected(a);
    setCredit(creditFor(a));
    setPeople(peopleFor(a).join(", "));
  }
  function close() {
    selectedRef.current = null;
    navigation.current++;
    setSelected(null);
    setDetailLoading(false);
  }
  async function move(dir: number) {
    if (!selected || detailLoading) return;
    let list = detailAssets || assets;
    let index = list.findIndex((a) => a.id === selected.id);
    const missingFromLoaded = index < 0;
    const token = ++navigation.current;
    if (
      !detailAssets &&
      hasMore &&
      (missingFromLoaded || index + dir < 0 || index + dir >= list.length)
    ) {
      setDetailLoading(true);
      try {
        list = await fetchAll(queryRef.current.filter);
        if (
          token !== navigation.current ||
          selectedRef.current?.id !== selected.id
        )
          return;
        setDetailAssets(list);
        index = list.findIndex((a) => a.id === selected.id);
        if (index < 0) index = dir > 0 ? -1 : 0;
      } catch (e) {
        if (token === navigation.current)
          setMsg(e instanceof Error ? e.message : "Could not load next media.");
        return;
      } finally {
        if (token === navigation.current) setDetailLoading(false);
      }
    }
    // An edited item may no longer belong to the active query: next starts at first, previous at last.
    if (index < 0) index = dir > 0 ? -1 : 0;
    const next = list[(index + dir + list.length) % list.length];
    if (next) {
      setSelected(next);
      setCredit(creditFor(next));
      setPeople(peopleFor(next).join(", "));
    }
  }
  function frames(a: A) {
    return new Promise<string[]>((resolve, reject) => {
      const v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.muted = true;
      v.preload = "auto";
      v.src = originalUrl(a);
      const out: string[] = [];
      v.onloadedmetadata = async () => {
        try {
          for (const time of [0.08, 0.28, 0.5, 0.72, 0.92].map((x) =>
            Math.min(v.duration * x, Math.max(v.duration - 0.05, 0)),
          )) {
            await new Promise<void>((ok, bad) => {
              v.onseeked = () => ok();
              v.onerror = () => bad(new Error("frame"));
              v.currentTime = time;
            });
            const c = document.createElement("canvas"),
              w = Math.min(v.videoWidth || 720, 720),
              h = Math.round(
                (v.videoHeight || 1280) * (w / (v.videoWidth || 720)),
              );
            c.width = w;
            c.height = h;
            c.getContext("2d")?.drawImage(v, 0, 0, w, h);
            out.push(c.toDataURL("image/jpeg", 0.72));
          }
          resolve(out);
        } catch (e) {
          reject(e);
        }
      };
      v.onerror = () => reject(new Error("video"));
    });
  }
  async function analyze(a: A) {
    try {
      let endpoint = "/api/media-bank/analyze",
        body: any = { assetId: a.id };
      if (a.file_type.startsWith("video/")) {
        endpoint = "/api/analyze-video";
        body.frames = await frames(a);
      } else if (!a.file_type.startsWith("image/")) return false;
      const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        d = await responseJson(r);
      if (d?.ok)
        setAssets((v) =>
          v.map((x) =>
            x.id === a.id
              ? {
                  ...x,
                  tags: d.tags || x.tags,
                  ai_categories: d.ai_categories || x.ai_categories,
                }
              : x,
          ),
        );
      return !!d?.ok;
    } catch {
      return false;
    }
  }
  async function fetchAll(type: MediaFilter = "all") {
    const query = queryRef.current.search;
    let offset = 0;
    let items: A[] = [];
    for (;;) {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: "60",
        filter: type,
        q: query,
      });
      const r = await fetch(`/api/media-bank/library?${params}`),
        d = (await responseJson(r)) as Page & { error?: string };
      if (!r.ok) throw new Error(d.error || "Could not load media.");
      if (
        !Array.isArray(d.items) ||
        !Number.isSafeInteger(d.nextOffset) ||
        (d.hasMore && d.nextOffset <= offset)
      )
        throw new Error("Unexpected media response.");
      items = mergeMediaPages(items, d.items);
      if (!d.hasMore) return items;
      offset = d.nextOffset;
    }
  }
  async function retag() {
    setRetagging(true);
    try {
      const media = await fetchAll();
      let done = 0;
      for (let i = 0; i < media.length; i++) {
        setMsg(`AI tagging ${i + 1} of ${media.length}…`);
        if (await analyze(media[i])) done++;
      }
      setMsg(`${done} items searchable.`);
      await load(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Tagging failed.");
    } finally {
      setRetagging(false);
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.length || uploadInFlight.current) return;
    uploadInFlight.current = true;
    setUploading(true);
    setMsg("Preparing media…");
    try {
      const converted: File[] = [];
      for (const f of Array.from(files))
        if (
          f.type.startsWith("image/") ||
          f.type.startsWith("video/") ||
          isHeic(f)
        )
          converted.push(await browserReadyFile(f));
      if (!converted.length)
        throw new Error("No supported photos or videos found.");
      const start = await fetch("/api/media-bank/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "start",
            files: converted.map((f) => ({
              name: f.name,
              type: f.type,
              size: f.size,
            })),
          }),
        }),
        prepared = await responseJson(start);
      if (!start.ok)
        throw new Error(prepared.error || "Could not prepare upload");
      const uploads = (prepared.uploads || []) as U[];
      const uploadedFiles = new Map<string, File>();
      for (let i = 0; i < uploads.length; i++) {
        setMsg(`Uploading ${i + 1} of ${uploads.length}…`);
        const item = uploads[i],
          file = converted.find(
            (f) => f.name === item.name && f.size === item.size,
          );
        if (!file) throw new Error(`Could not match ${item.name}`);
        uploadedFiles.set(item.id, file);
        const { error } = await sb.storage
          .from("media")
          .uploadToSignedUrl(item.path, item.token, file, {
            contentType: file.type,
          });
        if (error) throw error;
      }
      const complete = await fetch("/api/media-bank/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "complete",
            files: uploads.map(({ token, ...item }) => item),
          }),
        }),
        data = await responseJson(complete);
      if (!complete.ok)
        throw new Error(data.error || "Could not finish upload");
      const added = (data.assets || []) as A[];
      let missingPosters = 0;
      for (const asset of added.filter((a) => a.file_type.startsWith("video/"))) {
        // Only files the user just selected are decoded. The grid never opens video bytes.
        const file = uploadedFiles.get(asset.id);
        try {
          const poster = file ? await createMediaBankVideoPoster(file) : undefined;
          if (!poster) { missingPosters++; continue; }
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          try {
            const saved = await fetch(`/api/media-bank/poster/${encodeURIComponent(asset.id)}`, {
              method: "POST", headers: { "Content-Type": "image/jpeg" }, body: poster, signal: controller.signal,
            });
            if (!saved.ok) missingPosters++;
          } finally { clearTimeout(timeout); }
        } catch { missingPosters++; }
      }
      setMsg(`${added.length} added.${missingPosters ? ` ${missingPosters} video preview${missingPosters === 1 ? " is" : "s are"} unavailable; the original can still be opened.` : ""}`);
      await load(true);
      // Analysis changes search membership after the untagged upload refresh.
      // Refresh as each analysis settles so a stalled video cannot hide finished photo matches.
      // load() reads the latest query and cancels any older refresh.
      for (const a of added) void analyze(a).then(() => load(true));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      uploadInFlight.current = false;
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }
  async function saveMetadata(a: A, which: "people" | "credit") {
    setSaving(true);
    const names = people
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    try {
      const r = await fetch("/api/media-bank/metadata", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetId: a.id,
            photographer: which === "credit" ? credit : creditFor(a),
            people: which === "people" ? names : peopleFor(a),
          }),
        }),
        d = await responseJson(r);
      if (!r.ok || !d.ok) throw new Error(d.error || "Could not save");
      const next = { ...a, tags: d.tags };
      setAssets((v) => v.map((x) => (x.id === a.id ? next : x)));
      setDetailAssets((v) => v?.map((x) => (x.id === a.id ? next : x)) || null);
      if (selectedRef.current?.id === a.id) {
        setSelected(next);
        setCredit(d.photographer || "");
        setPeople((d.people || []).join(", "));
      }
      setMsg("Saved.");
      navigation.current++;
      setDetailLoading(false);
      setDetailAssets(null);
      // Editing search membership shifts offsets; replace the active query before paging again.
      await load(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }
  async function download(a: A) {
    const r = await fetch(originalUrl(a)),
      b = await r.blob(),
      u = URL.createObjectURL(b),
      link = document.createElement("a");
    link.href = u;
    link.download = a.filename;
    link.click();
    URL.revokeObjectURL(u);
  }
  async function remove(a: Pick<A, "id">) {
    const r = await fetch(`/api/media-assets/${encodeURIComponent(a.id)}`, {
      method: "DELETE",
    });
    if (!r.ok) throw new Error("Delete failed");
    return a.id;
  }
  async function del(a: A) {
    if (!confirm("Delete this media? This cannot be undone.")) return;
    try {
      await remove(a);
      setChecked((current) => {
        const next = new Set(current);
        next.delete(a.id);
        return next;
      });
      close();
      await load(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Delete failed");
    }
  }
  async function bulkDelete() {
    const ids = [...checked];
    if (!ids.length || !confirm(`Delete ${ids.length} selected items?`)) return;
    const failed: string[] = [];
    for (const id of ids)
      try {
        await remove({ id });
      } catch {
        failed.push(id);
      }
    setChecked(new Set(failed));
    if (failed.length)
      setMsg(`${failed.length} items could not be deleted. Please retry.`);
    await load(true);
  }
  async function startSlideshow() {
    if (slideshowStarting.current) return;
    slideshowStarting.current = true;
    try {
      const photos = await fetchAll("photo");
      if (photos.length) {
        setSlides(photos);
        setShowIndex(0);
        setPlaying(true);
        setShow(true);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not start slideshow.");
    } finally {
      slideshowStarting.current = false;
    }
  }
  const activeCount = filter === "all" ? counts.all : counts[filter],
    slide = slides[Math.min(showIndex, Math.max(slides.length - 1, 0))];
  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void upload(e.dataTransfer.files);
      }}
      className="relative min-h-[500px]"
    >
      <input
        ref={input}
        type="file"
        accept="image/*,video/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => void upload(e.target.files)}
      />
      {drag && (
        <div className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-orange-500 bg-orange-50/95">
          <p className="text-xl font-semibold">Drop to add to Media Bank</p>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", `All (${counts.all})`],
              ["photo", `Photos (${counts.photo})`],
              ["video", `Videos (${counts.video})`],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={filter === v ? "btn-primary" : "btn-secondary"}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void startSlideshow()}
            disabled={!counts.photo || loading}
            className="btn-secondary"
          >
            ▶ Slideshow
          </button>
          <button
            onClick={() => void retag()}
            disabled={retagging || uploading}
            className="btn-secondary"
          >
            {retagging ? "Tagging…" : "Refresh AI Tags"}
          </button>
          <button
            onClick={() => input.current?.click()}
            disabled={uploading || retagging}
            className="btn-primary"
          >
            {uploading ? "Uploading…" : "+ Add Media"}
          </button>
        </div>
      </div>
      <div className="mb-5 flex gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search media"
          placeholder="Search your media…"
          className="input min-w-0 flex-1 sm:min-w-[280px]"
        />
        {checked.size > 0 && (
          <div className="flex items-center gap-3 text-sm">
            <span>{checked.size} selected</span>
            <button
              onClick={() => void bulkDelete()}
              className="font-medium text-red-600"
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {msg && (
        <div className="fixed bottom-5 right-5 z-[70] rounded-lg bg-stone-900 px-4 py-2 text-sm text-white shadow-lg">
          {msg}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <span>{error}</span>
          <button onClick={() => void load(false)} className="font-semibold">
            Retry
          </button>
        </div>
      )}
      {!loading && !error && activeCount === 0 ? (
        <div className="rounded-xl border border-dashed bg-white px-6 py-16 text-center">
          <h2 className="text-lg">No media found</h2>
          <p className="mt-2 text-sm text-stone-500">
            Try another search or add a photo or video.
          </p>
        </div>
      ) : (
        <>
          <div
            aria-label="Media results"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            {assets.map((a) => (
              <div
                key={a.id}
                data-media-id={a.id}
                onClick={() => open(a)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.target === e.currentTarget) open(a);
                }}
                tabIndex={0}
                role="button"
                aria-label={`Open ${a.filename}`}
                className="relative aspect-square cursor-pointer overflow-hidden rounded-xl border bg-stone-100"
              >
                {a.file_type.startsWith("image/") ||
                a.file_type.startsWith("video/") ? (
                  <MediaThumbnail asset={a} />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center bg-[#171713] p-4 text-center text-white">
                    <span className="text-2xl">▶</span>
                    <span className="mt-3 line-clamp-2 text-xs text-white/70">
                      {a.filename}
                    </span>
                  </div>
                )}
                <button
                  aria-label={`Select ${a.filename}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(a.id);
                  }}
                  className={`absolute left-2 top-2 h-6 w-6 rounded-md border-2 text-xs font-bold ${checked.has(a.id) ? "border-white bg-black text-white" : "border-white bg-black/20 text-transparent"}`}
                >
                  ✓
                </button>
                {creditFor(a) && (
                  <span className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white">
                    PRO
                  </span>
                )}
                {a.file_type.startsWith("video/") && (
                  <span className="absolute bottom-2 right-2 rounded bg-black/65 px-2 py-1 text-[10px] text-white">
                    VIDEO
                  </span>
                )}
              </div>
            ))}
          </div>
          {loading && (
            <div
              aria-live="polite"
              className="grid grid-cols-2 gap-3 pt-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            >
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square animate-pulse rounded-xl bg-stone-200"
                />
              ))}
            </div>
          )}
          <div ref={sentinel} className="h-6" />
          {!hasMore && !loading && assets.length > 0 && (
            <p className="py-5 text-center text-xs uppercase tracking-wider text-stone-400">
              All {total} results loaded
            </p>
          )}
        </>
      )}
      {show && slide && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black">
          <div className="flex items-center justify-between px-3 py-3 text-white sm:px-5 sm:py-4">
            <span className="text-sm">
              {showIndex + 1} of {slides.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setShowIndex((i) => (i - 1 + slides.length) % slides.length)
                }
                className="rounded-lg bg-white/15 px-3 py-2"
              >
                ‹
              </button>
              <button
                onClick={() => setPlaying((v) => !v)}
                className="rounded-lg bg-white/15 px-4 py-2"
              >
                {playing ? "Pause" : "Play"}
              </button>
              <button
                onClick={() => setShowIndex((i) => (i + 1) % slides.length)}
                className="rounded-lg bg-white/15 px-3 py-2"
              >
                ›
              </button>
              <button
                aria-label="Close slideshow"
                onClick={() => setShow(false)}
                className="ml-2 rounded-lg bg-white/15 px-4 py-2"
              >
                ×
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 p-4">
            <img
              src={originalUrl(slide)}
              alt={slide.filename}
              className="h-full w-full object-contain"
            />
          </div>
        </div>
      )}
      {selected && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/55 p-3 sm:p-4"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) close();
          }}
        >
          <div className="mx-auto my-2 w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl sm:my-8">
            <div className="grid max-h-none md:max-h-[90vh] md:grid-cols-[minmax(0,1fr)_340px]">
              <main className="flex min-h-[50vh] flex-col bg-stone-50 p-3 sm:min-h-[65vh] sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <button
                    disabled={detailLoading}
                    onClick={() => void move(-1)}
                    className="btn-secondary"
                  >
                    ‹ Previous
                  </button>
                  <span className="text-xs text-stone-400">
                    Item{" "}
                    {Math.max(
                      1,
                      (detailAssets || assets).findIndex(
                        (a) => a.id === selected.id,
                      ) + 1,
                    )}{" "}
                    of {detailAssets?.length || total}
                  </span>
                  <button
                    disabled={detailLoading}
                    onClick={() => void move(1)}
                    className="btn-secondary"
                  >
                    Next ›
                  </button>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl">
                  {selected.file_type.startsWith("video/") ? (
                    <video
                      src={originalUrl(selected)}
                      controls
                      autoPlay
                      className="max-h-[70vh] max-w-full object-contain"
                    />
                  ) : (
                    <img
                      src={originalUrl(selected)}
                      alt={selected.filename}
                      className="max-h-[70vh] max-w-full object-contain"
                    />
                  )}
                </div>
                <div className="mt-4 flex gap-2 text-xs text-stone-500">
                  <span className="rounded-lg border bg-white px-3 py-2">
                    Uploaded{" "}
                    {new Date(selected.created_at).toLocaleDateString()}
                  </span>
                  <span className="rounded-lg border bg-white px-3 py-2">
                    {selected.file_type.startsWith("video/")
                      ? "Video"
                      : "Photo"}
                  </span>
                </div>
              </main>
              <aside className="overflow-y-auto border-t p-5 md:border-l md:border-t-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Media details</h3>
                  <button
                    aria-label="Close media details"
                    onClick={close}
                    className="text-2xl text-stone-400"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                    People in this media
                  </p>
                  <div className="mt-3 flex gap-2">
                    <input
                      disabled={saving}
                      value={people}
                      onChange={(e) => setPeople(e.target.value)}
                      aria-label="People in this media"
                      placeholder="Hunter, Maria, Elise"
                      className="input min-w-0 flex-1"
                    />
                    <button
                      disabled={saving}
                      onClick={() => void saveMetadata(selected, "people")}
                      className="btn-secondary"
                    >
                      Save
                    </button>
                  </div>
                </div>
                {selected.file_type.startsWith("image/") && (
                  <div className="mt-6 border-t pt-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                      Photographer credit
                    </p>
                    <div className="mt-3 flex gap-2">
                      <input
                        disabled={saving}
                        value={credit}
                        onChange={(e) => setCredit(e.target.value)}
                        aria-label="Photographer credit"
                        placeholder="@photographer"
                        className="input min-w-0 flex-1"
                      />
                      <button
                        disabled={saving}
                        onClick={() => void saveMetadata(selected, "credit")}
                        className="btn-secondary"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
                <div className="mt-8 grid gap-2">
                  <button
                    onClick={() => void download(selected)}
                    className="btn-primary justify-center"
                  >
                    ↓ Download
                  </button>
                  <button
                    onClick={() => void del(selected)}
                    className="rounded-lg border px-4 py-2 text-sm font-semibold text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
