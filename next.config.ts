import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Opened at 127.0.0.1 and through the public tunnel.
  // If a host is missing here, the page is drawn but clicks and drops do nothing.
  allowedDevOrigins: ["127.0.0.1", "*.trycloudflare.com"],
};

export default nextConfig;
