import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second build/server run next to `next dev` (e.g. NEXT_DIST_DIR=.next-preview).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
