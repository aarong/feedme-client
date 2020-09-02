/* eslint-disable import/no-extraneous-dependencies, no-console */
import "make-promises-safe"; // Exit with error on unhandled rejection
import express from "express";
import sauceConnectLauncher from "sauce-connect-launcher";
import request from "request";
import _ from "lodash";
import path from "path";
import webpack from "webpack";
import fs from "fs";
import promisify from "util.promisify"; // Only in Node 8+ and want to test in 6+
import targets from "../targets";

(async () => {
  // Config
  const port = 3000;
  const sauceTunnelId = process.env.TRAVIS_JOB_NUMBER || "feedme-client-tunnel"; // Travis sets tunnel id to job number
  const pollInterval = 10000;

  // Determine testing mode
  // sauce-automatic: launches Sauce Connect Proxy and a suite of testing VMs on Sauce
  // sauce-automatic-hanging: launches Sauce Connect Proxy and a suite of hanging VMs on Sauce
  // sauce-live: launches Sauce Connect Proxy so that you log into Sauce and do a live test
  // local: launches only the local web server, which can be accessed from a local browser
  let mode = "sauce-automatic"; // default (for Travis)
  if (process.argv.length >= 3) {
    if (
      _.includes(
        ["sauce-automatic", "sauce-automatic-hanging", "sauce-live", "local"],
        process.argv[2].toLowerCase()
      )
    ) {
      mode = process.argv[2].toLowerCase();
    } else {
      throw new Error(
        "INVALID_ARGUMENT: Mode must be local, sauce-live, sauce-automatic (default), or sauce-automatic-hanging."
      );
    }
  }

  // Require Sauce credentials if you're not running locally
  if (
    mode !== "local" &&
    (!process.env.SAUCE_USERNAME || !process.env.SAUCE_ACCESS_KEY)
  ) {
    throw new Error(
      "NO_CREDENTIALS: The SAUCE_USERNAME or SAUCE_ACCESS_KEY environmental variable is missing."
    );
  }

  // The following platforms test and return successfully on Sauce
  const saucePlatforms = [
    // ///////////// Windows 10

    // Sauce has Chrome 26+
    // Trivial Jasmine test fails on 26-28 (no launch)
    // One integration test fails to 35 (disconnect before settle)
    ["Windows 10", "Chrome", "36"],
    ["Windows 10", "Chrome", "latest"],

    // Sauce has Firefox 4+
    // Trivial Jasmine test fails on 56+ (appears to pass but no return)
    // Receiving feedmeClient not defined with no console errors to 21
    ["Windows 10", "Firefox", "22"],
    ["Windows 10", "Firefox", "55"],

    // Sauce has Edge 13+
    ["Windows 10", "MicrosoftEdge", "13"],
    ["Windows 10", "MicrosoftEdge", "latest"],

    // Sauce has IE 11
    // Trivial Jasmine test fails (appears to pass but no return)

    // ///////////// Windows 8.1

    // Sauce has Chrome 26+
    // Trivial Jasmine test fails on 26-28 (no launch)
    // One integration test fails to 35 (disconnect before settle)
    ["Windows 8.1", "Chrome", "36"],
    ["Windows 8.1", "Chrome", "latest"],

    // Sauce has Firefox 4+
    // Trivial Jasmine test fails on 56+ (appears to pass but no return)
    // Receiving feedmeClient not defined with no console errors to 21
    ["Windows 8.1", "Firefox", "22"],
    ["Windows 8.1", "Firefox", "55"],

    // Sauce has IE 11
    // Trivial Jasmine test fails (appears to pass but no return)

    // ///////////// Windows 8

    // Sauce has Chrome 26+
    // Trivial Jasmine test fails on 26-28 (no launch)
    // One integration test fails to 35 (disconnect before settle)
    ["Windows 8", "Chrome", "36"],
    ["Windows 8", "Chrome", "latest"],

    // Sauce has Firefox 4+
    // Trivial Jasmine test fails on 56+ (appears to pass but no return)
    // Receiving feedmeClient not defined with no console errors to 21
    ["Windows 8", "Firefox", "22"],
    ["Windows 8", "Firefox", "55"],

    // Sauce has IE 10
    // Trivial Jasmine test fails (appears to pass but no return)

    // ///////////// Windows 7

    // Sauce has Chrome 26+
    // Trivial Jasmine test fails on 26-28 (no launch)
    // One integration test fails to 35 (disconnect before settle)
    ["Windows 7", "Chrome", "36"],
    ["Windows 7", "Chrome", "latest"],

    // Sauce has Firefox 4+
    // Trivial Jasmine test fails on 56+ (appears to pass but no return)
    // Receiving feedmeClient not defined with no console errors to 21
    ["Windows 7", "Firefox", "22"],
    ["Windows 7", "Firefox", "55"],

    // Sauce has IE 9-11
    // Trivial Jasmine test fails on all (9 does not support Jasmine, 10-11 appear to pass but no return)

    // ///////////// macOS 10.14

    // Sauce has Chrome 27+
    // Trivial Jasmine test fails on 27-30 (no launch)
    // One integration test fails to 35 (disconnect before settle)
    ["macOS 10.14", "Chrome", "36"],
    ["macOS 10.14", "Chrome", "latest"],

    // Sauce has Firefox 4+
    // Trivial Jasmine test fails on 56+ (appears to pass but no return)
    // Receiving feedmeClient not defined with no console errors to 21
    ["macOS 10.14", "Firefox", "22"],
    ["macOS 10.14", "Firefox", "55"],

    // Sauce has Edge 79+
    ["macOS 10.14", "MicrosoftEdge", "79"],
    ["macOS 10.14", "MicrosoftEdge", "latest"],

    // Sauce has Safari 12
    // Trivial Jasmine test fails (appears to pass but no return)

    // ///////////// macOS 10.13

    // Sauce has Chrome 27+
    // Trivial Jasmine test fails on 27-30 (no launch)
    // One integration test fails to 35 (disconnect before settle)
    ["macOS 10.13", "Chrome", "36"],
    ["macOS 10.13", "Chrome", "latest"],

    // Sauce has Firefox 4+
    // Trivial Jasmine test fails on 56+ (appears to pass but no return)
    // Receiving feedmeClient not defined with no console errors to 21
    ["macOS 10.13", "Firefox", "22"],
    ["macOS 10.13", "Firefox", "55"],

    // Sauce has Edge 79+
    ["macOS 10.13", "MicrosoftEdge", "79"],
    ["macOS 10.13", "MicrosoftEdge", "latest"],

    // Sauce has Safari 11-13
    // Trivial Jasmine test fails on all (appears to pass but no return)

    // ///////////// macOS 10.12

    // Sauce has Chrome 27+
    // Trivial Jasmine test fails on 27-30 (no launch)
    // One integration test fails to 35 (disconnect before settle)
    ["macOS 10.12", "Chrome", "36"],
    ["macOS 10.12", "Chrome", "latest"],

    // Sauce has Firefox 4+
    // Trivial Jasmine test fails on 56+ (appears to pass but no return)
    // Receiving feedmeClient not defined with no console errors to 21
    ["macOS 10.12", "Firefox", "22"],
    ["macOS 10.12", "Firefox", "55"],

    // Sauce has Edge 79+
    ["macOS 10.12", "MicrosoftEdge", "79"],
    ["macOS 10.12", "MicrosoftEdge", "latest"],

    // Sauce has Safari 10-11
    // Trivial Jasmine test fails on all (appears to pass but no return)

    // ///////////// macOS 10.10

    // All browsers receive "Unsupported OS/browser/version/device combo" error

    // ///////////// macOS 10.10

    // All browsers receive "Unsupported OS/browser/version/device combo" error

    // ///////////// Linux

    // Sauce has Chrome 26+
    // Trivial Jasmine test fails on 26-29 (no launch)
    // One integration test fails to 35 (disconnect before settle)
    ["Linux", "Chrome", "36"],
    ["Linux", "Chrome", "latest"],

    // Sauce has Firefox 4+
    // Receiving feedmeClient not defined with no console errors to 21
    ["Linux", "Firefox", "22"],
    ["Linux", "Firefox", "latest"]
  ];

  // The following platforms test successfully on sauce, judging by the video,
  // but the Sauce results do not return successfully
  const saucePlatformsHanging = [
    // ///////////// Windows 10

    ["Windows 10", "Firefox", "56"],
    ["Windows 10", "Firefox", "latest"],

    ["Windows 10", "Internet Explorer", "11"],

    // ///////////// Windows 8.1

    ["Windows 8.1", "Firefox", "56"],
    ["Windows 8.1", "Firefox", "latest"],

    ["Windows 8.1", "Internet Explorer", "11"],

    // ///////////// Windows 8

    ["Windows 8", "Firefox", "56"],
    ["Windows 8", "Firefox", "latest"],

    // One integration test fails on IE 10 (disconnect before settle)

    // ///////////// Windows 7

    ["Windows 7", "Firefox", "56"],
    ["Windows 7", "Firefox", "latest"],

    // One integration test fails on IE 10 (disconnect before settle)
    ["Windows 7", "Internet Explorer", "11"],

    // ///////////// macOS 10.14

    ["macOS 10.14", "Firefox", "56"],
    ["macOS 10.14", "Firefox", "latest"],

    ["macOS 10.14", "Safari", "12"],

    // ///////////// macOS 10.13

    ["macOS 10.13", "Firefox", "56"],
    ["macOS 10.13", "Firefox", "latest"],

    ["macOS 10.13", "Safari", "11"],
    ["macOS 10.13", "Safari", "12"],
    ["macOS 10.13", "Safari", "13"],

    // ///////////// macOS 10.12

    ["macOS 10.12", "Firefox", "56"],
    ["macOS 10.12", "Firefox", "latest"],

    ["macOS 10.12", "Safari", "10"],
    ["macOS 10.12", "Safari", "11"]
  ];

  // Transpile and bundle the tests and drop in webroot
  // Webpack bundling required to insert promise polyfills and dependencies like component-emitter
  console.log("Transpiling and bundling tests...");
  let webpackStats;
  try {
    webpackStats = await promisify(webpack)({
      entry: path.resolve(__dirname, "tests.js"),
      mode: "production",
      module: {
        rules: [
          {
            test: /\.js$/,
            exclude: [
              /\bnode_modules[\\/]{1}core-js\b/,
              /\bnode_modules[\\/]{1}webpack\b/
            ],
            use: {
              loader: "babel-loader",
              options: {
                babelrc: false,
                sourceType: "unambiguous",
                presets: [
                  [
                    "@babel/preset-env",
                    {
                      modules: false,
                      useBuiltIns: "usage",
                      corejs: {
                        version: "3",
                        proposals: true
                      },
                      targets: targets.browsers
                      // debug: true
                    }
                  ]
                ]
              }
            }
          }
        ]
      },
      output: {
        filename: "tests.js",
        path: path.resolve(__dirname, "webroot")
      },
      optimization: {
        minimize: false
      },
      devtool: "source-maps",
      performance: {
        maxAssetSize: 1000000,
        maxEntrypointSize: 1000000
      }
      // stats: "verbose"
    });
  } catch (e) {
    console.log("Webpack threw an error");
    console.log(e.toString());
    return; // Stop
  }
  if (webpackStats.hasErrors()) {
    console.log("Webpack reported one or more compilation errors");
    console.log(webpackStats.toString());
    process.exit(1); // Return failure
  }
  if (webpackStats.hasWarnings()) {
    console.log("Webpack reported one or more warnings");
    console.log(webpackStats.toString());
  }

  // Copy the latest client browser bundle and sourcemaps into the webroot
  // Note that Node 6 does not have fs.copyFile()
  console.log("Copying browser bundle and sourcemaps...");
  const bundle = await promisify(fs.readFile)(
    `${__dirname}/../build/bundle.withmaps.js`
  );
  await promisify(fs.writeFile)(
    `${__dirname}/webroot/bundle.withmaps.js`,
    bundle
  );
  const maps = await promisify(fs.readFile)(
    `${__dirname}/../build/bundle.withmaps.js.map`
  );
  await promisify(fs.writeFile)(
    `${__dirname}/webroot/bundle.withmaps.js.map`,
    maps
  );

  // Start the local webserver (adapted from Jasmine-standalone)
  console.log("Starting local webserver to host the tests...");
  const e = express();
  e.use("/", express.static(`${__dirname}/webroot`));
  const webserver = e.listen(port);
  await new Promise(resolve => {
    webserver.on("listening", resolve);
  });
  console.log(`Local server started on http://localhost:${port}`);

  // If you're running in local mode then stop here
  if (mode === "local") {
    return;
  }

  // Start Sauce Connect proxy if you aren't on Travis
  let sauceConnectProcess;
  if (process.env.CI) {
    console.log("Running on Travis - no need to start Sauce Connect proxy.");
  } else {
    console.log("Starting Sauce Connect proxy...");
    sauceConnectProcess = await promisify(sauceConnectLauncher)({
      tunnelIdentifier: sauceTunnelId,
      logFile: null
    });
    console.log("Sauce Connect proxy started.");
  }

  // If you're running in sauce-live mode then stop here
  if (mode === "sauce-live") {
    return;
  }

  // Call the Sauce REST API telling it to run the tests
  console.log("Calling Sauce REST API telling it to run the tests...");
  const response = await promisify(request)({
    url: `https://saucelabs.com/rest/v1/${process.env.SAUCE_USERNAME}/js-tests`,
    method: "POST",
    auth: {
      username: process.env.SAUCE_USERNAME,
      password: process.env.SAUCE_ACCESS_KEY
    },
    json: true,
    body: {
      url: `http://localhost:${port}/?throwFailures=true&oneFailurePerSpec=true`,
      framework: "custom",
      platforms:
        mode === "sauce-automatic-hanging"
          ? saucePlatformsHanging
          : saucePlatforms,
      maxDuration: 60, // Seconds/platform; kill hanging tests quickly or they won't all run before global timeout
      "tunnel-identifier": sauceTunnelId
    }
  });

  // Process REST API results
  let sauceTests;
  if (response.statusCode !== 200) {
    console.log("Sauce API returned an error.");
    throw response.body; // Use body as error (printed)
  } else {
    console.log("API call executed successfully.");
    sauceTests = response.body;
  }

  // Poll Sauce for the test results
  let sauceResults;
  do {
    console.log("Calling Sauce REST API to check test status...");
    // eslint-disable-next-line no-await-in-loop
    const response2 = await promisify(request)({
      url: `https://saucelabs.com/rest/v1/${process.env.SAUCE_USERNAME}/js-tests/status`,
      method: "POST",
      auth: {
        username: process.env.SAUCE_USERNAME,
        password: process.env.SAUCE_ACCESS_KEY
      },
      json: true,
      body: sauceTests // From the above API call
    });

    if (response2.statusCode !== 200) {
      console.log("Sauce API returned an error.");
      throw response2.body; // Use body as error (printed)
    } else if (!response2.body.completed) {
      console.log("Sauce API indicated tests not completed. Polling again...");
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } else {
      sauceResults = response2.body["js tests"];
    }
  } while (!sauceResults); // eslint-disable-line no-constant-conditions

  // Process and display the test results
  let allPassed = true;
  for (let i = 0; i < sauceResults.length; i += 1) {
    const platformUrl = sauceResults[i].url;
    const platformName = sauceResults[i].platform.join(":");
    const platformResult = sauceResults[i].result; // The window.global_test_results object
    // Note platformResult is null if custom data exceeds 64k
    // Note platformResult.total/passed/failed === 0 if there is a Javascript error (change this)
    // Did the platform pass?
    // Make sure tests are actually running (ie don't just check that none failed)
    const platformPassed =
      platformResult &&
      platformResult.failed === 0 &&
      platformResult.passed > 100;
    // Display the platform name and result
    if (platformPassed) {
      console.log(`PASSED ${platformName} passed all tests`);
    } else {
      console.log(
        `FAILED ${platformName} passed ${
          platformResult ? platformResult.passed : "???"
        }/${platformResult ? platformResult.total : "???"} tests`
      );
      console.log(`       ${platformUrl}`);
      // Print failed tests
      if (platformResult && platformResult.tests) {
        for (let j = 0; j < platformResult.tests.length; j += 1) {
          const test = platformResult.tests[j];
          if (!test.result) {
            console.log(`         Failing test: ${test.name}`);
            console.log(`         Message: ${test.message}`);
          }
        }
      }
    }
    // Track whether all platforms passed
    if (!platformPassed) {
      allPassed = false;
    }
  }

  // Close the Sauce Connect proxy (if not on Travis)
  if (sauceConnectProcess) {
    console.log("Stopping Sauce Connect proxy...");
    await promisify(sauceConnectProcess.close)();
  }

  // Stop the webserver
  console.log("Stopping the webserver...");
  await promisify(webserver.close.bind(webserver))();

  // Return success/failure
  if (allPassed) {
    console.log("Tests passed on all platforms.");
    process.exit(0);
  } else {
    console.log("Tests did not pass on all platforms");
    process.exit(1); // Return failure
  }
})();
