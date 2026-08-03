import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const basePath = process.env.GITHUB_ACTIONS ? "/beyond-performer-console" : "";
  return {
    name: "BEYOND Performer",
    short_name: "BEYOND",
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: "standalone",
    background_color: "#0b0d0b",
    theme_color: "#0b0d0b",
    orientation: "landscape",
    icons: [
      { src: `${basePath}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${basePath}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };
}
