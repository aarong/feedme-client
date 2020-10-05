/* eslint-disable import/no-extraneous-dependencies, no-console */
import "make-promises-safe"; // Exit with error on unhandled rejection
import Jasmine from "jasmine";
import path from "path";
import fs from "fs";
import promisify from "util.promisify"; // Only in Node 8+ and want to test in 6+

/*

Cannot run Jasmine directly in the CLI if you want Babel to transpile.
Instead, run this script using babel-node.

*/

// Throw on unhandled Promise rejections so that the script fails
process.on("unhandledRejection", err => {
  throw err;
});

(async () => {
  // Run the tests in Jasmine
  console.log("Launching tests in Jasmine...");
  const jasmine = new Jasmine();
  jasmine.loadConfig({
    spec_dir: path.join(__dirname, "tests"),
    spec_files: [`${__dirname}/tests/**/*.test.js`],
    random: false,
    stopSpecOnExpectationFailure: true
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
