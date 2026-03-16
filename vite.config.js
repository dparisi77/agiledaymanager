import { defineConfig } from "vite";

export default defineConfig({
  root: "./",
  server: {
    port: 5173,
    open: true,
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      input: "index.html",
    },
  },
});
