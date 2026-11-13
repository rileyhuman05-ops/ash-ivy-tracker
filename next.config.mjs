/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bundle only the slim seed + HTML with the identity-gated viewer.
  // Large Three.js / full Fishbowl seed are NOT shipped (CDN + Supabase).
  outputFileTracingIncludes: {
    "/api/viewer": ["./server-data/warehouse-site-preview-v3.html"],
    "/api/viewer/asset": ["./server-data/warehouse-site-data.js"],
  },
  // Never inline server secrets into the browser bundle.
  // SUPABASE_* must stay process.env reads in Node route handlers only.
};

export default nextConfig;
