import type { NextConfig } from "next";

import { placePhotoHosts } from "./src/platform/place-photos/place-photo-provider";

const nextConfig: NextConfig = {
  images: {
    // Place photos are Amap's; the optimizer may fetch only from its photo hosts.
    remotePatterns: placePhotoHosts.map((hostname) => ({ protocol: "https", hostname })),
    // A local proxy in TUN/fake-IP mode answers DNS with 198.18.x.x, so the optimizer
    // reads every photo host as a private address and answers 400 — on the developer's
    // machine no place photo loads at all (2026-10-23). Development only: a deployed
    // server resolves real addresses and keeps the SSRF guard.
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
  },
};

export default nextConfig;
