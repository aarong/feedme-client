/* eslint-disable import/no-extraneous-dependencies, no-console */
import Jasmine from "jasmine";
import jsStringEscape from "js-string-escape";
import path from "path";
import fs from "fs";
import promisify from "util.promisify"; // Only in Node 8+ and want to test in 6+

// Throw on unhandled Promise rejections so that the script fails
process.on("unhandledRejection", err => {
  throw err;
});

(async () => {
  // Load the tests
  // No need to transpile - all syntax supported on Node 6+
  console.log("Loading the test file...");
  const testFileContents = await promisify(fs.readFile)(
    `${__dirname}/tests.js`,
    "utf-8"
  );

  // Prepend the module inclusion and write tests to temporary file
  console.log("Creating temporary test file...");
  const buildPath = path.normalize(path.join(__dirname, "../build"));
  const header = `var feedmeClient = require('${jsStringEscape(
    buildPath
  )}');\n\n`;
  await promisify(fs.writeFile)(
    `${__dirname}/node.tmp.js`,
    header + testFileContents
  );

  // Run the tests in Jasmine
  console.log("Launching tests in Jasmine...");
  const jasmine = new Jasmine();
  jasmine.loadConfig({
    spec_dir: ".",
    spec_files: [`${__dirname}/node.tmp.js`]
  });
  jasmine.execute();

  // Await completion
  console.log("Awaiting completion...");
  const passed = await new Promise(resolve => {
    jasmine.onComplete(iPassed => {
      resolve(iPassed);
    });
  });
  console.log("Tests completed.");

  // Delete the temp file
  console.log("Deleting temporary test file...");
  promisify(fs.unlink)(`${__dirname}/node.tmp.js`);

  // Return script success/failure according to test results
  if (passed) {
    console.log("The tests passed.");
    process.exit(0);
  } else {
    console.log("The tests failed.");
    process.exit(1);
  }
})();
