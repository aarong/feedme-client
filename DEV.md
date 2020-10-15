# Information for Library Developers

This documentation is for developers of the Feedme client library itself.

<!-- TOC depthFrom:2 -->

- [Getting Started](#getting-started)
- [Directory Structure](#directory-structure)
- [Source Code](#source-code)
  - [Source Files](#source-files)
- [Target Node and NPM Versions](#target-node-and-npm-versions)
- [NPM Scripts](#npm-scripts)
- [Committing and Deploying](#committing-and-deploying)
- [Contributions](#contributions)
- [Transport API](#transport-api)
  - [Fundamentals](#fundamentals)
  - [Transport Events](#transport-events)
  - [Transport Methods](#transport-methods)

<!-- /TOC -->

## Getting Started

Clone the repo, install dependencies, and build the package:

```shell
git clone https://github.com/aarong/feedme-client
cd feedme-client
npm install
npm run build
```

The build procedure runs unit tests on the `src` folder, assembles a transpiled
and publish-ready NPM package in the `build` folder (including a Node module and
a browser bundle), and runs functional tests on the built Node module.

To enable debugging output set the `debug` environment variable to
`feedme-client*`.

## Directory Structure

- `build/`

  Created by `npm run build`. Contains files ready to be deployed as an NPM
  package. Includes an entrypoint for Node (`index.js`) and a UMD module for
  browsers (`bundle.js` has no sourcemaps and is used by applications, while
  `bundle.withmaps.js` has sourcemaps and is used for testing and debugging).

  LICENSE, README.md, and package.json are included.

  (Gulp/Webpack)

- `coverage/`

  Created by `npm run coverage`. Coverage information is for unit tests only.

  (Jest)

- `docs/`

  Created by `npm run docs`. Source code documentation.

  (Documentation.js)

- `src/`

  Module source code.

  - `src/main.node.js` Entrypoint for transpiling the Node NPM package, which
    includes `source-map-support`.

  - `src/main.browser.js` Entrypoint for transpiling the browser bundle. No
    special functionality.

  - `src/main.js` Common entrypoint to the module for Node and the browser.

  - `src/__tests__` Unit tests (Jest).

- `tests/`

  Functional tests for the Node and and browser builds.

  Functional tests are written for Jasmine, as Jest can not run in the browser.

  - `tests/tests.js` The functional tests, run against Node and browser builds.

  - `tests/tests.node.js` Runs tests in Node.

  - `tests/tests.browsers.js` Runs tests in the browser.

  - `tests/webroot`

    A hosting root to run functional tests on Sauce. Derived from
    Jasmine-standalone.

## Source Code

Source code is written in ES6 and is transpiled on build for Node and the
browser.

Eslint enforces Airbnb style and applies Prettier, which takes precence over
some Airbnb rules. A lint check is performed before unit tests.

Errors are thrown, called back, and emitted in the form
`new Error("ERROR_CODE: Some more descriptive text.")`. Altering the `name`
property of an error object breaks sourcemaps in the browser.

### Source Files

- `transport.wrapper.js` ensures that the transport object behaves as required
  and that tranport events are always deferred.

- `session.sync.js` contains server-facing functionality. It enables a
  straightforward compliant conversation with the server and invokes callbacks
  and event handlers synchronously.

- `session.wrapper.js` adds a deferral layer on top of `session.sync.js` so that
  event handlers and callbacks are always invoked asynchronously.

- `client.sync.js` contains app-facing functionality. It provides an enhanced
  experience over `session.js` with configurability and feed objects, and
  invokes callbacks and event handlers synchronously.

- `client.wrapper.js` adds a deferral layer on top of `client.sync.js` so that
  event handlers and callbacks are always invoked asynchronously. Also adds a
  promise API over `client.action()`.

- `config.js` contains hard-coded configuration, mainly default options.

- `main.js` is the common entrypoint for the module. It takes a transport object
  from the outside and returns a usable client.

- `main.node.js` is the entrypoint for Node module transpilation. It injects
  `source-map-support`.

- `main.browser.js` is the entrypoint for browser transpilation. No special
  functionality.

- `defer.js` provides a common deferral mechanism for the three wrapper objects.

## Target Node and NPM Versions

The intention is to support Node and NPM back as far as realistically possible.

For a development install, the binding dependency constraint is that Webpack and
babel-loader require Node 8+. Also, package-lock.json is only supported by NPM
5+, which comes with Node 8+. So develop and build on Node 8+ and NPM 5+.

Although the library needs to be developed and built on Node 8+, its production
dependencies are more lenient and can be run on Node 6+, which is verified on
the Travis build.

## NPM Scripts

- `npm run docs` Generates source code documentation in `docs`.

- `npm run lint-src` Checks for linting errors in `src`.

- `npm run lint-build-tests` Checks for linting errors in `tests`.

- `npm run coverage` Displays Jest unit test coverage.

- `npm run coveralls` Used by Travis to pass coverage information to Coveralls.

- `npm run test-src` Runs linting and Jest unit tests on the source code.
  Aliased by `npm run test`. (Jest)

- `npm run build` Runs the unit tests, builds a publishable NPM package in
  `build`, and runs the Node functional tests on the build. Browser tests must
  be run explicitly.

- `npm run test-build-node` Runs functional tests against the Node module in the
  `build` folder. (Jasmine)

- `npm run test-build-browsers -- <mode>` Runs functional tests against the
  browser bundle in the `build` folder. The tests are built using Jasmine, which
  supports both Node and the browser (though sourcemaps only work in Node).

  Modes:

  - `local` Launches a local webserver with the browser tests, which can then be
    accessed manually from a browser.

  - `sauce-live` Launches a local webserver with the browser tests and loads
    Sauce Connect the proxy. You can then log in to Sauce and run the browser
    tests live via the Sauce Connect tunnel. Useful for viewing console output.

  - `sauce-automatic` (Default) Launches a local server with the browser tests,
    loads the Sauce Connect proxy, instructs the Sauce REST API to run automated
    tests across the widest possible set of platforms, and reports results.
    Requires the environmental variables `SAUCE_USERNAME` and
    `SAUCE_ACCESS_KEY`, otherwise the Sauce Connect proxy will fail. Runs on
    each Travis build.

  - `sauce-automatic-hanging` Many Sauce browser-platform combinations run the
    tests successfully but, frustratingly, do not actually return success. This
    option runs tests on those combinations, which can then be verified manually
    on the Sauce website. Requires Sauce credentials in environmental variables.

## Committing and Deploying

Commits to the master branch on Github are built and tested by Travis CI. If the
NPM package version has been incremented, then Travis will deploy by publishing
the build to NPM.

## Contributions

Contributors can fork the repo, make changes, and submit a pull request.

Significant new features should be developed in feature branches.

```shell
# Fork and clone the repo locally
git checkout -b my-new-feature
# Make changes
git commit -m "Added my new feature."
git push origin my-new-feature
# Submit a pull request
```

## Transport API

Transport objects abstract away the specifics of the messaging connection
between the client and the server. A transport object is injected into the
client library at initialization.

Transport objects must implement the following interface and behavior in order
to function correctly with the library. The library aims to detect invalid
behavior and throws an `Error` with `err.message === "TRANSPORT_ERROR: ..."` if
the transport behaves unexpectedly. If the transport has thrown an unexpected
error, then it is exposed as `err.transportError`.

See the
[Feedme WebSocket Transport](https://github.com/aarong/feedme-transport-ws) for
a working example.

### Fundamentals

Transport objects are always in one of three states: `disconnected`,
`connecting`, or `connected`. Once connected, transport objects must be able to
exchange string messages with the server. Messages must be received by the other
side in the order that they were sent.

Transport objects must be traditional Javascript event emitters. They must
implement `transport.on(eventName, eventHandler)` and must emit events to
subscribed handlers as described below.

Connection timeout functionality is controlled by the library and transports
should generally not implement their own. If a transport fails to establish a
connection to the server within the amount of time configured by the
application, then the library will instruct the transport to abort its
connection attempt and will inform the application that the connection attempt
timed out.

Connection retry functionality is controlled by the library and must not be
implemented by transports. If a transport's attempt to connect to a server
fails, it must indicate to the library that it has failed and take no further
action. The library may instruct the transport to initiate a subsequent
connection attempt depending on the number of failed attempts and the
configuration supplied by the application.

Reconnect functionality is controlled by the library and must not be implemented
by transports. If a transport is connected to the server and disconnects due to
a failure of its internal communication mechanism, then the library may instruct
the transport to attempt to reconnect to the server depending on the
configuration supplied by the application.

### Transport Events

The library attaches event handlers to the following transport events:

- `connecting`

  Used to inform the library that the transport state changed from
  `disconnected` to `connecting`.

- `connect`

  Used to inform the library that the transport state changed from `connecting`
  to `connected`.

- `message(msg)`

  Used to inform the library that a string message `msg` has been received from
  the server.

- `disconnect([err])`

  Used to inform the library that the transport state changed from `connecting`
  or `connected` to `disconnected`.

  When the transport emits a `disconnect` event due to a library call to
  `transport.disconnect(err)`, the transport must pass the `err` argument
  supplied by the library as an event argument. If the library calls
  `transport.disconnect()` without an `err` argument, then the transport must
  emit the `disconnect` event with no arguments.

  When the transport emits a `disconnect` event because its connection to the
  server has failed, it must emit the event with an argument of the form
  `Error("FAILURE: Transport-specific error message")`. The transport is free to
  attach additional diagnostic information to the error object.

Transport objects must sequence their event emissions as follows:

- After library initialization, the transport must not emit any events until the
  library calls `transport.connect()`.

- When the library calls `transport.connect()`, the transport must emit a
  `connecting` event.

- A `connecting` event must be followed by a `connect` event or a `disconnect`
  event.

- A `connect` event must be followed by a `message` event or a `disconnect`
  event.

- A `message` event must be followed by another `message` event or a
  `disconnect` event.

- A `disconnect` event must not be followed by any further events until the
  library has called `transport.connect()`.

When the library invokes a transport method, the transport must emit any
resulting events asynchronously using a mechanism like `process.nextTick()` or
`setTimeout()`.

### Transport Methods

Transport objects must implement the following methods:

- `transport.state()` - Returns `string`

  Used by the library to determine the current transport state, and thus the set
  of operations that the library is permitted to perform on the transport. The
  transport must permit the library to call this method at any time and must
  return `"disconnected"`, `"connecting"`, or `"connected"`.

  - `disconnected`

    Indicates that the transport is not connected to the server and is not
    attempting to connect.

    If `transport.state()` returns `disconnected`, then the transport must
    accept a synchronous library call to `transport.connect()`.

    Transport objects must be supplied to the library in a `disconnected` state
    when the library is initialized.

    When `disconnected`, transport objects must remain `disconnected` until the
    library calls `transport.connect()`.

  - `connecting`

    Indicates that the transport is attempting to connect to the server but
    cannot yet transmit or receive messages.

    If `transport.state()` returns `connecting`, then the transport must accept
    a synchronous library call to `transport.disconnect()`.

  - `connected`

    Indicates that the transport can transmit messages to the server and that it
    will emit any messages that it receives from the server.

    If `transport.state()` returns `connected`, then the transport must accept a
    synchronous library call to `transport.send()` or `transport.disconnect()`.

  The `transport.state()` return value must change only as described in the
  requirements for `transport.connect()`, `transport.send()`, and
  `transport.disconnect()`.

- `transport.connect()` - Returns `undefined`

  Used by the library to instruct the transport to connect to the server. The
  library calls this method only after ensuring that `transport.state()` is
  `disconnected`.

  If the transport connection attempt fails synchronously within the call to
  `transport.connect()`, then `transport.state()` must return `disconnected`
  when the method exits and the transport must asynchronously emit `connecting`
  and then `disconnect(Error("FAILURE: ..."))`. The call to
  `transport.connect()` must exit successfully.

  If the transport is able to establish a connection to the server synchronously
  within the call to `transport.connect()`, then `transport.state()` must return
  `connected` when the method exits and the transport must asynchronously emit
  `connecting` and then `connect`. The call to `transport.connect()` must exit
  successfully.

  If the transport is not able to synchronously determine whether the connection
  to the server has succeeded, then `transport.state()` must return `connecting`
  when the method exits and the transport must asynchronously emit `connecting`.
  The call to `transport.connect()` must exit successfully. Subsequently:

  - If the transport connection attempt fails before the library calls
    `transport.disconnect()`, then the state reported by `transport.state()`
    must become `disconnected` and the transport must then emit
    `disconnect(Error("FAILURE: ..."))`.

  - If the transport connection attempt succeeds before the library calls
    `transport.disconnect()`, then the state reported by `transport.state()`
    must become `connected` and the transport must then emit `connect`.
    Subsequently, if the transport's connection to the server fails before the
    library calls `transport.disconnect()`, then the state reported by
    `transport.state()` must become `disconnected` and the transport must then
    emit `disconnect(Error("FAILURE: ..."))`.

- `transport.send(msg)` - Returns `undefined`

  Used by the library to instruct the transport to send a string message `msg`
  to the server. The library calls this method only after verifying that the
  state reported by `transport.state()` is `connected`.

  If the transmission attempt fails synchronously within the call to
  `transport.send()` then `transport.state()` must return `disconnected` when
  the method exits and the transport must asynchronously emit
  `disconnect(Error("FAILURE: ..."))`. The call to `transport.send()` must exit
  successfully.

  If the transmission attempt does not fail synchronously within the call to
  `transport.send()` then `transport.state()` must return `connected` when the
  method exits and the call to `transport.send()` must exit successfully.

- `transport.disconnect([err])` - Returns `undefined`

  Used by the library to instruct the transport to disconnect from the server.
  The library calls this method only after verifying that the state reported by
  `transport.state()` is `connecting` or `connected`.

  The state reported by `transport.state()` must be `disconnected` after the
  method exits and the transport must asynchronously emit `disconnect([err])`.
  If the library supplied an `err` argument then the transport must emit the
  `disconnect` event with that argument. If the library did not supply an `err`
  argument then the transport must emit the `disconnect` event with no
  arguments. The call to `transport.disconnect([err])` must exit successfully.
