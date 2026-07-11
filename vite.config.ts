import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

const sourceSha = process.env.SOURCE_SHA || "development";
const classicAssets = ["app.js", "storage.js", "hierarchy.js", "shortcuts.js"];

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
      generateBundle() {
        for (const fileName of classicAssets) {
          this.emitFile({ type: "asset", fileName, source: readFileSync(fileName, "utf8") });
        }
      },
    },
  ],
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        app: "index.html",
        classic: "classic/index.html",
      },
    },
  },
});
