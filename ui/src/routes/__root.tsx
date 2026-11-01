import { useEffect } from "react";
import { HeadContent, Outlet, Scripts, createRootRoute, useRouterState } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { HubProvider, useHub } from "../hub";
import { Stage } from "../components/Stage";
import { Setup } from "../screens/Setup";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover,interactive-widget=resizes-visual" },
      { name: "theme-color", content: "#eef1f6" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { title: "Home Hub" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&family=Comfortaa:wght@700&family=Figtree:wght@600;700;800&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Nunito:wght@700&display=swap" },
      { rel: "stylesheet", href: appCss },
    ],
    scripts: [{ children: 'if("serviceWorker"in navigator)addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}))' }],
  }),
  shellComponent: ({ children }) => (
    <html lang="en"><head><HeadContent /></head><body>{children}<Scripts /></body></html>
  ),
  component: () => <HubProvider>{(S, failed) => failed
    ? <div className="page"><h1>Can't reach the hub</h1><p className="lead">Check that it's running, then reload.</p></div>
    : S ? <Screen /> : null}</HubProvider>,
});

function Screen() {
  const { S } = useHub();
  const path = useRouterState({ select: s => s.location.pathname });
  useEffect(() => {                                      // no pinch or double-tap zoom, like a native app (Safari ignores the viewport rule)
    const stop = (e: Event) => e.preventDefault();
    const multi = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    for (const g of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(g, stop);
    document.addEventListener("touchmove", multi, { passive: false });
    return () => { for (const g of ["gesturestart", "gesturechange", "gestureend"]) document.removeEventListener(g, stop); document.removeEventListener("touchmove", multi); };
  }, []);
  useEffect(() => { document.title = S.config.name || "Home Hub"; }, [S.config.name]);
  if (!S.config.setup_done) return <Setup first />;
  if (path === "/setup") return <Setup first={false} />;
  return <><Stage /><Outlet /></>;
}
