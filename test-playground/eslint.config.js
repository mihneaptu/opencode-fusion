export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      globals: {
        console: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "error",
      "no-undef": "error",
      "eqeqeq": "error",
      "no-var": "error",
      "prefer-const": "error",
      "semi": ["error", "always"]
    }
  }
];
