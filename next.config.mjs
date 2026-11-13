/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the large warehouse HTML out of the static asset pipeline.
  outputFileTracingIncludes: {
    "/api/viewer": ["./warehouse-model/warehouse-site-preview-v3.html"],
  },
};

export default nextConfig;
