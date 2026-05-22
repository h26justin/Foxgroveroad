import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Client-side route cache. Dynamic pages default to 0s, which means
  // every nav re-fetches the page server-side. Setting `dynamic: 30`
  // means once a route has been visited, going back to it within 30s
  // serves the cached RSC payload without a server round-trip.
  //
  // Trade-off: data is up to 30s stale after a mutation made via a
  // route other than the one you're currently on. For housekeeping +
  // booking flows the in-page mutations call revalidatePath which
  // busts the SERVER cache; the client cache will refresh on its own
  // schedule (30s) which is fine for cross-tab freshness.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  // Allow next/image to optimise images served from Supabase Storage.
  // The host is project-specific; *.supabase.co covers any project ref.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
};

export default nextConfig;
