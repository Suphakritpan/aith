import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // ponytail: react-hooks v7 "recommended" bundles React Compiler rules
      // (set-state-in-effect, refs, purity, ...) that flag pre-existing,
      // working patterns across this codebase. Keep just the two classic,
      // uncontroversial checks; revisit the compiler rules as a separate pass.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // codebase convention: `_name` in a destructure means "deliberately dropped"
      "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^_" }],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
);
