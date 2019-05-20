[![Build Status](https://travis-ci.com/aarong/feedme-client.svg?branch=master)](https://travis-ci.com/aarong/feedme-client)
[![Coverage Status](https://coveralls.io/repos/github/aarong/feedme-client/badge.svg?branch=master)](https://coveralls.io/github/aarong/feedme-client?branch=master)

[![Feedme](https://raw.githubusercontent.com/aarong/feedme-client/master/logo.svg?sanitize=true)](https://feedme.global)

# Feedme Javascript Client

A client library created and maintained as a core part of the
[Feedme](https://feedme.global) project.

Runs in Node and the browser. Exposes a simple but powerful API and handles
unexpected developments appropriately. Well documented and thoroughly tested.

[WebSocket](https://github.com/aarong/feedme-transport-websocket) and
[Socket.io](https://github.com/aarong/feedme-transport-socketio) transports are
maintained as a core part of the project. Both are supported by the
[Feedme Node Server](https://github.com/aarong/feedme-server).

Library contributors and transport developers should see the
[developer documentation](DEV.md).

<!-- TOC depthFrom:2 -->

- [Getting Started](#getting-started)
  - [NPM](#npm)
  - [CDN](#cdn)
- [API](#api)
  - [Client API](#client-api)
    - [Initialization](#initialization)
    - [Client Methods](#client-methods)
    - [Client Events](#client-events)
  - [Feed API](#feed-api)
    - [Feed Objects vs Server Feeds](#feed-objects-vs-server-feeds)
    - [Desired vs Actual State](#desired-vs-actual-state)
    - [Feed Object Methods](#feed-object-methods)
    - [Feed Object Events](#feed-object-events)
- [Sample Code](#sample-code)

<!-- /TOC -->

## Getting Started

### NPM

Install the client:

```shell
npm install feedme-client
```

The client expects the application to provide a transport, through which it will
communicate with the server.

```shell
npm install feedme-client-transport-websocket
# or
npm install feedme-client-transport-socketio
```

To initialize a client using the WebSocket transport:

```javascript
var feedmeClient = require("feedme-client");
var wsTransport = require("feedme-transport-websocket/client");

var client = feedmeClient({
  transport: wsTransport({ url: "https://some.url/api/websocket" })
});
```

To initialize a client using the Socket.io transport:

```javascript
var feedmeClient = require("feedme-client");
var ioTransport = require("feedme-transport-socketio/client");

var client = feedmeClient({
  transport: ioTransport({ url: "https://some.url/api/socketio" })
});
```

Once a client has been initialized the application can listen for events and
connect to the server.

### CDN

The browser bundle can be included in a website as follows:

```html
<script
  type="text/javascript"
  src="https://cdn.jsdelivr.net/npm/feedme-client"
></script>
```

The module is bundled in UMD format and is named `feedmeClient` in the global
scope.

WebSocket and Socket.io transport bundles can be included similarly.

## API

### Client API

#### Initialization

To initialize a client:

```javascript
var client = feedmeClient(options);
```

The client is initialized `disconnected` and will remain `disconnected` until
there is a call to `client.connect()`.

If initialization fails then the factory function will throw an `Error` object
(`err`). The following errors may be thrown:

- `err.message === "INVALID_ARGUMENT: ..."`

  The `options` argument was invalid.

The `options` argument is an object with the following properties:

- `options.transport` - Required object.

  A transport object used to communicate with the server. The object must
  satisfy the requirements laid out in the developer documentation.

  Application code must not operate on the transport object directly and must
  not pass a given transport object to more than one client instance.

  The tranport object must be `disconnected`.

- `options.connectTimeoutMs` - Optional non-negative integer. Defaults to 10000.

  Specifies how long to wait for a Feedme conversation to initiate successfully
  or fail after a call to `client.connect()` and when reconnecting after a
  connection failure. The specified interval covers both the transport
  connection and the handshake.

  If greater than 0, then the client will wait `connectTimeoutMs`. If that
  period elapses and a Feedme conversation has not been successfully
  established, the client will cancel the connection attempt, emit a
  `disconnect` event with a `TIMEOUT` error, and depending on configuration, may
  schedule a connection retry.

  If set to 0, then the client will wait forever for a Feedme conversation to be
  succesfully established.

- `options.connectRetryMs` - Optional integer. Defaults to 5000.

  Specifies how long to wait before attempting another connection after a
  connection attempt fails for the first time. Subsequent retry intervals may be
  backed off as configured below.

  If less then 0, then the client will not make another attempt to establish a
  connection. It is left to the application to call `client.connect()`.

  If set to 0, then the client will immediately make another attempt to
  establish a connection.

  If greater than 0, then the client will wait `connectRetryMs` before making
  another attempt to establish a connection.

  If a connection attempt fails due to a rejected handshake, then the client
  will not automatically reattempt to establish a connection.

- `options.connectRetryBackoffMs` - Optional non-negative integer. Defaults
  to 5000.

  Specifies the amount by which to increase the connection retry interval after
  each failure.

- `options.connectRetryMaxMs` - Optional non-negative integer. Defaults
  to 30000.

  Specifies the maximum interval to wait between connection attempts,
  irrespective of `connectRetryBackoffMs`.

  Must be greater than or equal to `connectRetryMs`.

- `options.connectRetryMaxAttempts` - Optional non-negative integer. Defaults
  to 0.

  Specifies the maximum number of connection retries to attempt. 0 for unlimited
  connection retries.

- `options.actionTimeoutMs` - Optional non-negative integer. Defaults to 10000.

  Specifies how long to wait for a server response to a an action request before
  calling back a timeout error. 0 for no timeout.

- `options.feedTimeoutMs` - Optional non-negative integer. Defaults to 10000.

  Specifies how long to wait for a server response to a a feed open request
  before emitting a timeout error. 0 for no timeout.

- `options.reconnect` - Optional boolean. Defaults to true.

  Specifies behavior when the client disconnects due to a transport problem
  while connected.

  If true, then the client will immediately attempt to reconnect to the server
  when the connection fails. If that connection attempt fails, then the client
  will retry as configured.

  If false, then the client will not attempt to reconnect to the server when the
  connection fails. It is left to the application to call `client.connect()`.

- `options.reopenMaxAttempts` - Optional integer. Defaults to 3.

  Specifies the maximum number of times to reopen a feed when it fails due to a
  bad action revelation (that is, an invalid delta or hash mismatch).

  If set less than zero, then the client will always attempt to reopen feeds
  when there is a bad action revelation.

  If set to 0, then the client will not attempt to reopen a feed when there is a
  bad action revelation. This configuration is not recommended. If there is a
  subsequent disconnect/reconnect or a valid call to `feed.desireOpen()`, then
  the client will attempt to reopen the feed at that time.

  If set greater than 0, then the client will immediately attempt to reopen a
  feed when there is a bad action revelation, provided that there have been
  fewer than `reopenMaxAttempts` tries over the past `reopenTrailingMs`. When at
  the threshold, the client will wait until the number failures over the past
  `reopenTrailingMs` falls back below `reopenMaxAttempts` and then attempt to
  reopen the feed. Counters are reset when the client disconnects.

- `options.reopenTrailingMs` - Optional non-negative integer. Defaults to 60000.

  Specifies the length of the trailing interval over which `reopenMaxAttempts`
  applies.

  If set to 0 then feed failures are counted over the duration of the
  connection.

#### Client Methods

- `client.state()` - Returns string

  Returns the current client state:

  - `"disconnected"` - The client is not connected to the server and is not
    currently attempting to connect. A connection attempt may be scheduled,
    depending on configuration.

  - `"connecting"` - The client is attempting to connect to the server and
    perform a handshake.

  - `"connected"` - The client is connected to the server and has performed a
    successful handshake.

  Errors thrown: None

- `client.connect()` - Returns nothing

  Initiates an attempt to connect to the server and perform a handshake. The
  client state must be `disconnected`.

  Errors thrown:

  - `err.message === "INVALID_STATE: ..."`

    The client state is not `disconnected`.

- `client.disconnect()` - Returns nothing

  Disconnects from the server. The client state must be either `connecting` or
  `connected`.

  Errors thrown:

  - `err.message === "INVALID_STATE: ..."`

    The client state is not `connecting` or `connected`.

- `client.id()` - Returns string

  Returns the client id assigned by the server during the handshake. The client
  state must be `connected`.

  Errors thrown:

  - `err.message === "INVALID_STATE: ..."`

    The client state is not `connected`.

- `client.action(actionName, actionArgs, callback, callbackLate)` - Returns
  nothing

  Invokes an an action on the server. The client state must be `connected`.

  Arguments:

  - `actionName` - Required string. The name of the action being invoked.

  - `actionArgs` - Required object. The action arguments to pass to the server.

  - `callback` - Required function. Invoked when the server responds to the
    action request before it times out, or when the action request times out.

    If the action is executed successfully, the function is invoked as follows:

    ```javascript
    callback(undefined, actionData);
    ```

    ... where `actionData` is the action description returned by the server.

    If the action fails or times out, the function is invoked as follows:

    ```javascript
    callback(err);
    ```

    ... where `err` is an `Error` object.

  - `callbackLate` - Optional function. Invoked when the server responds to an
    action request after it has timed out and when the client disconnects from
    the server after the action request has timed out.

    The function is invoked in the same manner as `callback` with the exception
    that it will never receive a `TIMEOUT` error.

  Errors thrown:

  - `err.message === "INVALID_ARGUMENT: ..."`

    There was a problem with one or more of the supplied arguments.

  - `err.message === "INVALID_STATE: ..."`

    The client state is not `connected`.

  Errors called back:

  - `err.message === "TIMEOUT: ..."`

    The server did not respond within the amount of time specified by
    `options.actionTimeoutMs`.

  - `err.message === "DISCONNECTED: ..."`

    The client disconnected from the server before it received a response. The
    disconnect may have resulted from a call to `client.disconnect()` or due to
    a transport problem.

  - `err.message === "REJECTED: ..."`

    The server rejected the action request.The error details returned by the
    server are available in `err.serverErrorCode` (string) and
    `err.serverErrorData` (object).

- `client.feed(feedName, feedArgs)` - Returns object

  Returns a feed object that can be used to interact with feeds on the server.
  See the [Feed API](#feed-api) section for usage.

  The client need not be `connected` to create feed objects.

  Feed objects are initialized with their desired state set to `closed`.

  Arguments:

  - `feedName` - Required string. The name of the feed to open.

  - `feedArgs` - Required object. The arguments of the feed to open. Must
    contain zero or more string properties.

  Errors thrown:

  - `err.message === "INVALID_ARGUMENT: ..."`

    There was a problem with one or more of the supplied arguments.

#### Client Events

- `connecting`

  Emitted when the client state changes from `disconnected` to `connecting`.

  Listeners are invoked with no arguments.

- `connect`

  Emitted when the client state changes from `connecting` to `connected`.

  Listeners are invoked with no arguments.

- `disconnect`

  Emitted when the client state changes from `connecting` or `connected` to
  `disconnected`, and when the client state is `disconnected` but the reason for
  being disconnected has changed.

  If the disconnect resulted from a call to `client.disconnect()` then listeners
  are invoked with no arguments.

  If the disconnect resulted from an error condition then listeners are passed
  an `Error` object (`err`). The following errors are possible:

  - `err.message === "TIMEOUT: ..."` - The transport failed to connect to the
    server within `options.connectTimeoutMs`. Another connection attempt may be
    scheduled, depending on configuration.

  - `err.message === "HANDSHAKE_REJECTED: ..."` - The transport connected to the
    server but the handshake failed. The client will not reattempt the
    connection automatically.

  - `err.message === "DISCONNECTED: ..."` - The transport connection failed.

- `badServerMessage`

  Emitted when the server has violated the Feedme specification.

  Listeners are passed an `Error` object (`err`). The following errors are
  possible:

  - `err.message === "INVALID_MESSAGE: ..."` - The server transmitted a message
    that was not valid JSON or that violated one of the JSON schemas laid out in
    the specification.

    - `err.serverMessage` (string) contains the server message.

    - `err.parseError` (object) contains the message parsing error.

  - `err.message === "UNEXPECTED_MESSAGE: ..."` - The server transmitted a
    message that was invalid given the state of the conversation.

    - `err.serverMessage` (object) contains the server message.

  - `err.message === "INVALID_DELTA: ..."` - The server transmitted a feed delta
    that was invalid given the state of the feed data.

    - `err.serverMessage` (object) contains the server message.

    - `err.deltaError` (object) contains the error generated by the delta.

  - `err.message === "INVALID_HASH: ..."` - The feed data hash transmitted by
    the server did not match the hash of the post-delta feed data.

    - `err.serverMessage` (object) contains the server message.

- `badClientMessage`

  Emitted when the server indicates that the client has violated the Feedme
  specification. This can indicate a problem on the client or the server.

  Listeners are passed a `diagnostics` object containing any server-specified
  diagnositic information.

- `transportError`

  Emitted when the transport demonstrates behavior that violates the
  requirements laid out in the developer documentation.

  Listeners are passed an `Error` object indicating the nature of the violation.

### Feed API

Feed objects enable interaction with feeds on the server and are created using
`client.feed()`.

#### Feed Objects vs Server Feeds

A distinction must be drawn between _feed objects_ (the Javascript objects
documented here) and _server feeds_ (the concept defined in the Feedme
specification).

When multiple feed objects point to the same server feed (that is, they share
the same feed name-argument combination), the library will try to keep the
server feed open if any of the feed objects has its desired state set to `open`.
If all feed objects are desired `closed`, the library will close the server
feed. The library will emit relevant action revelations only on feed objects
that have their desired state set to `open`.

#### Desired vs Actual State

A distinction must be drawn between the _desired state_ of a feed object and its
_actual state_. The application is free to manipulate the desired state of each
feed object according to its needs, while the actual state is also influenced by
factors like connectivity and authorization.

The desired state of a feed object may be `open` or `closed`. It is controlled
using `feed.desireOpen()` and `feed.desireClosed()` and retrieved using
`feed.desiredState()`.

The actual state of a feed object can be `opening`, `open`, or `closed`. It is
retrieved using `feed.state()`. Changes in a feed object's actual state can be
monitored by listening for `opening`, `open`, and `close` events.

When a feed object's desired state is `closed`, its actual state is always
`closed`. When a feed object's desired state is `open`, its actual state may be
`opening`, `open`, or `closed`, with the latter reflecting an error condition.

When a feed object's actual state is `open`, the feed data is available using
`feed.data()` and the feed object will emit `action` events when the server
reveals actions on the feed.

#### Feed Object Methods

- `feed.desireOpen()` - Returns nothing

  Sets the feed object's desired state to `open`.

  A feed object's desired state persists through the connection cycle. If a feed
  is desired `open` and the client disconnects and reconnects, the library will
  attempt to reopen the server feed.

  Errors thrown:

  - `err.message === "INVALID_FEED_STATE: ..."`

    The feed object's desired state is already `open`.

  - `err.message === "DESTROYED: ..."`

    The feed object has been destroyed.

- `feed.desireClosed()` - Returns nothing

  Sets the feed object's desired state to `closed`.

  Errors thrown:

  - `err.message === "INVALID_FEED_STATE: ..."`

    The feed object's desired state is already `closed`.

  - `err.message === "DESTROYED: ..."`

    The feed object has been destroyed.

- `feed.desiredState()` - Returns string

  Returns the desired state of the feed object, either `"closed"` or `"open"`.

  Errors thrown:

  - `err.message === "DESTROYED: ..."`

    The feed object has been destroyed.

- `feed.state()` - Returns string

  Returns the actual state of the feed object, either `"closed"`, `"opening"`,
  or `"open"`. If a feed object is desired `closed` then the actual state will
  always be `closed`.

  Errors thrown:

  - `err.message === "DESTROYED: ..."`

    The feed object has been destroyed.

- `feed.data()` - Returns object

  Returns an object containing the current feed data. The structure of the
  object is determined by the server.

  Errors thrown:

  - `err.message === "INVALID_FEED_STATE: ..."`

    The feed object's actual state is not `open`.

  - `err.message === "DESTROYED: ..."`

    The feed object has been destroyed.

- `feed.client()` - Returns object

  Returns a reference to the client instance that created the feed object.

  Errors thrown:

  - `err.message === "DESTROYED: ..."`

    The feed object has been destroyed.

- `feed.destroy()` - Returns nothing

  Destroys the feed object so that it may be safely disposed of.

  Errors thrown:

  - `err.message === "INVALID_FEED_STATE: ..."`

    Only feed objects desired closed can be destroyed.

  - `err.message === "DESTROYED: ..."`

    The feed object has already been destroyed.

#### Feed Object Events

- `opening`

  Emitted when the actual feed object state changes from `closed` to `opening`.

  No arguments are passed to the listeners.

- `open`

  Emitted when the actual feed object state changes from `opening` to `open`.

  No arguments are passed to the listeners.

- `close`

  Emitted when the actual state of the feed object changes from `opening` or
  `open` to `closed`, and when the error condition has changed since an earlier
  `close` event was emitted (for example, when feed access is denied by the
  server and then the client disconnects from the server, or when the feed is
  desired closed and then desired open but the client is not connected to the
  server).

  If the event was triggered by a call to `feed.desireClosed()` then no
  arguments are passed to the listeners.

  If the event was triggered by an error condition, then the listeners are
  passed an `Error` object (`err`) as an argument. The following errors are
  possible:

  - `err.message === "TIMEOUT: ..."`

    The attempt to open the feed on the server timed out. If the client receives
    a post-timeout result from the server, then the feed object will emit as
    appropriate.

  - `err.message === "REJECTED: ..."`

    The server rejected the client's request to open the feed. The error details
    returned by the server are available in `err.serverErrorCode` (string) and
    `err.serverErrorData` (object).

    The client will reattempt to open the server feed if it
    disconnects/reconnects, or if a feed object associated with the feed
    receives a valid call to `feed.desireOpen()`.

  - `err.message === "DISCONNECTED: ..."`

    The client is not connected to the server. If a connection is later
    established, the feed object will emit as appropriate.

  - `err.message === "TERMINATED: ..."`

    The server terminated the client's access to the feed. The error details
    returned by the server are available in `err.serverErrorCode` (string) and
    `err.serverErrorData` (object).

    The client will attempt to reopen the feed if it disconnects/reconnects, or
    if a feed object associated with the feed receives a valid call to
    `feed.desireOpen()`.

  - `err.message === "BAD_ACTION_REVELATION: ..."`

    The server transmitted an action revelation with an invalid delta operation
    or a non-matching feed data hash.

    The client will attempt to reopen the feed as configured.

- `action`

  Emitted when the server reveals an action on the feed, provided that the feed
  object is desired `open`.

  Arguments passed to the listeners:

  1. `actionName` (string)

     The name of the action.

  2. `actionData` (object)

     The data transmitted by the server describing the action.

  3. `newFeedData` (object)

     The feed data after applying any updates associated with the action.

  4. `oldFeedData` (object)

     The feed data before applying any updates associated with the action.

- `action:<name>`

  Emitted when the server reveals an action on the feed, provided that the feed
  is desired `open`. Allows the application to listen for specific types of
  actions.

  Arguments passed to the listeners:

  1. `actionData` (object)

     The data returned by the server describing the action.

  2. `newFeedData` (object)

     The feed data after applying any updates associated with the action.

  3. `oldFeedData` (object)

     The feed data before applying any updates associated with the action.

## Sample Code

The following code initializes a client with the WebSocket transport, creates a
feed object, connects to the server, reporting results to the console.

```javascript
var feedmeClient = require("feedme-client");
var wsTransport = require("feedme-transport-websocket/client");

// Initialize the client
var client = feedmeClient({
  transport: wsTransport({ url: "https://some.url/api/websocket" })
});

// Create a feed object
var feed = client.feed(
  "SomeFeed",
  { SomeArgument: "SomeValue" }
);
feed.on("opening", function () {
  console.log("Opening feed...");
});
feed.on("open", function () {
  console.log("Feed is now open. The feed data is:", feed.data());
});
feed.on("action", function (actionName, actionData, newFeedData, oldFeedData) {
  console.log("Observed an action on the feed:", actionName);
});
feed.on("close", function (err) {
  console.log("Feed closed with error", err);
});
feed.desireOpen();

// Listen for client events
client.on("connecting", function () {
  console.log("Connecting to the server...");
});
client.on("connect", function () {

  console.log("Connected.");

  // Perform an action
  client.action(
    "SomeAction",
    { SomeArgument: "SomeValue" },
    function (err, actionData) {
      if (err) {
        console.log("The action failed with error:", err);
      } else {
        console.log("The action succeeded with data:", actionData);
      }
    }
  });

});
client.on("disconnect", function (err) {
  console.log("Disconnected from the server with error:", err);
});

// Connect to the server
client.connect();
```
