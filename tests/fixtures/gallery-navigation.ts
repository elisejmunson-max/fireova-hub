/** Test-only App Router adapter; each fixture tab uses a real document navigation. */
export const usePathname = () => window.location.pathname;
export const useRouter = () => ({ push: (href: string) => window.location.assign(href) });
