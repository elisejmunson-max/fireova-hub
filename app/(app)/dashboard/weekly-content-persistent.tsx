"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  appendManualDraft,
  activePlanCoverage,
  activeManualMedia,
  approveOnce,
  beginCaptionEdit,
  buildApprovalPayload,
  cancelCaptionEdit,
  canApproveCaptionEdit,
  canInteractWithCaptionEdit,
  canNavigateDuringCaptionSave,
  completeCaptionEdit,
  nextPlanPosition,
  nextPlanningDate,
  planCells,
  reconcileRevision,
  reconcileApprovalResponse,
  requestRevision,
  restoreManualDrafts,
  runExclusive,
  serializeManualDrafts,
  suggestedPlanningDates,
  tileMedia,
  updateCaptionEdit,
  type ManualAsset as Asset,
  type ManualKind as Kind,
  type ManualPost as Post,
  type ManualSlot as Slot,
  type PlanCoverage,
} from "@/lib/manual-content-drafts";

const tagValues = (asset: Asset, prefix: string) =>
  (asset.tags || [])
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => tag.slice(prefix.length).trim());
const credit = (asset: Asset) => tagValues(asset, "photographer:")[0] || "";
const isVideo = (asset?: Asset) => Boolean(asset?.file_type.startsWith("video/"));
const statusLabel = (post: Post) =>
  post.revision?.status === "waiting"
    ? "Waiting for rewrite"
    : post.revision?.status === "revised"
      ? "Revised"
      : "Ready for review";
const postTitle = (post: Post, caption: string) => {
  if (post.purpose?.trim() && post.purpose.toLowerCase() !== "manual draft") return post.purpose;
  const first = caption.split(/\n|[.!?](?:\s|$)/)[0].trim();
  return first ? `${first.slice(0, 48)}${first.length > 48 ? "…" : ""}` : `${post.kind} draft`;
};
const suggestedDays = ["MON · SUGGESTED", "WED · SUGGESTED", "FRI · SUGGESTED", "MON · SUGGESTED", "WED · SUGGESTED", "FRI · SUGGESTED"];
const slotDirections = ["A menu favorite", "A reason to gather", "Behind the scenes", "A little detail", "Meet the makers", "In the moment"];

export default function WeeklyContentPersistent({
  initialAssets,
  savedSlots = [],
  initialPlanCoverage = [],
  planningAnchor,
  planningAvailable = true,
  initialQueueUpdatedAt = null,
  approvedCount = 0,
  loadError = "",
}: {
  initialAssets: Asset[];
  savedSlots?: Slot[];
  initialPlanCoverage?: PlanCoverage[];
  planningAnchor: string;
  planningAvailable?: boolean;
  initialQueueUpdatedAt?: string | null;
  approvedCount?: number;
  loadError?: string;
}) {
  const supabase = useMemo(() => createClient() as any, []),
    restored = useMemo(
      () => restoreManualDrafts(savedSlots, initialAssets, planningAnchor),
      [savedSlots, initialAssets, planningAnchor],
    );
  const [pool] = useState(initialAssets),
    [posts, setPosts] = useState(restored.posts),
    [captions, setCaptions] = useState<Record<string, string>>(
      restored.captions,
    ),
    [originals, setOriginals] = useState<Record<string, string>>(
      restored.originals,
    ),
    [coverage, setCoverage] = useState(initialPlanCoverage);
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [slide, setSlide] = useState(0),
    [composerOpen, setComposerOpen] = useState(false),
    [captionEdit, setCaptionEdit] = useState(cancelCaptionEdit),
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
    busyRef = useRef(busy),
    approvalLocks = useRef(new Set<string>()),
    approvalSucceeded = useRef(new Set<string>()),
    dialogRef = useRef<HTMLDivElement>(null),
    queueUpdatedAtRef = useRef<string | null>(initialQueueUpdatedAt);
  busyRef.current = busy;
  const selected = posts.find((post) => post.id === selectedId) || null;
  const currentCoverage = useMemo(() => activePlanCoverage(coverage, planningAnchor), [coverage, planningAnchor]);
  const planningCells = useMemo(() => planCells(posts, currentCoverage, 6, planningAnchor), [posts, currentCoverage, planningAnchor]);
  const planningDates = useMemo(() => suggestedPlanningDates(planningAnchor, planningCells.length), [planningAnchor, planningCells.length]);
  const selectedMedia = selected ? activeManualMedia(selected, slide) : null;
  const url = (asset?: Asset) =>
    !asset || asset.missing
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
    if (!canNavigateDuringCaptionSave(busy) || selectedId === id) return;
    if (selectedId) window.history.replaceState({ fireovaPostDetail: id }, "");
    else window.history.pushState({ fireovaPostDetail: id }, "");
    setSelectedId(id);
    setCaptionEdit(cancelCaptionEdit());
  }
  function closePost() {
    if (!canNavigateDuringCaptionSave(busy)) return;
    if (window.history.state?.fireovaPostDetail === selectedId)
      window.history.back();
    else setSelectedId(null);
    setCaptionEdit(cancelCaptionEdit());
  }
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      if (!canNavigateDuringCaptionSave(busy) && selectedId) {
        window.history.pushState({ fireovaPostDetail: selectedId }, "");
        return;
      }
      const id = event.state?.fireovaPostDetail;
      setSelectedId(typeof id === "string" && posts.some((post) => post.id === id) ? id : null);
      setCaptionEdit(cancelCaptionEdit());
      setEditingNote(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [posts, busy, selectedId]);
  useEffect(() => {
    if (!selected) return;
    setSlide(0);
    setNoteDraft(selected.revision?.note || "");
    setEditingNote(false);
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => dialogRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!canInteractWithCaptionEdit(busyRef.current)) return;
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
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [selectedId]);

  async function persist(
    nextPosts = posts,
    nextCaptions = captions,
    nextOriginals = originals,
  ) {
    if (!planningAvailable) throw new Error("Content planning is unavailable. Refresh after the migration is restored.");
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
  async function saveCaption(post: Post, editedCaption = captions[post.id] || "") {
    setBusy(true);
    try {
      const nextCaptions = { ...captions, [post.id]: editedCaption },
        nextPost = reconcileRevision(
          post,
          editedCaption,
          new Date().toISOString(),
        ),
        nextPosts = posts.map((item) =>
          item.id === post.id ? nextPost : item,
        );
      await persist(nextPosts, nextCaptions, originals);
      setPosts(nextPosts);
      setCaptions(nextCaptions);
      setSaved((value) => ({
        ...value,
        [post.id]:
          nextPost.revision?.status === "revised"
            ? "Revised caption saved"
            : "Draft saved",
      }));
      setCaptionEdit((state) => completeCaptionEdit(true, state));
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
  function removeDraftLocally(post: Post) {
    setPosts((current) => current.filter((item) => item.id !== post.id));
    setCaptions((current) => { const next = { ...current }; delete next[post.id]; return next; });
    setOriginals((current) => { const next = { ...current }; delete next[post.id]; return next; });
    setSelectedId(null);
  }
  async function approve(post: Post) {
    const caption = captions[post.id]?.trim();
    if (
      !planningAvailable || !caption ||
      post.media.some((asset) => asset.missing) ||
      approvalLocks.current.has(post.id)
    )
      return;
    approvalLocks.current.add(post.id);
    setApproving((value) => ({ ...value, [post.id]: true }));
    let reconciledQueue = false;
    try {
      await approveOnce(
        post.id,
        approvalSucceeded.current,
        async () => {
          const credits = [...new Set(post.media.map(credit).filter(Boolean))],
            response = await fetch("/api/weekly-post/approve", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(buildApprovalPayload(post, caption, originals[post.id] || caption, credits, queueUpdatedAtRef.current)),
            }),
            data = await response.json().catch(() => ({}));
          if (!response.ok || !data.ok)
            throw new Error(data.error || "Could not approve");
          const canonical = reconcileApprovalResponse(data, pool, planningAnchor);
          if (canonical) {
            setPosts(canonical.posts);
            setCaptions(canonical.captions);
            setOriginals(canonical.originals);
            setCoverage(canonical.coverage);
            setSelectedId(null);
            reconciledQueue = true;
            queueUpdatedAtRef.current = canonical.updatedAt;
          }
          else queueUpdatedAtRef.current = data.updatedAt || queueUpdatedAtRef.current;
          if (!canonical && post.planSlotId && typeof post.planPosition === "number") {
            setCoverage((current) => [
              ...current.filter((item) => item.slotId !== post.planSlotId),
              { slotId: post.planSlotId!, position: post.planPosition!, planningDate: post.planningDate || "", state: "approved", approvedPostId: data.postId || null },
            ]);
          }
        },
        async () => { if (!reconciledQueue) removeDraftLocally(post); },
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
          planPosition = nextPlanPosition(posts, coverage),
          planningDate = nextPlanningDate(posts, coverage, planningAnchor),
          draftId = `draft-${crypto.randomUUID()}`,
          post: Post = { id: draftId, draftId, planSlotId: `slot-${crypto.randomUUID()}`, planningDate, planPosition, media: draftMedia, kind, purpose: "Manual draft" },
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
        setSelectedId(draftId);
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
    <section aria-labelledby="review-title" className="editorial-overview editorial-shell">
      <div className="content-gallery-main">
      <header className="editorial-overview-heading">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            Made for your table. Ready for your feed.
          </p>
          <h1
            id="review-title"
            className="editorial-serif mt-3 text-4xl font-normal sm:text-[2.8rem]"
          >
            Your next two weeks
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            A thoughtful mix of real drafts and open ideas. Nothing publishes or
            schedules automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/approved-posts" className="btn-secondary">
            Approved <span className="text-stone-400">{approvedCount}</span>
          </Link>
          <button
            type="button"
            disabled={!planningAvailable}
            onClick={() => setComposerOpen((value) => !value)}
            className="btn-secondary"
          >
            {composerOpen ? "Close composer" : "+ New post"}
          </button>
        </div>
      </header>
      <div className="editorial-toolbar">
        <span>Two-week view</span><span className="text-[#92938a]">Suggested plan</span>
        <div className="ml-auto flex flex-wrap items-center gap-5"><span className="font-medium text-[#34352f]">⌗ Grid</span><Link href="/media-bank">Media library</Link><button type="button" disabled={!planningAvailable} onClick={() => setComposerOpen(true)} className="font-medium text-[#cb542d]">+ New post</button></div>
      </div>
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
              disabled={!planningAvailable || busy || !draftCaption.trim() || !draftMedia.length}
              onClick={() => void saveNewDraft()}
              className="btn-primary"
            >
              Save for review
            </button>
          </div>
        </div>
      )}
      {planningCells.every((cell) => cell.type === "open") ? (
        <div className="rounded-xl border border-dashed bg-white px-6 py-16 text-center">
          <h2 className="text-lg">No posts ready for review</h2>
          <p className="mt-2 text-sm text-stone-500">
            When finished posts are prepared, they’ll appear here with their
            real media and captions.
          </p>
        </div>
      ) : (
        <div
          className="editorial-grid content-gallery-grid"
          aria-label="Posts ready for review"
        >
          {planningCells.map((cell, index) => {
            if (cell.type === "covered") {
              const label = cell.coverage.state === "approved" ? "Approved" : cell.coverage.state === "skipped" ? "Skipped" : "Removed";
              return <article key={cell.coverage.slotId} className="editorial-plan-card">
                <div className="editorial-card-meta"><span>{cell.coverage.planningDate || suggestedDays[index]}</span><span>{label}</span></div>
                <div className={`editorial-planned-slot content-gallery-tile planned-${index % 3}`}>
                  <span className="editorial-eyebrow">Planning coverage</span>
                  <span className="editorial-serif mt-8 text-left text-3xl leading-tight">{label} post</span>
                  <span className="mt-auto text-left text-xs leading-5">This place is accounted for<br/>Nothing scheduled automatically</span>
                </div>
                <h2 className="editorial-serif mt-3 text-2xl font-normal">{label} in this plan</h2>
                <p className="mt-1 text-xs text-[#888980]">Planning date · Not a publish schedule</p>
              </article>;
            }
            if (cell.type === "open") {
              return <article key={`open-${index}`} className="editorial-plan-card">
                <div className="editorial-card-meta"><span>{planningDates[index] || suggestedDays[index % suggestedDays.length]}</span><span>Open idea</span></div>
                <button type="button" disabled={!planningAvailable} onClick={() => setComposerOpen(true)} className={`editorial-planned-slot content-gallery-tile planned-${index % 3}`}>
                  <span className="editorial-eyebrow">Unprepared slot</span><span className="mt-9 flex h-10 w-10 items-center justify-center rounded-full border border-[#ced0c2] text-2xl font-light">+</span>
                  <span className="editorial-serif mt-5 text-left text-3xl leading-tight">{slotDirections[index % slotDirections.length]}</span>
                  <span className="mt-auto text-left text-xs leading-5">Media + caption not prepared<br/>Nothing scheduled</span>
                </button><h2 className="editorial-serif mt-3 text-2xl font-normal">Room for something new</h2><p className="mt-1 text-xs text-[#888980]">Idea only · Nothing scheduled</p>
              </article>;
            }
            const post = cell.post,
              backlog = Boolean(cell.backlog);
            const asset = tileMedia(post),
              missing = post.media.some((item) => item.missing),
              waiting = post.revision?.status === "waiting",
              revised = post.revision?.status === "revised";
            return (
              <article key={post.id} className="editorial-plan-card">
              <div className="editorial-card-meta"><span>{post.planningDate || "SUGGESTED PLACEMENT"}</span><span>{backlog ? "Needs review" : post.kind}</span></div>
              <button
                type="button"
                onClick={() => openPost(post.id)}
                className="editorial-card-media content-gallery-tile group"
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
              <button type="button" onClick={() => openPost(post.id)} className="mt-3 block text-left">
                <h2 className="editorial-serif text-2xl font-normal">{postTitle(post, captions[post.id] || "")}</h2>
                <p className="mt-1 text-xs text-[#888980]">{post.kind} · {backlog ? "Past suggested date · Still awaiting review" : "Draft"}</p>
              </button>
              </article>
            );
          })}
        </div>
      )}
      <section className="editorial-stories">
        <div><p className="editorial-eyebrow">Keep it in the moment</p><h2 className="editorial-serif mt-2 text-2xl font-normal">Weekend Stories</h2></div>
        {["This weekend","Next weekend"].map(label => <button type="button" disabled={!planningAvailable} key={label} onClick={() => setComposerOpen(true)} className="editorial-story-idea"><span>+</span><span><strong>{label}</strong><small>Behind the scenes · Idea to prepare</small></span></button>)}
        <p className="text-right text-xs leading-5 text-[#92938a]">Room for<br/>real moments</p>
      </section>
      </div>
      {selected && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-[#f7f5f0] p-3 sm:p-6 lg:flex lg:items-center"
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
            className="mx-auto w-full max-w-[1320px] overflow-hidden rounded-md border border-[#dfded5] bg-[#fffefb] outline-none lg:flex lg:max-h-[calc(100dvh-3rem)] lg:flex-col"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/95 px-4 py-3 backdrop-blur">
              <div className="min-w-0 pr-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                  {statusLabel(selected)}
                </p>
                <h2 id="post-detail-title" className="editorial-serif truncate text-2xl font-normal sm:text-3xl">
                  {postTitle(selected, captions[selected.id] || "")}
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
            <div className="grid lg:min-h-0 lg:flex-1 lg:grid-cols-[190px_minmax(0,1.08fr)_minmax(340px,.82fr)]">
              <aside className="hidden border-r border-[#dfded5] bg-[#faf9f5] p-4 lg:min-h-0 lg:overflow-y-auto lg:block">
                <p className="editorial-eyebrow">Your two-week grid</p>
                <div className="mt-4 grid grid-cols-3 gap-1.5">{posts.slice(0,6).map(post => { const asset=tileMedia(post); return <button type="button" key={post.id} onClick={()=>openPost(post.id)} className={`aspect-square overflow-hidden bg-[#e9e7df] p-0.5 ${post.id===selected.id?"ring-2 ring-[#cb542d]":""}`}>{!asset||asset.missing?<span className="flex h-full items-center justify-center text-xs text-stone-500">!</span>:isVideo(asset)?<video src={url(asset)} muted className="h-full w-full object-cover"/>:<img src={url(asset)} alt="" className="h-full w-full object-cover"/>}</button>})}</div>
                <p className="mt-4 text-xs text-[#8b8c83]">{posts.length} draft{posts.length===1?"":"s"} ready</p>
                <div className="mt-6 border-t border-[#dfded5] pt-5"><p className="editorial-eyebrow">Ready for review</p>{posts.map((post,index)=><button type="button" key={post.id} onClick={()=>openPost(post.id)} className={`mt-2 block w-full rounded px-2 py-2 text-left text-xs ${post.id===selected.id?"bg-[#eae9df]":"hover:bg-[#f0efe9]"}`}><span className="mr-2 text-[#9a9b92]">{String(index+1).padStart(2,"0")}</span>{postTitle(post,captions[post.id]||"")}</button>)}</div>
              </aside>
              <div className="flex min-h-[22rem] flex-col bg-stone-950 lg:min-h-0">
                <div className="relative flex h-[min(62dvh,32rem)] min-h-0 flex-none items-center justify-center p-4 sm:p-6 lg:h-auto lg:flex-1">
                  {!selectedMedia || selectedMedia.missing ? (
                    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-stone-500">
                      This draft is preserved, but media{" "}
                      {selectedMedia?.id || selected.media[0]?.id || "for this post"} is unavailable.
                    </div>
                  ) : isVideo(selectedMedia) ? (
                    <video
                      src={url(selectedMedia)}
                      controls
                      playsInline
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <img
                      src={url(selectedMedia)}
                      alt={selectedMedia?.filename || ""}
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
                <div className="mb-7 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#262722] text-sm text-white">F</span><div><p className="text-sm font-semibold">Fireova</p><p className="text-xs text-stone-500">Instagram post preview</p></div></div>
                {captionEdit.editing ? <><label
                  htmlFor="post-caption"
                  className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500"
                >Edit caption</label><textarea
                  id="post-caption"
                  disabled={!canInteractWithCaptionEdit(busy)}
                  value={captionEdit.draft}
                  onChange={(event) => {
                    setCaptionEdit((state) => updateCaptionEdit(state, event.target.value));
                    setSaved((value) => ({ ...value, [selected.id]: "" }));
                  }}
                  rows={6}
                  className="mt-2 min-h-32 max-h-64 w-full resize-y overflow-y-auto rounded-xl border border-stone-200 p-3 text-sm leading-6 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                /><div className="mt-3 flex justify-end gap-2"><button type="button" disabled={busy} onClick={()=>setCaptionEdit(cancelCaptionEdit())} className="btn-secondary">Cancel</button><button type="button" onClick={()=>void saveCaption(selected, captionEdit.draft)} disabled={!planningAvailable || busy || !captionEdit.draft.trim()} className="btn-primary">Save caption</button></div></> : <p className="whitespace-pre-wrap text-[1.05rem] leading-7 text-[#383a34]">{captions[selected.id] || ""}</p>}
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
                        disabled={!planningAvailable || busy || !noteDraft.trim()}
                        className="btn-primary"
                      >
                        Save revision note
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button type="button" disabled={busy} onClick={() => setCaptionEdit(beginCaptionEdit(captions[selected.id] || ""))} className="btn-secondary justify-center">Edit caption</button>
                  <button
                    type="button"
                    onClick={() => {
                      setNoteDraft(selected.revision?.note || "");
                      setEditingNote(true);
                    }}
                    disabled={!planningAvailable || busy}
                    className="btn-secondary justify-center"
                  >
                    {selected.revision ? "Update revision note" : "Leave revision note"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void approve(selected)}
                    disabled={
                      !planningAvailable || busy ||
                      !canApproveCaptionEdit(captionEdit) ||
                      Boolean(approving[selected.id]) ||
                      selected.media.some((asset) => asset.missing) ||
                      !captions[selected.id]?.trim()
                    }
                    className="btn-primary col-span-2 justify-center"
                  >
                    {approving[selected.id] ? "Approving…" : captionEdit.editing ? "Save or cancel caption edits first" : "Approve post"}
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
