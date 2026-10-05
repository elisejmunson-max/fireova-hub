/** Fixture supplies data only: the integrated production review/editor components render every control. */
import {createRoot} from 'react-dom/client';
import type {ComponentProps} from 'react';
import WeeklyContentPersistent from '../../app/(app)/dashboard/weekly-content-persistent';
declare global {interface Window {__POST_MEDIA_FIXTURE__: ComponentProps<typeof WeeklyContentPersistent>}}
createRoot(document.getElementById('root')!).render(
  <div className="page-content editorial-create-page py-4 sm:py-8"><WeeklyContentPersistent {...window.__POST_MEDIA_FIXTURE__}/></div>
);
