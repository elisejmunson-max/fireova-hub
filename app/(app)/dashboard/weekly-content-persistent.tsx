'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Asset = { id: string; storage_path: string; file_type: string; tags?: string[] | null };
type Kind = 'Photo' | 'Reel' | 'Carousel';
type Post = { id: string; media: Asset[]; kind: Kind; bucket: string };
type Slot = { assetIds: string[]; kind: Kind; caption: string; originalCaption: string };
type Suggestion = { assetIds: string[]; kind: Kind; purpose?: string; caption: string };

const tagValues = (asset: Asset, prefix: string) => (asset.tags || []).filter((tag) => tag.startsWith(prefix)).map((tag) => tag.slice(prefix.length).toLowerCase());
const credit = (asset: Asset) => tagValues(asset, 'photographer:')[0]?.trim() || '';
const hero = (asset: Asset) => tagValues(asset, 'primary:')[0]?.trim() || tagValues(asset, 'subject:')[0]?.trim() || '';
function bucket(asset: Asset) {
  const value = hero(asset);
  if (/charcuterie|grazing|salami|cheese|shrimp|tiramisu|cannoli|dessert|cake|cookie|pizza\b|salad|food|appetizer|small bite|tuna|ahi/.test(value)) return 'food';
  if (/oven|truck|buffet|table|setup|venue|decor|menu|signage|display|wedding/.test(value)) return 'experience';
  if (/person|people|team|chef|staff|making|stretching|serving|preparing|bride|groom|couple/.test(value)) return 'team';
  return 'other';
}
function restore(slots: Slot[], pool: Asset[]) {
  const byId = new Map(pool.map((asset) => [asset.id, asset]));
  const posts: Post[] = [];
  const captions: Record<string, string> = {};
  const originals: Record<string, string> = {};
  slots.forEach((slot, index) => {
    const media = (slot.assetIds || []).map((id) => byId.get(id)).filter((asset): asset is Asset => Boolean(asset));
    if (!media.length) return;
    const id = `saved-${index}-${media.map((asset) => asset.id).join('-')}`;
    posts.push({ id, media, kind: media.length === 1 && slot.kind === 'Carousel' ? 'Photo' : slot.kind, bucket: bucket(media[0]) });
    captions[id] = slot.caption || '';
    originals[id] = slot.originalCaption || slot.caption || '';
  });
  return { posts, captions, originals };
}

export default function WeeklyContentPersistent({ initialAssets, savedSlots = [] }: { initialAssets: Asset[]; savedSlots?: Slot[] }) {
  const supabase = useMemo(() => createClient() as any, []);
  const restored = useMemo(() => restore(savedSlots, initialAssets), [savedSlots, initialAssets]);
  const [pool] = useState(initialAssets);
  const [posts, setPosts] = useState<Post[]>(() => restored.posts);
  const [captions, setCaptions] = useState<Record<string, string>>(() => restored.captions);
  const [originals, setOriginals] = useState<Record<string, string>>(() => restored.originals);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [starting, setStarting] = useState(restored.posts.length === 0);
  const [approving, setApproving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slide, setSlide] = useState<Record<string, number>>({});
  const [approvedCount, setApprovedCount] = useState(0);
  const initialized = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaUrl = (asset: Asset) => supabase.storage.from('media').getPublicUrl(asset.storage_path).data.publicUrl;

  async function persist(nextPosts = posts, nextCaptions = captions, nextOriginals = originals) {
    const slots = nextPosts.map((post) => ({
      assetIds: post.media.map((asset) => asset.id),
      kind: post.kind,
      caption: nextCaptions[post.id] || '',
      originalCaption: nextOriginals[post.id] || nextCaptions[post.id] || '',
    }));
    const response = await fetch('/api/review-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slots }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'Could not save review queue');
  }

  function queuePersist(nextCaptions: Record<string, string>) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist(posts, nextCaptions, originals).catch((error: any) => setErrors((value) => ({ ...value, week: error.message || 'Could not save review queue' })));
    }, 700);
  }

  async function generateMissing(targets: Post[], allPosts: Post[], baseCaptions = captions, baseOriginals = originals) {
    if (!targets.length) return;
    setErrors((value) => {
      const next = { ...value };
      targets.forEach((post) => delete next[post.id]);
      return next;
    });
    setLoading((value) => ({ ...value, ...Object.fromEntries(targets.map((post) => [post.id, true])) }));
    try {
      const response = await fetch('/api/weekly-post/week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts: targets.map((post) => ({ assetIds: post.media.map((asset) => asset.id), format: post.kind })) }),
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.posts) || data.posts.length !== targets.length) throw new Error(data.error || 'Could not write captions');
      const nextCaptions = { ...baseCaptions };
      const nextOriginals = { ...baseOriginals };
      targets.forEach((post, index) => {
        const caption = String(data.posts[index]?.caption || '').trim();
        if (!caption) throw new Error('Caption came back empty');
        nextCaptions[post.id] = caption;
        nextOriginals[post.id] = caption;
      });
      await persist(allPosts, nextCaptions, nextOriginals);
      setCaptions(nextCaptions);
      setOriginals(nextOriginals);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not write caption';
      setErrors((value) => ({ ...value, ...Object.fromEntries(targets.map((post) => [post.id, message])) }));
    } finally {
      setLoading((value) => {
        const next = { ...value };
        targets.forEach((post) => delete next[post.id]);
        return next;
      });
    }
  }

  async function getStrategicSuggestions(count: number, excludeAssetIds: string[]) {
    const response = await fetch('/api/review-queue/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count, excludeAssetIds }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.suggestions) || data.suggestions.length !== count) throw new Error(data.error || 'Could not build strategic suggestions');
    return data.suggestions as Suggestion[];
  }

  function materialize(suggestions: Suggestion[], prefix: string) {
    const byId = new Map(pool.map((asset) => [asset.id, asset]));
    const nextPosts: Post[] = [];
    const nextCaptions: Record<string, string> = {};
    const nextOriginals: Record<string, string> = {};
    suggestions.forEach((suggestion, index) => {
      const media = suggestion.assetIds.map((id) => byId.get(id)).filter((asset): asset is Asset => Boolean(asset));
      if (media.length !== suggestion.assetIds.length || !media.length || !suggestion.caption?.trim()) throw new Error('Strategic suggestion was incomplete');
      const kind: Kind = media.length === 1 && suggestion.kind === 'Carousel' ? 'Photo' : suggestion.kind;
      const id = `${prefix}-${index}-${media.map((asset) => asset.id).join('-')}`;
      nextPosts.push({ id, media, kind, bucket: bucket(media[0]) });
      nextCaptions[id] = suggestion.caption.trim();
      nextOriginals[id] = suggestion.caption.trim();
    });
    return { posts: nextPosts, captions: nextCaptions, originals: nextOriginals };
  }

  async function buildInitialStrategicSet() {
    setStarting(true);
    setErrors((value) => ({ ...value, week: '' }));
    try {
      const suggestions = await getStrategicSuggestions(3, []);
      const next = materialize(suggestions, `strategy-${Date.now()}`);
      await persist(next.posts, next.captions, next.originals);
      setPosts(next.posts);
      setCaptions(next.captions);
      setOriginals(next.originals);
    } catch (error) {
      setErrors((value) => ({ ...value, week: error instanceof Error ? error.message : 'Could not build review set' }));
    } finally {
      setStarting(false);
    }
  }

  async function replaceOne(current: Post) {
    setLoading((value) => ({ ...value, [current.id]: true }));
    setErrors((value) => {
      const next = { ...value };
      delete next[current.id];
      return next;
    });
    try {
      const exclude = posts.filter((post) => post.id !== current.id).flatMap((post) => post.media.map((asset) => asset.id));
      const suggestions = await getStrategicSuggestions(1, exclude);
      const replacement = materialize(suggestions, `strategy-${Date.now()}`);
      const newPost = replacement.posts[0];
      const nextPosts = posts.map((post) => (post.id === current.id ? newPost : post));
      const nextCaptions = { ...captions };
      const nextOriginals = { ...originals };
      delete nextCaptions[current.id];
      delete nextOriginals[current.id];
      nextCaptions[newPost.id] = replacement.captions[newPost.id];
      nextOriginals[newPost.id] = replacement.originals[newPost.id];
      await persist(nextPosts, nextCaptions, nextOriginals);
      setPosts(nextPosts);
      setCaptions(nextCaptions);
      setOriginals(nextOriginals);
    } catch (error) {
      setErrors((value) => ({ ...value, [current.id]: error instanceof Error ? error.message : 'Could not build another post' }));
    } finally {
      setLoading((value) => {
        const next = { ...value };
        delete next[current.id];
        return next;
      });
    }
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (!restored.posts.length) {
      void buildInitialStrategicSet();
      return;
    }
    const missing = restored.posts.filter((post) => !String(restored.captions[post.id] || '').trim());
    if (missing.length) void generateMissing(missing, restored.posts, restored.captions, restored.originals);
  }, []);

  async function removeFromCarousel(post: Post, index: number) {
    if (post.kind !== 'Carousel' || post.media.length < 2) return;
    const media = post.media.filter((_, itemIndex) => itemIndex !== index);
    const updated: Post = { ...post, media, kind: media.length === 1 ? 'Photo' : 'Carousel', bucket: bucket(media[0]) };
    const nextPosts = posts.map((item) => (item.id === post.id ? updated : item));
    try {
      await persist(nextPosts, captions, originals);
      setPosts(nextPosts);
      setSlide((value) => ({ ...value, [post.id]: Math.min(index, media.length - 1) }));
    } catch (error) {
      setErrors((value) => ({ ...value, [post.id]: error instanceof Error ? error.message : 'Could not save carousel change' }));
    }
  }

  async function approve(post: Post) {
    const caption = captions[post.id]?.trim();
    if (!caption || approving[post.id]) return;
    setApproving((value) => ({ ...value, [post.id]: true }));
    try {
      const photoCredits = [...new Set(post.media.map(credit).filter(Boolean))];
      const response = await fetch('/api/weekly-post/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds: post.media.map((asset) => asset.id), caption: [caption, ...photoCredits].join('\n\nPhoto: ').trim(), originalCaption: originals[post.id] || caption, format: post.kind }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Could not approve');
      setApprovedCount((count) => count + 1);
      await replaceOne(post);
    } catch (error) {
      setErrors((value) => ({ ...value, [post.id]: error instanceof Error ? error.message : 'Could not approve' }));
    } finally {
      setApproving((value) => ({ ...value, [post.id]: false }));
    }
  }

  if (starting && !posts.length) {
    return <section><div className="mb-2"><h2 className="text-2xl font-semibold">Ready-to-go posts</h2><p className="text-sm text-stone-500">Choosing a balanced mix from your content bank…</p></div>{errors.week && <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{errors.week} <button type="button" className="ml-2 font-semibold underline" onClick={() => void buildInitialStrategicSet()}>Retry</button></div>}</section>;
  }

  return <section><div className="mb-2 flex items-end justify-between"><div><h2 className="text-2xl font-semibold">Ready-to-go posts</h2><p className="text-sm text-stone-500">Approve the ones you like. A new strategic suggestion will take its place.</p></div>{approvedCount > 0 && <span className="text-sm font-medium text-emerald-700">+{approvedCount} approved</span>}</div>{errors.week && <p className="mb-2 text-xs text-red-600">{errors.week}</p>}<div className="grid gap-3 lg:grid-cols-3">{posts.map((post) => {const index = Math.min(slide[post.id] || 0, post.media.length - 1), asset = post.media[index], photoCredits = [...new Set(post.media.map(credit).filter(Boolean))], isLoading = Boolean(loading[post.id]), error = errors[post.id];return <article key={post.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="flex items-center justify-between px-4 py-2"><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">Ready to review</span><span className="text-xs text-stone-500">{post.kind}{post.kind === 'Carousel' ? ` · ${post.media.length} photos` : ''}</span></div><div className="relative bg-stone-100 lg:h-[clamp(300px,48vh,455px)]">{asset.file_type.startsWith('video/') ? <video src={mediaUrl(asset)} muted playsInline controls className="h-full w-full object-cover"/> : <img src={mediaUrl(asset)} alt="" className="h-full w-full object-cover"/>}{post.kind === 'Carousel' && <><button aria-label="Previous photo" onClick={() => setSlide((value) => ({ ...value, [post.id]: (index - 1 + post.media.length) % post.media.length }))} className="absolute left-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-black/55 text-white">‹</button><button aria-label="Next photo" onClick={() => setSlide((value) => ({ ...value, [post.id]: (index + 1) % post.media.length }))} className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-black/55 text-white">›</button><button type="button" aria-label="Remove from carousel" title="Remove from carousel" onClick={() => void removeFromCarousel(post, index)} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-lg leading-none text-white/90 shadow-sm transition hover:bg-black/60">×</button><span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">{index + 1} of {post.media.length}</span></>}</div><div className="p-3"><p className="text-[9px] font-semibold uppercase tracking-wider text-stone-400">Ready-to-post caption</p>{isLoading ? <p className="mt-1 flex h-[68px] items-center text-sm text-stone-400">Choosing the next post…</p> : error && !captions[post.id]?.trim() ? <div className="mt-1 flex h-[68px] items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50 px-3"><span className="text-xs text-red-600">Caption didn't load.</span><button type="button" onClick={() => void generateMissing([post], posts, captions, originals)} className="text-xs font-semibold text-red-700 underline">Retry</button></div> : <textarea value={captions[post.id] || ''} onChange={(event) => {const next = { ...captions, [post.id]: event.target.value };setCaptions(next);queuePersist(next);}} rows={3} className="mt-1 h-[68px] w-full resize-none rounded-lg border border-stone-200 px-2 py-1.5 text-sm leading-5 outline-none focus:border-orange-300"/>}{photoCredits.length > 0 && <p className="mt-1 text-xs text-stone-500">Photo: {photoCredits.join(', ')}</p>}{error && captions[post.id]?.trim() && <p className="mt-1 text-xs text-red-600">{error}</p>}<div className="mt-2 grid grid-cols-2 gap-2"><button disabled={isLoading || !captions[post.id]?.trim() || approving[post.id]} onClick={() => void approve(post)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{approving[post.id] ? 'Saving…' : '✓ Approve'}</button><button disabled={isLoading} onClick={() => void replaceOne(post)} className="btn-secondary justify-center py-2 disabled:opacity-40">Another</button></div></div></article>;})}</div></section>;
}
