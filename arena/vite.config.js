import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: [
        "monaco/vs/**/*",
        "pyodide/**/*"
      ],
      manifest: {
        name: "PyZone Online Editor",
        short_name: "PyZone",
        description: "100% Internetsiz ishlovchi PyZone Python Muharriri",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/zone/online-editor",
        icons: [
          {
            src: "/zone/favicon.ico",
            sizes: "64x64 32x32 24x24 16x16",
            type: "image/x-icon"
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024, // 30MB for pyodide WASM and stdlib zip
        globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm,zip,json,mjs,txt}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "external-cdn-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 31536000
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\/pyodide\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "pyodide-offline-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 31536000
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\/monaco\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "monaco-offline-cache",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 31536000
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  base: "/zone/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
