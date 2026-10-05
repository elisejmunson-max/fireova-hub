/** Fake data host; gallery components, app chrome, and styles are production code. */
import { createRoot } from 'react-dom/client';
import type { ComponentProps } from 'react';
import AppChrome from '../../components/layout/app-chrome';
import EditorialLoading from '../../components/layout/editorial-loading';
import WeeklyContentPersistent from '../../app/(app)/dashboard/weekly-content-persistent';
import ApprovedPostsGrid from '../../app/(app)/approved-posts/approved-posts-grid';
import MediaLibrary from '../../app/(app)/media-bank/library';

type Seed = {
  dashboard: ComponentProps<typeof WeeklyContentPersistent>;
  approved: ComponentProps<typeof ApprovedPostsGrid>['initialPosts'];
  media: ComponentProps<typeof MediaLibrary>;
};
declare global { interface Window { __GALLERY_FIXTURE__: Seed } }
const seed = window.__GALLERY_FIXTURE__;
const pathname = window.location.pathname;
const user = { id:'fixture-owner',email:'gallery@example.test' } as ComponentProps<typeof AppChrome>['user'];
let content;
if (new URLSearchParams(window.location.search).has('loading')) {
  content = <EditorialLoading />;
} else if (pathname === '/approved-posts') {
  content = <section className="editorial-approved editorial-shell content-gallery-shell">
    <header className="editorial-overview-heading"><div><p className="editorial-eyebrow">Ready when you are</p><h1 className="editorial-serif mt-3 text-4xl font-normal sm:text-[2.8rem]">Approved Posts</h1><p className="mt-2 max-w-xl text-sm leading-6 text-stone-500">Plan the feed before you post it. Nothing publishes or schedules automatically.</p></div><a href="/dashboard" className="editorial-primary">Review more</a></header>
    <div className="editorial-approved-content"><ApprovedPostsGrid initialPosts={seed.approved} /></div>
  </section>;
} else if (pathname === '/media-bank') {
  content = <section className="editorial-media-bank editorial-shell content-gallery-shell">
    <header className="editorial-media-heading"><div><p className="editorial-eyebrow">Your visual archive</p><h1 className="editorial-serif mt-3 text-4xl font-normal sm:text-[2.8rem]">Media Bank</h1><p className="mt-2 max-w-xl text-sm leading-6 text-stone-500">Find the photographs and videos that make Fireova feel unmistakably yours.</p></div><p className="text-xs uppercase tracking-[0.14em] text-stone-400">Photos &amp; videos</p></header>
    <div className="editorial-media-library"><MediaLibrary {...seed.media} /></div>
  </section>;
} else {
  content = <div><div className="page-content editorial-create-page py-4 sm:py-8"><div><WeeklyContentPersistent {...seed.dashboard} /></div></div></div>;
}
createRoot(document.getElementById('root')!).render(<AppChrome user={user}>{content}</AppChrome>);
