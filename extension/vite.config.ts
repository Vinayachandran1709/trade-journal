import { resolve } from "path";
import { fileURLToPath } from "url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: resolve(rootDir, "popup.html"),
        sidepanel: resolve(rootDir, "sidepanel.html"),
        background: resolve(rootDir, "src/background/index.ts"),
        brokerDetector: resolve(
          rootDir,
          "src/content-scripts/broker-detector.ts"
        ),
        tickerHighlighter: resolve(
          rootDir,
          "src/content-scripts/ticker-highlighter.ts"
        ),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") {
            return "background.js";
          }
          if (chunkInfo.name === "brokerDetector") {
            return "content-scripts/broker-detector.js";
          }
          if (chunkInfo.name === "tickerHighlighter") {
            return "content-scripts/ticker-highlighter.js";
          }
          return "assets/[name].js";
        },
        chunkFileNames: "assets/chunks/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
});
