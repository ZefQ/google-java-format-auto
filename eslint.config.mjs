import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import pluginPrettier from "eslint-plugin-prettier";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    plugins: { prettier: pluginPrettier },
    rules: {
      "prettier/prettier": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
    ignores: ["out", "node_modules"],
  },
];