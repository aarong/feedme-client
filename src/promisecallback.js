/**
 * Used to enable both callback and promise usage of a given function.
 *
 * Accepts an app-specified callback and returns:
 *
 * 1 - A promise to be returned to the app - undefined if callback is present
 *
 * 2 - An innerCallback that the library can use to report results to the app
 *     When innerCallback receives a callback-style invocation, it either
 *     invokes the app callback or settles the above promise, as appropriate
 *
 * @param {?Function} outerCallback App-supplied callback argument
 */
const promiseCallback = function promiseCallback(appCallback) {
  let promise; // undefined
  let innerCallback;

  if (appCallback) {
    innerCallback = appCallback;
  } else {
    let resolve;
    let reject;
    promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    innerCallback = (err, arg) => {
      if (err) {
        reject(err);
      } else {
        resolve(arg);
      }
    };
  }

  return { promise, innerCallback };
};

export default promiseCallback;
