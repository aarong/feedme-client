// There is a Jasmine browser runner import map to get these working in the browser
// import emitter from "component-emitter";
// import _ from "lodash";
// import check from "check-types";

// If this is running in the browser, load the browser bundle from the global scope
// Otherwise dynamically load the Node build (which is a CJS module)
// Careful not to confuse build/index.js with root build.js
// Had to set parserOptions in eslintrc to suppress a parser error on import()
const FeedmeClient =
  typeof window !== "undefined"
    ? window.FeedmeClient // eslint-disable-line no-undef
    : (await import("../../build/index.js")).default;

// You need to use mjs otherwise Jasmine will try to load the index.js bundle as ESM (doesn't work)

// Don't produce eslint warnings about unnamed functions
// You can't use arrow functions because context is being checked in the tests
/* eslint-disable func-names */

const harness = function () {
  return {
    _fmClient: new FeedmeClient({
      on() {},
      connect() {},
      send() {},
      disconnect() {},
    }),
  };
};

export default harness;
