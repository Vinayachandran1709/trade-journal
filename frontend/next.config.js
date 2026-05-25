const DEFAULT_PRODUCTION_API_URL = "https://indiacircle.in/api";
const LOCALHOST_PATTERN =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i;

function validateProductionApiUrl() {
  if (
    process.env.NODE_ENV !== "production" ||
    (!process.env.CI && !process.env.VERCEL)
  ) {
    return;
  }

  const configured = (process.env.NEXT_PUBLIC_API_URL || "").trim();
  if (!configured) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is required for production builds and must use the HTTPS production API URL."
    );
  }

  if (LOCALHOST_PATTERN.test(configured)) {
    throw new Error(
      "NEXT_PUBLIC_API_URL cannot point to localhost or 127.0.0.1 in a production build."
    );
  }

  if (!configured.startsWith("https://")) {
    throw new Error(
      "NEXT_PUBLIC_API_URL must start with https:// in a production build."
    );
  }
}

validateProductionApiUrl();

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL || DEFAULT_PRODUCTION_API_URL,
  },
};

module.exports = nextConfig;
