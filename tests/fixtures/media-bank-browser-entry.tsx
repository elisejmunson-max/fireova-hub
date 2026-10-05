import React from 'react';
import {createRoot} from 'react-dom/client';
import MediaLibrary from '../../app/(app)/media-bank/library';
const seed=(window as any).__MEDIA_FIXTURE__;
createRoot(document.getElementById('root')!).render(<section className="editorial-media-bank editorial-shell"><header className="editorial-media-heading"><div><p className="editorial-eyebrow">Your visual archive</p><h1 className="editorial-serif mt-3 text-4xl font-normal sm:text-[2.8rem]">Media Bank</h1><p className="mt-2 max-w-xl text-sm leading-6 text-stone-500">Find the photographs and videos that make Fireova feel unmistakably yours.</p></div><p className="text-xs uppercase tracking-[0.14em] text-stone-400">{seed.counts.all} items</p></header><div className="editorial-media-library"><MediaLibrary initialAssets={seed.items} initialCounts={seed.counts} initialError={seed.initialError}/></div></section>);
