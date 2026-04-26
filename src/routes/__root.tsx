import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-serif text-graphite">404</h1>
        <p className="mt-4 font-mono-label text-xs text-graphite-light">Page not found</p>
        <Link to="/" className="mt-6 inline-block bg-graphite text-paper px-4 py-2 text-sm">
          Return home
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
      { title: "UNMAPPED — Citizen Resilience Protocol" },
      { name: "description", content: "A field journal for navigating the AI transition. Discover your skills, see what's at risk, and trace a path forward." },
      { name: "theme-color", content: "#F7F5F0" },
      { property: "og:title", content: "UNMAPPED" },
      { property: "og:description", content: "A field journal for navigating the AI transition." },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..600&family=Caveat:wght@500;700&family=Nunito:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return <Outlet />;
}
