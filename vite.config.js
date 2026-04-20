import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Supabase project host — hard-coded here because the client key is already
// public (anon key). Keeps the workbox URL-pattern predicate simple.
const SUPABASE_HOST = 'dhvnquuvfspnwayqmqtu.supabase.co';

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            filename: 'sw.js',
            // We own the manifest at public/manifest.webmanifest — don't let
            // vite-plugin-pwa emit a duplicate.
            manifest: false,
            includeAssets: ['favicon.ico', 'manifest.webmanifest', 'icons/*.png'],
            workbox: {
                // Precache the built app shell. Keep generated files in the
                // default pattern; the SW manifest is in-memory at build.
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                // Supabase realtime websockets + storage presigned URLs can
                // be larger than Workbox's default 2 MB threshold.
                maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
                navigateFallback: '/index.html',
                // Only the /crew scope needs navigation fallback — PM views
                // should stay strictly online.
                navigateFallbackAllowlist: [/^\/crew/],
                runtimeCaching: [
                    {
                        // Supabase REST / PostgREST endpoints used by the
                        // crew. NetworkFirst so fresh data wins when online;
                        // fall back to cache (up to 7 days) when offline.
                        urlPattern: ({ url }) =>
                            url.host === SUPABASE_HOST &&
                            (url.pathname.startsWith('/rest/v1/') ||
                                url.pathname.startsWith('/graphql/v1')),
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'supabase-api-v1',
                            networkTimeoutSeconds: 5,
                            expiration: {
                                maxEntries: 200,
                                maxAgeSeconds: 7 * 24 * 60 * 60,
                            },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                ],
            },
            devOptions: {
                // Keep the SW out of `npm run dev` — hot-reload and SW
                // caching fight each other in unhelpful ways.
                enabled: false,
            },
        }),
    ],
});
