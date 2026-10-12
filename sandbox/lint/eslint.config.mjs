// Repro's own ESLint config for the `eslint` detector (sandbox/bin/repro_tools.py). Passed with
// --config, so a target's eslint.config.* is never looked up, and run with --no-inline-config, so
// its `eslint-disable` comments can't switch these rules off.
import tsParser from "@typescript-eslint/parser";
import security from "eslint-plugin-security";

const rules = {
  // eslint-plugin-security's recommended set, minus detect-object-injection: it flags every
  // `obj[key]` with a variable key, which is most property access in JavaScript.
  ...security.configs.recommended.rules,
  "security/detect-object-injection": "off",
  // Core rules for the same family of problem: code built from strings at run time.
  "no-eval": "warn",
  "no-implied-eval": "warn",
  "no-new-func": "warn",
  "no-script-url": "warn",
};

export default [
  // Installed dependencies, Repro's scratch space, and build output aren't the project's code.
  { ignores: ["**/node_modules/**", "**/.repro/**", "**/dist/**", "**/*.min.js"] },
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    plugins: { security },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    languageOptions: { ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
    rules,
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    plugins: { security },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    // Parse-only: no type information, so no tsconfig or installed dependencies are needed.
    languageOptions: { parser: tsParser, ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
    rules,
  },
];
