import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    // Older addresses from before the settings pages were grouped together
    return [
      { source: "/admin/availability", destination: "/admin/settings/hours", permanent: false },
      { source: "/admin/services", destination: "/admin/settings/services", permanent: false },
      { source: "/admin/resources", destination: "/admin/settings/doctors", permanent: false },
      { source: "/client/calendar", destination: "/client", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
