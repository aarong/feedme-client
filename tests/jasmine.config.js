// Configuration for Jasmine-browser-runner

module.exports = {
  srcDir: "build",
  srcFiles: ["bundle.withmaps.js"],

  specDir: "/",
  specFiles: ["tests/tests/**/*.test.*js"], // mjs and js

  // Dependencies of the client are obviously included in the browser bundle
  // The tests also have dependencies, which must be made available to the browser
  // Tried to map to node_modiles, but import maps work with ES modules only
  // and NPM packages are generally still distributed as CJS
  // Various NPM CDNs make pcakages available in ES format, so pull from there
  importMap: {
    imports: {
      "component-emitter":
        "https://cdn.jsdelivr.net/npm/component-emitter@2.0.0/+esm",
      lodash: "https://cdn.jsdelivr.net/npm/lodash@4.17.4/+esm",
      "check-types": "https://cdn.jsdelivr.net/npm/check-types@11.2.3/+esm",
    },
  },

  // Jasmine needs to treat the ES modules for the tests (common, etc) as such
  // But if you configure it to treat *all* js files as ES modules, then
  // loading bundle.withmaps.js fails (it's not an ESM)
  // So adopt the mjs extension here; maybe do this in general?
  esmFilenameExtension: ".mjs",
  enableTopLevelAwait: false,

  env: {
    stopSpecOnExpectationFailure: false,
    stopOnSpecFailure: false,
    random: false,
  },

  browser: {
    name: "headlessChrome",
  },
};
