import type { NextConfig } from "next";

import { hotelPhotoHost } from "./src/platform/hotel/hotel-photos";
import { placePhotoHosts } from "./src/platform/place-photos/place-photo-provider";

const nextConfig: NextConfig = {
  images: {
    // Our photos are served from this origin; these hosts are only for cards saved before
    // 1.0702 that still link to Amap or Wikimedia, so the optimizer may fetch only from them.
    // RollingGo's hotel photos (1.2117 stays) come from its own image host.
    remotePatterns: [...placePhotoHosts, hotelPhotoHost].map((hostname) => ({ protocol: "https", hostname })),
    // A local proxy in TUN/fake-IP mode answers DNS with 198.18.x.x, so the optimizer
    // reads every photo host as a private address and answers 400 — on the developer's
    // machine no place photo loads at all (2026-10-23). Development only: a deployed
    // server resolves real addresses and keeps the SSRF guard.
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
  },
};

export default nextConfig;
