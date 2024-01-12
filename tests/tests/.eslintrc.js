module.exports = {
  env: {
    jasmine: true,
  },
  parserOptions: {
    // Required to suppress parser error on import()
    ecmaVersion: "latest",
    sourceType: "module",
  },
  rules: {
    "import/extensions": "off", // Code share with browser, which require filename extensions
  },
};
