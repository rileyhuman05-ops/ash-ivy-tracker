/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bundle server-only warehouse HTML with the identity-gated viewer route.
  // Do not put this file under public/ — it must not be a static URL.
  outputFileTracingIncludes: {
    "/api/viewer": [
      "./server-data/warehouse-site-preview-v3.html",
      "./server-data/warehouse-site-data.js",
      "./server-data/vendor/three.min.js",
      "./server-data/vendor/OrbitControls.js",
    ],
    "/api/viewer/asset": [
      "./server-data/warehouse-site-data.js",
      "./server-data/vendor/three.min.js",
      "./server-data/vendor/OrbitControls.js",
    ],
  },
  // Never inline server secrets into the browser bundle.
  // SUPABASE_* must stay process.env reads in Node route handlers only.
};

export default nextConfig;
