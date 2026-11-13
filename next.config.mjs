/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bundle server-only warehouse HTML with the identity-gated viewer route.
  // Do not put this file under public/ — it must not be a static URL.
  outputFileTracingIncludes: {
    "/api/viewer": ["./server-data/warehouse-site-preview-v3.html"],
  },
};

export default nextConfig;
