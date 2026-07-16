// Bundles the Serwist service worker (see src/app/sw.ts header for why this
// exists instead of @serwist/next's webpack injection).
import { build } from "esbuild";

const revision = `${Date.now()}`;

await build({
  entryPoints: ["src/app/sw.ts"],
  outfile: "public/sw.js",
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  define: {
    __SW_REV__: JSON.stringify(revision),
    "process.env.NODE_ENV": '"production"',
  },
});

console.log(`✓ public/sw.js built (rev ${revision})`);
