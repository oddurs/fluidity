import type { NextConfig } from "next";

/**
 * GitHub Pages serves a project site from a subpath
 * (`https://<user>.github.io/<repo>`), so the build needs to know that prefix.
 * The deploy workflow sets BASE_PATH; local `next dev` leaves it empty and the
 * app runs from the root as usual.
 */
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // The whole app is client-rendered on top of a WebGL canvas and has no
  // server work to do, so it ships as plain static files.
  output: "export",
  basePath,
  // Pages has no image optimizer behind it.
  images: { unoptimized: true },
  // Emit `about/index.html` rather than `about.html`, which is what a static
  // host expects to resolve from a bare directory URL.
  trailingSlash: true,
};

export default nextConfig;
