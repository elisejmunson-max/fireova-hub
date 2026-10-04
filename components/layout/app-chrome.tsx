"use client";

import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import Sidebar from "@/components/layout/sidebar";
import EditorialNav from "@/components/layout/editorial-nav";

const editorialRoutes = new Set(["/dashboard", "/approved-posts", "/media-bank"]);

export default function AppChrome({ children, user }: { children: React.ReactNode; user: User }) {
  const pathname = usePathname();
  const isEditorialRoute = editorialRoutes.has(pathname);

  return (
    <div className={isEditorialRoute ? "editorial-app-frame editorial-shell min-h-screen bg-[#f7f5f0]" : "min-h-screen bg-stone-50"}>
      <Sidebar user={user} />
      {isEditorialRoute ? <div className="editorial-persistent-nav"><EditorialNav /></div> : null}
      <div className={isEditorialRoute ? "min-h-screen pt-14 md:pt-0" : "min-h-screen pt-14 md:ml-64 lg:pt-0"}>
        <main className="min-h-screen overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
