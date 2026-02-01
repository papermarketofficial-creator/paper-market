/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Copy .proto files to the server build output
      config.module.rules.push({
        test: /\.proto$/,
        type: "asset/resource",
        generator: {
          filename: "proto/[name][ext]",
        },
      });
    }
    return config;
  },
};

export default nextConfig;
