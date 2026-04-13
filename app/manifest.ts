import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AHlogu",
    short_name: "AHlogu",
    description: "Offline-first work logger for field teams.",
    start_url: "/",
    display: "standalone",
    background_color: "#085153",
    theme_color: "#085153",
    icons: [
      {
        src: "/AHlogu.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/AHlogu.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
