/** Test-only host. Production components and both production stylesheets are bundled unchanged. */
import { createRoot } from 'react-dom/client';
import type { ComponentProps } from 'react';
import WeeklyContentPersistent from '../../app/(app)/dashboard/weekly-content-persistent';

declare global {
  interface Window { __MONTHLY_FIXTURE__: ComponentProps<typeof WeeklyContentPersistent> }
}

createRoot(document.getElementById('root')!).render(
  <main className="page-content editorial-create-page py-4 sm:py-8">
    <div>
      <WeeklyContentPersistent {...window.__MONTHLY_FIXTURE__} />
    </div>
  </main>,
);
