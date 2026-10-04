"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const routes = [
  ["/dashboard", "Create Content"],
  ["/approved-posts", "Approved Posts"],
  ["/marketing-events", "Events"],
  ["/media-bank", "Media Bank"],
  ["/brain", "Fireova Brain"],
] as const;

export default function EditorialNav() {
  const pathname = usePathname();

  async function signOut() {
    await createClient().auth.signOut();
    window.location.assign("/login");
  }

  return (
    <nav aria-label="Fireova" className="editorial-compact-nav">
      <Link href="/dashboard" className="editorial-compact-brand">
        fireova<span>•</span>
      </Link>
      {routes.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className={pathname === href ? "is-active" : undefined}
        >
          {label}
        </Link>
      ))}
      <button type="button" onClick={() => void signOut()} className="ml-auto">
        Sign out
      </button>
    </nav>
  );
}
