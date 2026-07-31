import { defineConfig } from "vite";

const sourceSha = process.env.SOURCE_SHA || "development";
const whiteboardDatabaseName = process.env.WHITEBOARD_DATABASE_NAME || "offline-whiteboard-v1";

export default defineConfig({
  base: "./",
  publicDir: "vendor",
  define: {
    __SOURCE_SHA__: JSON.stringify(sourceSha),
    __WHITEBOARD_DATABASE_NAME__: JSON.stringify(whiteboardDatabaseName),
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
