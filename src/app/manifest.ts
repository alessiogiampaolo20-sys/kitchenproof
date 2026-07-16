import type { MetadataRoute } from "next";

// PWA manifest (§16): installable kitchen app, standalone display.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KitchenProof",
    short_name: "KitchenProof",
    description: "Egenkontrol uden papir",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0F766E",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
