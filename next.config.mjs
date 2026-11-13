/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/viewer": ["./server-data/warehouse-site-preview-v3.html"],
    "/api/viewer/asset": ["./server-data/warehouse-site-data.js"],
  },
};

export default nextConfig;
