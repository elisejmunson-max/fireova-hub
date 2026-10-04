"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  appendManualDraft,
  approveOnce,
  reconcileRevision,
  requestRevision,
  restoreManualDrafts,
  runExclusive,
  serializeManualDrafts,
  tileMedia,
  type ManualAsset as Asset,
  type ManualKind as Kind,
  type ManualPost as Post,
  type ManualSlot as Slot,
} from "@/lib/manual-content-drafts";

const tagValues = (asset: Asset, prefix: string) =>
  (asset.tags || [])
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => tag.slice(prefix.length).trim());
const credit = (asset: Asset) => tagValues(asset, "photographer:")[0] || "";
const isVideo = (asset: Asset) => asset.file_type.startsWith("video/");
const statusLabel = (post: Post) =>
  post.revision?.status === "waiting"
    ? "Waiting for rewrite"
    : post.revision?.status === "revised"
      ? "Revised"
      : "Ready for review";

export default function WeeklyContentPersistent({
  initialAssets,
  savedSlots = [],
  initialQueueUpdatedAt = null,
  approvedCount = 0,
  loadError = "",
}: {
  initialAssets: Asset[];
  savedSlots?: Slot[];
  initialQueueUpdatedAt?: string | null;
  approvedCount?: number;
  loadError?: string;
}) {
  const supabase = useMemo(() => createClient() as any, []),
    restored = useMemo(
      () => restoreManualDrafts(savedSlots, initialAssets),
      [savedSlots, initialAssets],
    );
  const [pool] = useState(initialAssets),
    [posts, setPosts] = useState(restored.posts),
    [captions, setCaptions] = useState<Record<string, string>>(
      restored.captions,
    ),
    [originals, setOriginals] = useState<Record<string, string>>(
      restored.originals,
    );
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [slide, setSlide] = useState(0),
    [composerOpen, setComposerOpen] = useState(false),
    [draftCaption, setDraftCaption] = useState(""),
    [draftKind, setDraftKind] = useState<Kind>("Photo"),
    [draftMedia, setDraftMedia] = useState<Asset[]>([]),
    [query, setQuery] = useState(""),
    [noteDraft, setNoteDraft] = useState(""),
    [editingNote, setEditingNote] = useState(false);
  const [busy, setBusy] = useState(false),
    [approving, setApproving] = useState<Record<string, boolean>>({}),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [saved, setSaved] = useState<Record<string, string>>({});
  const savingRef = useRef(false),
    approvalLocks = useRef(new Set<string>()),
    approvalSucceeded = useRef(new Set<string>()),
    dialogRef = useRef<HTMLDivElement>(null),
    queueUpdatedAtRef = useRef<string | null>(initialQueueUpdatedAt);
  const selected = posts.find((post) => post.id === selectedId) || null;
  const url = (asset: Asset) =>
    asset.missing
      ? ""
      : supabase.storage.from("media").getPublicUrl(asset.storage_path).data
          .publicUrl;
  const visibleAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool.filter(
      (asset) =>
        !q ||
        [asset.filename, ...(asset.tags || [])]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [pool, query]);

  function openPost(id: string) {
    if (selectedId === id) return;
    window.history.pushState({ fireovaPostDetail: id }, "");
    setSelectedId(id);
  }
  function closePost() {
    if (window.history.state?.fireovaPostDetail === selectedId)
      window.history.back();
    else setSelectedId(null);
  }
  useEffect(() => {
    if (!selected) return;
    setSlide(0);
    setNoteDraft(selected.revision?.note || "");
    setEditingNote(false);
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => dialogRef.current?.focus());
    const onPop = () => setSelectedId(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePost();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = [
          ...dialogRef.current.querySelectorAll<HTMLElement>(
            "button:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href]",
          ),
        ];
        if (!focusable.length) return;
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [selectedId]);

  async function persist(
    nextPosts = posts,
    nextCaptions = captions,
    nextOriginals = originals,
  ) {
    const response = await fetch("/api/review-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slots: serializeManualDrafts(nextPosts, nextCaptions, nextOriginals),
          expectedUpdatedAt: queueUpdatedAtRef.current,
        }),
        cache: "no-store",
      }),
      data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok)
      throw new Error(data.error || "Could not save review queue");
    queueUpdatedAtRef.current = data.updatedAt || queueUpdatedAtRef.current;
  }
  async function saveCaption(post: Post) {
    setBusy(true);
    try {
      const nextPost = reconcileRevision(
          post,
          captions[post.id] || "",
          new Date().toISOString(),
        ),
        nextPosts = posts.map((item) =>
          item.id === post.id ? nextPost : item,
        );
      await persist(nextPosts, captions, originals);
      setPosts(nextPosts);
      setSaved((value) => ({
        ...value,
        [post.id]:
          nextPost.revision?.status === "revised"
            ? "Revised caption saved"
            : "Draft saved",
      }));
      setErrors((value) => ({ ...value, [post.id]: "" }));
    } catch (error) {
      setErrors((value) => ({
        ...value,
        [post.id]:
          error instanceof Error ? error.message : "Could not save caption",
      }));
    } finally {
      setBusy(false);
    }
  }
  async function feedback(post: Post, action: string) {
    const response = await fetch("/api/review-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          assetIds: post.media.map((asset) => asset.id),
          format: post.kind,
          aiCaption: originals[post.id] || captions[post.id],
          finalCaption: captions[post.id],
        }),
      }),
      data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok)
      throw new Error(data.error || "Could not save feedback");
  }
  async function saveRevisionRequest(post: Post) {
    if (!noteDraft.trim()) return;
    setBusy(true);
    try {
      const nextPost = requestRevision(
          post,
          noteDraft,
          captions[post.id] || "",
          new Date().toISOString(),
        ),
        nextPosts = posts.map((item) =>
          item.id === post.id ? nextPost : item,
        );
      await persist(nextPosts, captions, originals);
      setPosts(nextPosts);
      setEditingNote(false);
      setSaved((value) => ({ ...value, [post.id]: "Revision note saved" }));
      setErrors((value) => ({ ...value, [post.id]: "" }));
    } catch (error) {
      setErrors((value) => ({
        ...value,
        [post.id]:
          error instanceof Error
            ? error.message
            : "Could not save revision note",
      }));
    } finally {
      setBusy(false);
    }
  }
  async function removeDraft(post: Post) {
    const nextPosts = posts.filter((item) => item.id !== post.id),
      nextCaptions = { ...captions },
      nextOriginals = { ...originals };
    delete nextCaptions[post.id];
    delete nextOriginals[post.id];
    await persist(nextPosts, nextCaptions, nextOriginals);
    setPosts(nextPosts);
    setCaptions(nextCaptions);
    setOriginals(nextOriginals);
    setSelectedId(null);
  }
  async function approve(post: Post) {
    const caption = captions[post.id]?.trim();
    if (
      !caption ||
      post.media.some((asset) => asset.missing) ||
      approvalLocks.current.has(post.id)
    )
      return;
    approvalLocks.current.add(post.id);
    setApproving((value) => ({ ...value, [post.id]: true }));
    try {
      await approveOnce(
        post.id,
        approvalSucceeded.current,
        async () => {
          await feedback(
            post,
            (originals[post.id] || "").trim() !== caption
              ? "approve_edited"
              : "approve",
          );
          const credits = [...new Set(post.media.map(credit).filter(Boolean))],
            response = await fetch("/api/weekly-post/approve", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                assetIds: post.media.map((asset) => asset.id),
                caption: [caption, ...credits].join("\n\nPhoto: ").trim(),
                originalCaption: originals[post.id] || caption,
                format: post.kind,
              }),
            }),
            data = await response.json().catch(() => ({}));
          if (!response.ok || !data.ok)
            throw new Error(data.error || "Could not approve");
        },
        async () => removeDraft(post),
      );
    } catch (error) {
      setErrors((value) => ({
        ...value,
        [post.id]: error instanceof Error ? error.message : "Could not approve",
      }));
    } finally {
      approvalLocks.current.delete(post.id);
      setApproving((value) => ({ ...value, [post.id]: false }));
    }
  }
  function chooseAsset(asset: Asset) {
    setDraftMedia((current) => {
      if (current.some((item) => item.id === asset.id))
        return current.filter((item) => item.id !== asset.id);
      if (isVideo(asset)) {
        setDraftKind("Reel");
        return [asset];
      }
      const next = [...current.filter((item) => !isVideo(item)), asset].slice(
        0,
        10,
      );
      setDraftKind(next.length > 1 ? "Carousel" : "Photo");
      return next;
    });
  }
  async function saveNewDraft() {
    const caption = draftCaption.trim();
    if (!caption || !draftMedia.length) {
      setErrors((value) => ({
        ...value,
        composer: "Add a caption and choose at least one photo or video.",
      }));
      return;
    }
    await runExclusive(savingRef, async () => {
      setBusy(true);
      try {
        const kind: Kind = draftMedia.some(isVideo)
            ? "Reel"
            : draftMedia.length > 1
              ? "Carousel"
              : draftKind,
          id = `manual-${Date.now()}-${draftMedia.map((asset) => asset.id).join("-")}`,
          post: Post = { id, media: draftMedia, kind, purpose: "Manual draft" },
          next = appendManualDraft(
            { posts, captions, originals },
            post,
            caption,
          );
        await persist(next.posts, next.captions, next.originals);
        setPosts(next.posts);
        setCaptions(next.captions);
        setOriginals(next.originals);
        setDraftCaption("");
        setDraftMedia([]);
        setComposerOpen(false);
        setSelectedId(id);
      } catch (error) {
        setErrors((value) => ({
          ...value,
          composer:
            error instanceof Error ? error.message : "Could not save draft",
        }));
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <section aria-labelledby="review-title">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            Create content
          </p>
          <h1
            id="review-title"
            className="mt-1 text-2xl font-semibold sm:text-3xl"
          >
            Review your posts
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Finished media and captions, ready for your decision. Nothing
            publishes or schedules automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/approved-posts" className="btn-secondary">
            Approved <span className="text-stone-400">{approvedCount}</span>
          </Link>
          <button
            type="button"
            onClick={() => setComposerOpen((value) => !value)}
            className="btn-secondary"
          >
            {composerOpen ? "Close composer" : "+ New post"}
          </button>
        </div>
      </header>
      {loadError && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {loadError}
        </p>
      )}
      {composerOpen && (
        <div className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Manual new post</h2>
          <p className="mt-1 text-xs text-stone-500">
            A secondary option for when you want to assemble something yourself.
          </p>
          <textarea
            aria-label="New post caption"
            value={draftCaption}
            onChange={(event) => setDraftCaption(event.target.value)}
            rows={3}
            placeholder="Write a caption"
            className="textarea mt-4"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Media Bank"
            className="input mt-3"
          />
          <div className="mt-3 grid max-h-64 grid-cols-3 gap-1 overflow-y-auto sm:grid-cols-6">
            {visibleAssets.map((asset) => (
              <button
                type="button"
                aria-pressed={draftMedia.some((item) => item.id === asset.id)}
                key={asset.id}
                onClick={() => chooseAsset(asset)}
                className={`relative aspect-square overflow-hidden ${draftMedia.some((item) => item.id === asset.id) ? "ring-2 ring-orange-600 ring-offset-1" : ""}`}
              >
                {isVideo(asset) ? (
                  <video
                    src={url(asset)}
                    muted
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <img
                    src={url(asset)}
                    alt={asset.filename || "Media"}
                    className="h-full w-full object-cover"
                  />
                )}
              </button>
            ))}
          </div>
          {errors.composer && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {errors.composer}
            </p>
          )}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={busy || !draftCaption.trim() || !draftMedia.length}
              onClick={() => void saveNewDraft()}
              className="btn-primary"
            >
              Save for review
            </button>
          </div>
        </div>
      )}
      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white px-6 py-16 text-center">
          <h2 className="text-lg">No posts ready for review</h2>
          <p className="mt-2 text-sm text-stone-500">
            When finished posts are prepared, they’ll appear here with their
            real media and captions.
          </p>
        </div>
      ) : (
        <div
          className="grid grid-cols-3 gap-1 sm:gap-2"
          aria-label="Posts ready for review"
        >
          {posts.map((post) => {
            const asset = tileMedia(post),
              missing = post.media.some((item) => item.missing),
              waiting = post.revision?.status === "waiting",
              revised = post.revision?.status === "revised";
            return (
              <button
                key={post.id}
                type="button"
                onClick={() => openPost(post.id)}
                className="group relative aspect-square overflow-hidden bg-stone-200 text-left focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2"
                aria-label={`Open ${post.kind} post, ${statusLabel(post)}`}
              >
                {!asset || asset.missing ? (
                  <div className="flex h-full items-center justify-center p-2 text-center text-[10px] text-stone-500 sm:text-xs">
                    Media unavailable
                  </div>
                ) : isVideo(asset) ? (
                  <video
                    src={url(asset)}
                    muted
                    playsInline
                    className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                  />
                ) : (
                  <img
                    src={url(asset)}
                    alt={asset.filename || ""}
                    className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                  />
                )}
                <span
                  className={`absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold shadow-sm sm:bottom-2 sm:left-2 sm:px-2 sm:text-[10px] ${waiting ? "bg-amber-100 text-amber-900" : revised ? "bg-emerald-100 text-emerald-900" : "bg-white/95 text-stone-800"}`}
                >
                  {waiting ? "Waiting" : revised ? "Revised" : "Review"}
                </span>
                <span className="absolute right-1 top-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white sm:right-2 sm:top-2">
                  {post.kind === "Carousel"
                    ? `▣ ${post.media.length}`
                    : post.kind === "Reel"
                      ? "▶ Reel"
                      : "Photo"}
                </span>
                {missing && (
                  <span className="absolute inset-x-1 top-7 rounded bg-amber-100/95 p-1 text-center text-[9px] font-semibold text-amber-900 sm:inset-x-2 sm:top-10">
                    Missing media
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {selected && (
        <div
          className="fixed inset-y-0 left-0 right-0 z-50 flex items-end justify-center bg-stone-900/45 sm:items-center sm:p-6 md:left-64"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePost();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="post-detail-title"
            tabIndex={-1}
            className="max-h-[calc(100dvh-0.75rem)] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl outline-none sm:max-h-[calc(100dvh-3rem)] sm:max-w-4xl sm:rounded-2xl lg:overflow-hidden"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/95 px-4 py-3 backdrop-blur">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                  {statusLabel(selected)}
                </p>
                <h2 id="post-detail-title" className="text-base font-semibold">
                  {selected.purpose || `${selected.kind} post`}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close post details"
                onClick={closePost}
                className="rounded-full p-2 text-xl leading-none text-stone-500 hover:bg-stone-100"
              >
                ×
              </button>
            </div>
            <div className="grid lg:h-[min(680px,calc(100dvh-8.5rem))] lg:min-h-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
              <div className="flex min-h-[22rem] flex-col bg-stone-950 lg:min-h-0">
                <div className="relative flex h-[min(62dvh,32rem)] min-h-0 flex-none items-center justify-center p-4 sm:p-6 lg:h-auto lg:flex-1">
                  {selected.media[slide]?.missing ? (
                    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-stone-500">
                      This draft is preserved, but media{" "}
                      {selected.media[slide].id} is unavailable.
                    </div>
                  ) : isVideo(selected.media[slide]) ? (
                    <video
                      src={url(selected.media[slide])}
                      controls
                      playsInline
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <img
                      src={url(selected.media[slide])}
                      alt={selected.media[slide].filename || ""}
                      className="h-full w-full object-contain"
                    />
                  )}
                  {selected.media.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label="Previous media"
                        onClick={() =>
                          setSlide(
                            (value) =>
                              (value - 1 + selected.media.length) %
                              selected.media.length,
                          )
                        }
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-white"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        aria-label="Next media"
                        onClick={() =>
                          setSlide(
                            (value) => (value + 1) % selected.media.length,
                          )
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-white"
                      >
                        ›
                      </button>
                      <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-1 text-xs text-white">
                        {slide + 1} / {selected.media.length}
                      </span>
                    </>
                  )}
                </div>
                {selected.media.length > 1 && (
                  <div className="flex gap-1 overflow-x-auto border-t border-stone-200 bg-white p-2">
                    {selected.media.map((asset, index) => (
                      <button
                        type="button"
                        key={`${asset.id}-${index}`}
                        aria-label={`Show media ${index + 1}`}
                        onClick={() => setSlide(index)}
                        className={`h-14 w-14 flex-none overflow-hidden rounded ${slide === index ? "ring-2 ring-orange-500" : "opacity-60"}`}
                      >
                        {asset.missing ? (
                          <span className="flex h-full items-center justify-center bg-stone-700 text-xs text-white">
                            !
                          </span>
                        ) : isVideo(asset) ? (
                          <video
                            src={url(asset)}
                            muted
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <img
                            src={url(asset)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col p-5 sm:p-6 lg:min-h-0 lg:overflow-y-auto">
                <label
                  htmlFor="post-caption"
                  className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500"
                >
                  Caption
                </label>
                <textarea
                  id="post-caption"
                  value={captions[selected.id] || ""}
                  onChange={(event) => {
                    setCaptions((value) => ({
                      ...value,
                      [selected.id]: event.target.value,
                    }));
                    setSaved((value) => ({ ...value, [selected.id]: "" }));
                  }}
                  rows={6}
                  className="mt-2 min-h-32 max-h-64 w-full resize-y overflow-y-auto rounded-xl border border-stone-200 p-3 text-sm leading-6 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
                {[...new Set(selected.media.map(credit).filter(Boolean))].map(
                  (name) => (
                    <p key={name} className="mt-2 text-xs text-stone-500">
                      Photo credit: {name}
                    </p>
                  ),
                )}
                {selected.media.some((asset) => asset.missing) && (
                  <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                    Approval is disabled until unavailable media is restored.
                    The draft and media order remain saved.
                  </p>
                )}
                {errors[selected.id] && (
                  <p role="alert" className="mt-3 text-sm text-red-700">
                    {errors[selected.id]}
                  </p>
                )}
                {saved[selected.id] && (
                  <p role="status" className="mt-3 text-sm text-emerald-700">
                    {saved[selected.id]}
                  </p>
                )}
                {selected.revision && !editingNote ? (
                  <div
                    className={`mt-4 rounded-xl border p-3 ${selected.revision.status === "waiting" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p
                          className={`text-xs font-semibold ${selected.revision.status === "waiting" ? "text-amber-900" : "text-emerald-900"}`}
                        >
                          {selected.revision.status === "waiting"
                            ? "Waiting for rewrite"
                            : "Revised after your note"}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-stone-700">
                          {selected.revision.note}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNoteDraft(selected.revision?.note || "");
                          setEditingNote(true);
                        }}
                        className="text-xs font-medium text-stone-600 underline-offset-2 hover:underline"
                      >
                        Edit note
                      </button>
                    </div>
                  </div>
                ) : editingNote ? (
                  <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3">
                    <label
                      htmlFor="revision-note"
                      className="text-xs font-semibold text-stone-700"
                    >
                      Revision note
                    </label>
                    <textarea
                      id="revision-note"
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      rows={3}
                      placeholder="For example: Make this warmer and more playful, with more Fireova personality."
                      className="mt-2 w-full resize-y rounded-lg border border-stone-200 bg-white p-3 text-sm leading-5 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                    />
                    <p className="mt-2 text-xs leading-5 text-stone-500">
                      This saves your note with the draft and marks it as waiting
                      for a rewrite. It does not generate a rewrite immediately or
                      notify this chat.
                    </p>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setNoteDraft(selected.revision?.note || "");
                          setEditingNote(false);
                        }}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveRevisionRequest(selected)}
                        disabled={busy || !noteDraft.trim()}
                        className="btn-primary"
                      >
                        Save revision note
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void saveCaption(selected)}
                    disabled={busy || !captions[selected.id]?.trim()}
                    className="btn-secondary justify-center"
                  >
                    Save draft
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNoteDraft(selected.revision?.note || "");
                      setEditingNote(true);
                    }}
                    disabled={busy}
                    className="btn-secondary justify-center"
                  >
                    {selected.revision ? "Update revision note" : "Leave revision note"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void approve(selected)}
                    disabled={
                      busy ||
                      Boolean(approving[selected.id]) ||
                      selected.media.some((asset) => asset.missing) ||
                      !captions[selected.id]?.trim()
                    }
                    className="btn-primary col-span-2 justify-center"
                  >
                    {approving[selected.id] ? "Approving…" : "Approve post"}
                  </button>
                </div>
                <p className="mt-3 text-center text-[11px] text-stone-400">
                  Approval saves this to Approved Posts. It does not publish or
                  schedule it.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
