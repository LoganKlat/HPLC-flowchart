import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server is opened at 127.0.0.1. Without this, the page is drawn
  // but clicks do nothing.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
