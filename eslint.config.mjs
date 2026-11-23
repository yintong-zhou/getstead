import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([".next/**", ".tmp/**", ".import-data/**", "db/generated/**", "next-env.d.ts", "components/charts/**", "components/shimmering-text.tsx"]),
]);
