/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/viewer": ["./server-data/warehouse-site-preview-v3.html"],
    "/api/viewer/asset": [
      "./server-data/warehouse-site-data.js",
      "./server-data/app/editor.js",
      "./node_modules/three/build/three.min.js",
      "./node_modules/three/examples/js/controls/OrbitControls.js",
    ],
  },
};

export default nextConfig;
