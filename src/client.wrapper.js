import check from "check-types";
import emitter from "component-emitter";
import queueMicrotask from "queue-microtask";

const clientWrapperProto = emitter({});
const feedWrapperProto = emitter({});

export default function clientWrapperFactory(clientSync) {
  // Check object being wrapped
  if (!check.object(clientSync)) {
    throw new Error("INVALID_ARGUMENT: Argument must be an object.");
  }

  const clientWrapper = Object.create(clientWrapperProto);
  clientWrapper._clientSync = clientSync;

  // Defer and queue events
  const evts = [
    "connecting",
    "connect",
    "disconnect",
    "badServerMessage",
    "badClientMessage",
    "transportError"
  ];
  evts.forEach(evt => {
    clientWrapper._clientSync.on(evt, (...args) => {
      queueMicrotask(() => {
        clientWrapper.emit(evt, ...args);
      });
    });
  });

  return clientWrapper;
}

// Route synchronous public client methods
["state", "connect", "disconnect", "id"].forEach(method => {
  clientWrapperProto[method] = function callMethod(...args) {
    return this._clientSync[method](...args);
  };
});

// Route client.action(), defer response, and overlay promise API
clientWrapperProto.action = function action(...args) {
  // Get arguments
  const actionName = args.length > 0 ? args[0] : undefined;
  const actionArgs = args.length > 1 ? args[1] : undefined;
  const callback = args.length > 2 ? args[2] : undefined;

  // Validate the callback if present (function always passed to wrapped object)
  if (args.length >= 3 && !check.function(callback)) {
    throw new Error("INVALID_ARGUMENT: Invalid callback.");
  }

  let promise;
  let resolve;
  let reject;

  if (callback) {
    // Callback responses must be deferred explicitly as microtasks
    promise = undefined;
    resolve = actionData => {
      queueMicrotask(() => {
        callback(undefined, actionData);
      });
    };
    reject = err => {
      queueMicrotask(() => {
        callback(err);
      });
    };
  } else {
    // Promise responses are deferred implicitly as microtasks
    promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
  }

  // Call action - errors cascade for both callback and promise usage
  this._clientSync.action(actionName, actionArgs, (err, actionData) => {
    if (err) {
      reject(err);
    } else {
      resolve(actionData);
    }
  });

  // Return promise/undefined
  return promise;
};

// Route client.feed() and wrap the resulting object
clientWrapperProto.feed = function feed(...args) {
  const feedWrapper = Object.create(feedWrapperProto);
  feedWrapper._feedSync = this._clientSync.feed(...args);

  // Defer and queue events
  const evts = ["opening", "open", "close", "action"];
  evts.forEach(evt => {
    feedWrapper._feedSync.on(evt, (...eargs) => {
      queueMicrotask(() => {
        feedWrapper.emit(evt, ...eargs);
      });
    });
  });

  return feedWrapper;
};

// Route synchronous public feed methods
[
  "desireOpen",
  "desireClosed",
  "desiredState",
  "state",
  "data",
  "destroy"
].forEach(method => {
  feedWrapperProto[method] = function callMethod(...args) {
    return this._feedSync[method](...args);
  };
});
