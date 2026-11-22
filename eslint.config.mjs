import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Side-by-side build/dev output folders (NEXT_DIST_DIR=.next-build, .next-preview, ...).
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "legacy-mvp/**",
  ]),
]);

export default eslintConfig;
