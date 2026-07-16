import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// The service worker is bundled separately (scripts/build-sw.mjs) because
// @serwist/next's injection does not support Turbopack builds (Next 16).
const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
