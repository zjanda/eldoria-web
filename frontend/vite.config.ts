import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const backend = process.env.ELDORIA_BACKEND_URL ?? "http://127.0.0.1:8000";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const publicBase = env.ELDORIA_PUBLIC_BASE || "/";
  if (!publicBase.startsWith("/") || !publicBase.endsWith("/") || publicBase.startsWith("//") || publicBase.includes("..")) {
    throw new Error("ELDORIA_PUBLIC_BASE must be / or /repository-name/.");
  }
  if (mode === "hosted") {
    const origin = env.VITE_BACKEND_ORIGIN?.trim();
    if (!origin) throw new Error("Hosted builds require VITE_BACKEND_ORIGIN. Configure your protected HTTPS backend first.");
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
      throw new Error("Hosted builds require an HTTPS backend origin, without a path or credentials.");
    }
  }
  return {
    base: publicBase,
    build: { outDir: mode === "hosted" ? "dist-hosted" : "dist" },
    plugins: [react()],
    server: {
      port: 5173,
      // Allow NordVPN Meshnet hostnames (e.g. neural-forge.nord) for remote play.
      allowedHosts: [".nord"],
      proxy: {
        "/api": backend,
        "/media": backend,
      },
    },
  };
});
