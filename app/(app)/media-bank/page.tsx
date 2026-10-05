import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { MediaAsset } from "@/lib/types";
import AutosaveBridge from "./autosave-bridge";
import MediaIntelligencePanel from "./intelligence-panel";
import MediaLibrary from "./library";
import { MEDIA_PAGE_SIZE } from "@/lib/media-bank-pagination";

export const metadata: Metadata = { title: "Media Bank" };

export default async function MediaBankPage({
  searchParams,
}: {
  searchParams?: { eventId?: string; event?: string };
}) {
  const sb = createClient() as any;
  const {
    data: { user },
  } = await sb.auth.getUser();
  let assets: MediaAsset[] = [];
  let initialError = "";
  let counts = { all: 0, photo: 0, video: 0 };
  const eventId = (searchParams?.eventId || searchParams?.event || "").trim();

  if (user && user.id !== "dev") {
    if (eventId) {
      const { data: eventMedia } = await sb
        .from("event_media")
        .select("id,storage_path,file_name,file_type,size_bytes,created_at")
        .eq("user_id", user.id)
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });
      if (eventMedia?.length) {
        await sb.from("media_assets").upsert(
          eventMedia.map((item: any) => ({
            id: item.id,
            user_id: user.id,
            filename: item.file_name,
            storage_path: item.storage_path,
            file_type: item.file_type,
            size_bytes: item.size_bytes ?? 0,
            tags: [`event:${eventId}`],
            notes: null,
            created_at: item.created_at,
          })),
          { onConflict: "id", ignoreDuplicates: true },
        );
      }
      const { data } = await sb
        .from("media_assets")
        .select("*")
        .eq("user_id", user.id)
        .contains("tags", [`event:${eventId}`])
        .order("created_at", { ascending: true })
        .limit(500);
      assets = (data || []) as MediaAsset[];
    } else {
      const fields =
        "id,filename,storage_path,file_type,created_at,tags,ai_categories";
      const [initial, all, photos, videos] = await Promise.all([
        sb
          .from("media_assets")
          .select(fields)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(0, MEDIA_PAGE_SIZE - 1),
        sb
          .from("media_assets")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        sb
          .from("media_assets")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .like("file_type", "image/%"),
        sb
          .from("media_assets")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .like("file_type", "video/%"),
      ]);
      if (initial.error || all.error || photos.error || videos.error)
        initialError = "Could not load media. Please retry.";
      assets = (initial.data || []) as MediaAsset[];
      counts = {
        all: all.count || 0,
        photo: photos.count || 0,
        video: videos.count || 0,
      };
    }
  }

  if (eventId)
    return (
      <div>
        {assets.length ? (
          <MediaIntelligencePanel assets={assets as any[]} />
        ) : (
          <div className="card m-6 p-8 text-center">
            <p className="font-semibold">No event media found for review.</p>
          </div>
        )}
      </div>
    );

  return (
    <section className="editorial-media-bank editorial-shell">
      <AutosaveBridge />
      <header className="editorial-media-heading">
        <div>
          <p className="editorial-eyebrow">Your visual archive</p>
          <h1 className="editorial-serif mt-3 text-4xl font-normal sm:text-[2.8rem]">
            Media Bank
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-500">
            Find the photographs and videos that make Fireova feel unmistakably
            yours.
          </p>
        </div>
        <p className="text-xs uppercase tracking-[0.14em] text-stone-400">
          Photos &amp; videos
        </p>
      </header>
      <div className="editorial-media-library">
        <MediaLibrary
          initialAssets={assets as any[]}
          initialCounts={counts}
          initialError={initialError}
        />
      </div>
    </section>
  );
}
