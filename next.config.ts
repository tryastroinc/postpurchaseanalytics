import type { NextConfig } from "next";

// The board (public/ppa) is plain static HTML/CSS/JS served as-is; everything
// dynamic goes through the authed /api routes. No special config needed.
const nextConfig: NextConfig = {};

export default nextConfig;
