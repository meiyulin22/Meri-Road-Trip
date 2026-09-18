import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Meri",
    short_name: "Meri",
    description: "Your Personal Outdoor Intelligence Companion",
    start_url: "/",
    display: "standalone",
    background_color: "#091326",
    theme_color: "#091326",
    icons: [
      {
        src: "/brand/meri-app-icon-1024.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/meri-app-icon-1024.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
