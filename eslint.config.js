import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    rules: {
      "no-await-in-loop": "warn",
      "no-unused-vars": "warn",
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        console: true,
        process: true,
        fetch: true,
      }
    }
  }
];
