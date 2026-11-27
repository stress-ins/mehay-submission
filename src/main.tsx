import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const root = createRoot(document.getElementById("root")!);
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
let route = window.location.pathname;
if (base && (route === base || route.startsWith(`${base}/`))) route = route.slice(base.length) || "/";
else if (!base && (route === "/mehay" || route.startsWith("/mehay/"))) route = route.slice(6) || "/";
const isLanding = route.replace(/\/$/, "") === "";

if (isLanding) {
  const Landing = React.lazy(() => import("./LandingPage"));
  root.render(
    <Suspense fallback={<div className="startup-screen" role="status">Открываем страницу…</div>}>
      <Landing />
    </Suspense>,
  );
} else {
  void import("./AppRoot").then(({ default: AppRoot }) => root.render(<AppRoot />));
}
