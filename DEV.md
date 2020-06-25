# Information for Library Developers

This documentation is for developers of the Feedme client library itself.

<!-- TOC depthFrom:2 -->

- [Getting Started](#getting-started)
- [Directory Structure](#directory-structure)
- [Source Modules](#source-modules)
  - [Source Files](#source-files)
- [Target Node and NPM Versions](#target-node-and-npm-versions)
- [NPM Scripts](#npm-scripts)
- [Development and Deployment Workflow](#development-and-deployment-workflow)
- [Transport API](#transport-api)
  - [Fundamentals](#fundamentals)
  - [Transport States](#transport-states)
  - [Transport Methods](#transport-methods)
  - [Transport Events](#transport-events)

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
and publish-ready NPM package in the `build` folder (including a Node module
and a browser bundle), and runs funtional tests on the built Node module.

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

  - `src/main.browser.js` Entrypoint for transpiling the browser bundle.

  - `src/main.js` Common entrypoint to the module for Node and the browser.

  - `src/__tests__` Unit tests (Jest).

- `tests/`

  Functional tests for the Node and and browser builds.
  
  Functional tests are written for Jasmine, as Jest can not run in the browser.

  - `tests/tests.js` The functional tests.

  - `tests/tests.node.js` Runs tests in Node.

  - `tests/tests.browsers.js` Runs tests in targetted browsers using Sauce Labs.

  - `tests/webroot`

    A hosting root to run functional tests on Sauce. Derived from
    Jasmine-standalone.

## Source Modules

Module source code is written in ES6 and is transpiled on build for Node and the
browser.

Eslint enforces Airbnb style and applies Prettier (which takes precence over
some Airbnb rules). A lint check is performed before unit tests.

Errors are thrown, called back, and emitted in the form
`new Error("ERROR_CODE: Some more descriptive text.")`. Altering the `name`
property of an error object breaks sourcemaps in the browser.

### Source Files

- `session.js` contains server-facing functionality. It enables a
  straightforward compliant conversation with the server.

- `client.js` contains app-facing functionality. It provides an enhanced
  experience over `session.js` with configurability and feed objects.

- `feed.js` contains app-facing feed object functionality. Generally routes
  function calls to `client.js`.

- `config.js` contains hard-coded configuration, mainly default options.

- `main.js` is the common entrypoint for the module. It takes a transport object
  from the outside, injects it into a session, injects that into a client, and
  returns the client.

- `main.node.js` is the entrypoint for Node module transpilation. It injects
  `source-map-support`.

- `main.browser.js` is the entrypoint for browser transpilation. No special
  functionality.

- `messageparser.js` checks the validity of incoming server messages.

- `transportwrapper.js` ensures that the transport object behaves as required.

## Target Node and NPM Versions

The intention is to support Node and NPM back as far as realistically possible.

For a development install, the binding dependency constraint is that Eslint
requires Node 6+, but package-lock.json is only supported by NPM 5+, which comes
with Node 8+. Develop on Node 8+ and NPM 5+ to ensure that the repo has
package-lock.json, and rely on Travis to test on Node 6. The Node 6 build is
published to NPM, as it should be compatible with later versions of Node.

Since production installs run code transpiled for Node 6, there is no guarantee
that they will support earlier versions of Node even though there are far fewer
dependency-related version constraints.

## NPM Scripts

- `npm run docs` Generate source code documentation in `docs`.

- `npm run lint-src` Check for linting errors in `src`.

- `npm run lint-build-tests` Check for linting errors in `tests`.

- `npm run coverage` Display Jest unit test coverage.

- `npm run coveralls` Used by Travis to pass coverage information to Coveralls.

- `npm run test-src` Run linting and Jest unit tests on the source code. Aliased
  by `npm run test`. (Jest)

- `npm run build` Run the unit tests, build a publishable NPM package in
  `build`, and run the Node functional tests on the build. Browser tests must be
  run explicitly, given the need for Sauce credentials.

- `npm run test-build-node` Run functional tests against the Node module in the
  `build` folder. (Jasmine)

- `npm run test-build-browsers` Run functional tests against the browser bundle
  in the `build` folder on Sauce Labs. Requires the environmental variables
  `SAUCE_USERNAME` and `SAUCE_ACCESS_KEY`, otherwise the Sauce Connect proxy
  will fail. (Jasmine)

## Development and Deployment Workflow

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

Commits to the master branch are built and tested by Travis CI. If the NPM
package version has been incremented, then Travis will deploy by publishing the
build to NPM.

## Transport API

Transport objects abstract away the specifics of the messaging connection
between the client and the server. A transport object is injected into the
client at initialization.

Transport objects must implement the following interface and behavior in order
to function correctly with the client. The client object interacts with
transports through a wrapper that aims to detect invalid behavior and emits a
client `transportError` event if the transport does something unexpected.

### Fundamentals

Transport objects must be able to exchange `string` messages across a
client-server connection. Messages must be received by the other side in the
order that they were sent.

Transport objects must be traditional Javascript event emitters. Specifically,
they must implement `transport.on(eventName, eventListenerFunction)` and emit
events to subscribed listeners as described below.

Connection and messaging timeout functionality is implemented at the client
level, so transports should not implement their own (they should be patient).

### Transport States

Transport objects must always be in one of three states:

- `disconnected` - The transport is not connected to the server and is not
  attempting to connect.

- `connecting` - The transport is attempting to connect to the server but is not
  ready to transmit messages.

- `connected` - The transport can transmit messages to the server and will emit
  any messages that it receives from the server.

Transport objects must only change state in the following circumstances:

1. When `disconnected` and an outside call to `transport.connect()` is received,
   the transport state must become `connecting`.

2. When `connecting` and a successful connection is established, the transport
   state must become `connected`.

3. When `connecting` and a connection could not be established, the transport
   state must become `disconnected`.

4. When `connecting` or `connected` and a call to `transport.disconnect()` is
   received, the transport state must become `disconnected`.

5. When `connected` and an unexpected connection failure occurs, the transport
   state must become `disconnected`. The transport must not automatically
   attempt to reconnect, as reconnection behavior is controlled by the client.

### Transport Methods

Transport objects must implement the following methods:

- `transport.state()`

  Allows the client library to retrieve the current transport state.

  Returns `"disconnected"`, `"connecting"`, or `"connected"`.

- `transport.connect()`

  Allows the client library to tell the transport to try to connect to the
  server.

  The transport state must synchronously become `connecting` and the
  `connecting` event must be emitted asynchronously.

  The transport must subsequently emit either `connect` or `disconnect` as
  appropriate.

  The library will not call this method unless the transport state is
  `disconnected`.

  If a synchronous connection error occurs, the transport must asynchronously
  emit `connecting` and `disconnect(err)`. It must not throw an error.

- `transport.send(msg)`

  Allows the client library to send a `string` message to the server.

  The library will not call this method unless the transport state is
  `connected`.

  If a synchronous transmission error occurs, the transport must asynchronously
  emit `disconnect(err)`. It must not throw an error.

- `transport.disconnect([err])`

  Allows the client library to tell the transport to disconnect from the server.

  The transport state must synchronously become `disconnected` and the
  `disconnect` event must be emitted asynchronously.

  If an `err` argument is present, then the `disconnect` event must be emitted
  with `err` as an argument. If an `err` argument is not present, then the
  `disconnect` event must be emitted with no arguments.

  The library will not call this method unless the transport state is
  `connecting` or `connected`.

### Transport Events

Transport objects must emit an event when they change state and when a message
has been received from the server.

- `connecting`

  Informs the library that the transport state is now `connecting`. This event
  must only be emitted when the transport state was previously `disconnected`.

- `connect`

  Informs the library that the transport state is now `connected`. This event
  must only be emitted when the transport state was previously `connecting`.

- `message(msg)`

  Informs the library that a `string` message has been received from the server.
  This event must only be emitted when the transport state is `connected`.

- `disconnect([err])`

  Informs the library that the transport state is now `disconnected`. This event
  must only be emitted when the transport state was previously `connecting` or
  `connected`.

  If the disconnect resulted from a library call to `transport.disconnect()`
  with no error argument then the transport must not pass an error object the
  event listeners. The transport must not pass `null`, `undefined`, `false`, or
  any other value in place of the error object.

  If the event resulted from a library call to `transport.disconnect(err)`
  including an `err` argument, then `err` must be passed to the listeners.

  If the event resulted from a connection failure internal to the transport,
  either during the initial connection attempt or subsequently, then an error of
  the form `new Error("FAILURE: Descriptive error message.")` must be must be
  passed to the listeners.
