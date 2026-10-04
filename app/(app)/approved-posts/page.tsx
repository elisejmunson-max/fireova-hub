import type { Metadata } from "next";
import Link from "next/link";
import EditorialNav from "@/components/layout/editorial-nav";
import { createClient } from "@/lib/supabase/server";
import ApprovedPostsGrid from "./approved-posts-grid";

export const metadata: Metadata = { title: "Approved Posts" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ApprovedPostsPage() {
  const sb = createClient() as any;
  const { data: { user } } = await sb.auth.getUser();
  let posts: any[] = [];

  if (user && user.id !== "dev") {
    const { data } = await sb
      .from("posts")
      .select("id,format,caption_option1,created_at,sort_order")
      .eq("user_id", user.id)
      .eq("pillar", "Approved Posts")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (data?.length) {
      const ids = data.map((post: any) => post.id);
      const { data: links } = await sb
        .from("post_media")
        .select("post_id,asset_id,display_order")
        .in("post_id", ids)
        .order("display_order", { ascending: true });
      const assetIds = [...new Set((links || []).map((link: any) => link.asset_id))];
      const { data: assets } = assetIds.length
        ? await sb
            .from("media_assets")
            .select("id,storage_path,file_type,tags")
            .in("id", assetIds)
            .eq("user_id", user.id)
        : { data: [] };
      posts = data.map((post: any) => ({
        ...post,
        media: (links || [])
          .filter((link: any) => link.post_id === post.id)
          .map((link: any) => assets?.find((asset: any) => asset.id === link.asset_id))
          .filter(Boolean),
      }));
    }
  }

  const url = (asset: any) =>
    sb.storage.from("media").getPublicUrl(asset.storage_path).data.publicUrl;
  const credit = (post: any) =>
    [...new Set(post.media.flatMap((asset: any) =>
      (asset.tags || [])
        .filter((tag: string) => tag.startsWith("photographer:"))
        .map((tag: string) => tag.slice(13)),
    ))] as string[];
  const gridPosts = posts.map((post) => ({
    id: post.id,
    format: post.format,
    caption: String(post.caption_option1 || "")
      .replace(/\n\nPhoto:\s*@?[^\n]+(?:\n|$)/gi, "")
      .trim(),
    credits: credit(post),
    sort_order: post.sort_order ?? null,
    media: post.media.map((asset: any) => ({
      id: asset.id,
      file_type: asset.file_type,
      url: url(asset),
      credit: (asset.tags || [])
        .find((tag: string) => tag.startsWith("photographer:"))
        ?.slice(13) || "",
    })),
  }));

  return (
    <section className="editorial-approved editorial-shell">
      <EditorialNav />
      <header className="editorial-overview-heading">
        <div>
          <p className="editorial-eyebrow">Ready when you are</p>
          <h1 className="editorial-serif mt-3 text-4xl font-normal sm:text-[2.8rem]">
            Approved Posts
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-500">
            Plan the feed before you post it. Nothing publishes or schedules
            automatically.
          </p>
        </div>
        <Link href="/dashboard" className="editorial-primary">
          Review more
        </Link>
      </header>
      <div className="editorial-approved-content">
        {posts.length ? (
          <ApprovedPostsGrid initialPosts={gridPosts} />
        ) : (
          <div className="rounded-md border border-dashed border-[#d4d4ca] bg-[#fffefb] p-10 text-center">
            <h2 className="editorial-serif text-2xl font-normal">
              No approved posts yet
            </h2>
            <p className="mt-2 text-sm text-stone-500">
              Approve posts you like and they’ll collect here.
            </p>
            <Link href="/dashboard" className="editorial-primary mt-5">
              Review posts
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
