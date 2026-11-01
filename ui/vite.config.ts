import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";

// The hub serves the built files from its own Rust binary, so this runs as a single-page app (no Node server).
export default defineConfig({
  server: { proxy: { "/api": "http://localhost:8787" } },
  plugins: [tanstackStart({ spa: { enabled: true } }), react()],
});
