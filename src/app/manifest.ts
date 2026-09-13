import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Meri",
    short_name: "Meri",
    description: "Your Personal Outdoor Intelligence Companion",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1e8",
    theme_color: "#17352c",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
