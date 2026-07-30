import { defineConfig } from "vite";

const sourceSha = process.env.SOURCE_SHA || "development";

export default defineConfig({
  base: "./",
  publicDir: "vendor",
  define: {
    __SOURCE_SHA__: JSON.stringify(sourceSha),
  },
  plugins: [
    {
      name: "offline-mindmap-build-metadata",
      transformIndexHtml(html) {
        return html.replaceAll("__SOURCE_SHA__", sourceSha);
      },
    },
  ],
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        app: "index.html",
        legacy: "legacy/index.html",
        classic: "classic/index.html",
      },
    },
  },
});
