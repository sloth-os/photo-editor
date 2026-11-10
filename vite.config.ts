import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        id: "./",
        name: "Still — Photo editor",
        short_name: "Still",
        description: "Your private, offline photo studio.",
        theme_color: "#1b1e1b",
        background_color: "#1b1e1b",
        display: "standalone",
        orientation: "any",
        start_url: "./",
        scope: "./",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        file_handlers: [
          {
            action: "./",
            accept: {
              "image/jpeg": [".jpg", ".jpeg", ".jfif"],
              "image/png": [".png"],
              "image/webp": [".webp"],
              "image/avif": [".avif"],
              "image/bmp": [".bmp"],
              "image/gif": [".gif"],
              "image/x-adobe-dng": [".dng"],
              "image/x-canon-cr2": [".cr2"],
              "image/x-canon-cr3": [".cr3"],
              "image/x-nikon-nef": [".nef"],
              "image/x-sony-arw": [".arw"],
              "image/x-fuji-raf": [".raf"],
              "image/x-panasonic-rw2": [".rw2"],
              "image/x-olympus-orf": [".orf"],
              "image/x-pentax-pef": [".pef"],
              "image/x-samsung-srw": [".srw"],
            },
          },
        ],
        launch_handler: { client_mode: "focus-existing" },
        categories: ["photo", "graphics", "utilities"],
      },
      workbox: {
        globPatterns: [
          "**/*.{js,css,html,ico,png,svg,jpg,ttf,wasm,webmanifest,txt}",
        ],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
});
