// Plain ESM config loaded natively (--configLoader native), so Vite never bundles it.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the export works at an IPFS gateway subpath or an ENS name.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
  },
  server: { fs: { allow: [".."] } },
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
