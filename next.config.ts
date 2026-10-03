import type { NextConfig } from "next";

import { placePhotoHosts } from "./src/platform/place-photos/place-photo-provider";

const nextConfig: NextConfig = {
  images: {
    // Place photos are Amap's; the optimizer may fetch only from its photo hosts.
    remotePatterns: placePhotoHosts.map((hostname) => ({ protocol: "https", hostname })),
  },
};

export default nextConfig;
