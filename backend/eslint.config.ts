import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.browser } },
  tseslint.configs.recommended,
  {
    rules: {
      // Database rows and GraphQL resolver payloads are deliberately untyped at
      // these application boundaries. Validate/cast them at their consumers.
      "@typescript-eslint/no-explicit-any": "off",
      // Legacy error wrappers do not yet preserve the original error object.
      "preserve-caught-error": "off",
    },
  },
]);
