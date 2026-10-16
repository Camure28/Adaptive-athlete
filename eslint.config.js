import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/preview/**", "**/.expo/**", "**/node_modules/**", "**/coverage/**", "**/*.config.js", "apps/mobile/metro.config.js", "supabase/functions/_shared/engine.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "error",
    },
  },
  // Edge Functions log server-side errors to the Supabase dashboard.
  { files: ["supabase/functions/**"], rules: { "no-console": "off" } },
);
