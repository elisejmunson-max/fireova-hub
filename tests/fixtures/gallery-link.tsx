/** Test-only Link adapter. App Router prefetch/navigation is outside this fixture. */
import type { AnchorHTMLAttributes } from 'react';
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) { return <a {...props} />; }
