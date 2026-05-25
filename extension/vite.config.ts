import { resolve } from "path";
import { fileURLToPath } from "url";

import react from "@vitejs/plugin-react";
import { build as viteBuild, defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

const contentScripts = [
  {
    entry: "src/content-scripts/broker-detector.ts",
    output: "content-scripts/broker-detector.js",
  },
  {
    entry: "src/content-scripts/website-bridge.ts",
    output: "content-scripts/website-bridge.js",
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

const LOCALHOST_PATTERN =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i;

function validateProductionUrl(value: string, name: string) {
  if (!value.trim()) {
    throw new Error(`${name} is required for production extension builds.`);
  }
  if (LOCALHOST_PATTERN.test(value)) {
    throw new Error(`${name} cannot use localhost or 127.0.0.1 in production.`);
  }
  if (!value.startsWith("https://")) {
    throw new Error(`${name} must use HTTPS in production.`);
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  const apiBaseUrl = (env.VITE_API_BASE_URL || "").trim();
  const webAppUrl = (env.VITE_WEB_APP_URL || "").trim();
  const strictProdUrls = mode === "production" && Boolean(process.env.CI || process.env.VERCEL);

  if (strictProdUrls) {
    validateProductionUrl(apiBaseUrl, "VITE_API_BASE_URL");
    validateProductionUrl(webAppUrl, "VITE_WEB_APP_URL");
  }

  return {
    define: {
      __STRICT_PROD_URLS__: JSON.stringify(strictProdUrls),
    },
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
  };
});
