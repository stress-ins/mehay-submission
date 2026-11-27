import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import systemLocaleBabelPlugin from "./src/systemLocaleBabelPlugin";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const configuredBase = (env.VITE_APP_BASE_PATH || (mode === "production" ? "/mehay" : "")).trim();
  const appBase = configuredBase ? `/${configuredBase.replace(/^\/+|\/+$/g, "")}` : "";
  const configuredServerBase = (env.APP_BASE_PATH || "").trim();
  const serverBase = configuredServerBase ? `/${configuredServerBase.replace(/^\/+|\/+$/g, "")}` : "";
  const base = appBase ? `${appBase}/` : "/";
  const devApiTarget = env.VITE_DEV_API_TARGET || "http://127.0.0.1:3087";
  const apiPath = `${appBase}/api`;
  const uploadsPath = `${appBase}/uploads`;
  const rewriteBase = (path: string) => {
    const route = appBase && path.startsWith(`${appBase}/`) ? path.slice(appBase.length) : path;
    return `${serverBase}${route}` || "/";
  };
  const proxy = { target: devApiTarget, changeOrigin: true, rewrite: rewriteBase };
  return {
    base,
    plugins: [react({ jsxImportSource: ".", babel: { plugins: [systemLocaleBabelPlugin] } })],
    server: {
      host: "127.0.0.1",
      port: 5173,
      proxy: {
        [apiPath]: proxy,
        [uploadsPath]: proxy,
      },
    },
  };
});
