import { resolve } from "path";
import { fileURLToPath } from "url";

import react from "@vitejs/plugin-react";
import { build as viteBuild, defineConfig } from "vite";
import type { Plugin } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

const contentScripts = [
  {
    entry: "src/content-scripts/broker-detector.ts",
    output: "content-scripts/broker-detector.js",
  },
  {
    entry: "src/content-scripts/ticker-highlighter.ts",
    output: "content-scripts/ticker-highlighter.js",
  },
  {
    entry: "src/content-scripts/checklist-overlay.ts",
    output: "content-scripts/checklist-overlay.js",
  },
];

function buildContentScripts(): Plugin {
  return {
    name: "build-content-scripts",
    async closeBundle() {
      for (const script of contentScripts) {
        await viteBuild({
          configFile: false,
          root: rootDir,
          build: {
            outDir: resolve(rootDir, "dist"),
            emptyOutDir: false,
            sourcemap: true,
            lib: {
              entry: resolve(rootDir, script.entry),
              formats: ["iife"],
              name: "_",
              fileName: () => script.output,
            },
          },
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), buildContentScripts()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: resolve(rootDir, "popup.html"),
        sidepanel: resolve(rootDir, "sidepanel.html"),
        background: resolve(rootDir, "src/background/index.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") {
            return "background.js";
          }
          return "assets/[name].js";
        },
        chunkFileNames: "assets/chunks/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
});
