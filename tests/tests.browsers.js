var copyFileSync = require("fs-copy-file-sync"); // Not in Node 6
var express = require("express");
var sauceConnectLauncher = require("sauce-connect-launcher");
var async = require("async");
var request = require("request");

var webserver;
var sauceConnectProcess;
var sauceTests;
var sauceResults;

// Config
var saucePlatforms = [
  ["Windows 7", "firefox", "27"]
  // ["Linux", "chrome", "latest"]
];
var port = 3000;
var sauceTunnelId = process.env.TRAVIS_JOB_NUMBER || "feedme-client-tunnel"; // Travis sets tunnel id to job number
var pollInterval = 10000;

async.series(
  [
    function(cb) {
      // Set up the webroot with the tests and built bundle

      copyFileSync(__dirname + "/tests.js", __dirname + "/webroot/tests.js");
      copyFileSync(
        __dirname + "/../build/bundle.js",
        __dirname + "/webroot/bundle.js"
      );
      copyFileSync(
        __dirname + "/../build/bundle.js.map",
        __dirname + "/webroot/bundle.js.map"
      );

      cb();
    },
    function(cb) {
      // Start the local webserver (adapted from Jasmine-standalone)
      console.log("Starting local webserver to host the tests...");
      var e = express();
      e.use("/", express.static(__dirname + "/webroot"));
      webserver = e.listen(port, function() {
        console.log("Local server started on http://localhost:" + port);
        cb();
      });
    },
    function(cb) {
      // Start Sauce Connect proxy if you aren't on Travis
      if (process.env.CI) {
        console.log("Running on Travis - no need to start Sauce Connect.");
        cb();
        return;
      }

      console.log("Starting Sauce Connect proxy...");
      sauceConnectLauncher(
        { tunnelIdentifier: sauceTunnelId, logFile: null },
        function(err, process) {
          if (err) {
            console.log("Failed to start Sauce Connect proxy.");
            cb(err);
          } else {
            console.log("Sauce Connect proxy started.");
            sauceConnectProcess = process;
            cb();
          }
        }
      );
    },
    function(cb) {
      // Call the Sauce REST API telling it to run the tests
      console.log("Calling Sauce REST API telling it to run the tests...");

      request(
        {
          url:
            "https://saucelabs.com/rest/v1/" +
            process.env.SAUCE_USERNAME +
            "/js-tests",
          method: "POST",
          auth: {
            username: process.env.SAUCE_USERNAME,
            password: process.env.SAUCE_ACCESS_KEY
          },
          json: true,
          body: {
            url: "http://localhost:" + port,
            framework: "custom",
            platforms: saucePlatforms,
            "tunnel-identifier": sauceTunnelId
          }
        },
        function(err, response) {
          if (err) {
            console.log("Request failed.");
            cb(err);
          } else if (response.statusCode !== 200) {
            console.log("Sauce API returned an error.");
            cb(response.body); // Use body as error (printed)
          } else {
            console.log("API call executed successfully.");
            sauceTests = response.body;
            cb();
          }
        }
      );
    },
    function(cb) {
      // Poll Sauce for the test results
      console.log("Polling Sauce for the test results...");

      var interval = setInterval(function() {
        console.log("Calling Sauce REST API to check test status...");
        request(
          {
            url:
              "https://saucelabs.com/rest/v1/" +
              process.env.SAUCE_USERNAME +
              "/js-tests/status",
            method: "POST",
            auth: {
              username: process.env.SAUCE_USERNAME,
              password: process.env.SAUCE_ACCESS_KEY
            },
            json: true,
            body: sauceTests // From the above API call
          },
          function(err, response) {
            if (err) {
              console.log("Request failed.");
              cb(err);
            } else if (response.statusCode !== 200) {
              console.log("Sauce API returned an error.");
              cb(response.body); // Use body as error (printed)
            } else if (!response.body.completed) {
              console.log(
                "Sauce API indicated tests not completed. Polling again..."
              );
              // No callback
            } else {
              sauceResults = response.body["js tests"];
              clearInterval(interval);
              cb();
            }
          }
        );
      }, pollInterval);
    },
    function(cb) {
      var allPassed = true;

      // Process and display the test results for each platform
      for (var i = 0; i < sauceResults.length; i++) {
        var platformUrl = sauceResults[i].url;
        var platformName = sauceResults[i].platform.join(":");
        var platformResult = sauceResults[i].result; // The window.global_test_results object

        // Display the platform name and result
        var platformPassed = platformResult.failed === 0;
        if (platformPassed) {
          console.log("       " + platformName + " passed all tests");
        } else {
          console.log(
            "FAILED " +
              platformName +
              " passed " +
              platformResult.passed +
              "/" +
              platformResult.total +
              " tests"
          );
          console.log("       " + platformUrl);

          // Print failed tests
          for (var j = 0; j < platformResult.tests.length; j++) {
            var test = platformResult.tests[j];
            if (!test.result) {
              console.log("         Failing test: " + test.name);
              console.log("         Message: " + test.message);
            }
          }
        }

        // Track whether all platforms passed
        if (!platformPassed) {
          allPassed = false;
        }
      }

      // Return success/failure
      if (allPassed) {
        cb();
      } else {
        cb("One or more platforms failed one or more tests.");
      }
    }
  ],
  function(err) {
    // Perform any cleanup
    async.series(
      [
        function(cb) {
          if (sauceConnectProcess) {
            sauceConnectProcess.close(function() {
              console.log("Sauce Connect proxy stopped.");
              cb();
            });
          } else {
            cb();
          }
        },
        function(cb) {
          if (webserver) {
            webserver.close(function() {
              console.log("Local webserver stopped.");
              cb();
            });
          } else {
            cb();
          }
        }
      ],
      function() {
        // Ignore any cleanup errors

        if (err) {
          console.log("Finished with error:");
          console.log(err);
          process.exit(1); // Return failure
        } else {
          console.log("Tests passed on all platforms.");
          process.exit(0);
        }
      }
    );
  }
);
