const promise = Promise.resolve();

/**
 * Defers the invocation of a function using the promise microtask queue.
 * Ensures that deferral takes place using the same mechanism as client.action()
 * in environments where promises are partially/fully polyfilled, as opposed to
 * a third-party deferral package like queue-microtask.
 *
 * Errors thrown in the callback are caught as promise rejections and thrown
 * explicitly to avoid suppressing any problems.
 * @param {Function} cb
 * @param {*} arg1
 * @param {*} arg2
 * @param {*} argN
 */
export default function defer(cb, ...args) {
  promise
    .then(() => {
      cb(...args); // Invoke with no arguments (then callback receives undefined)
    })
    .catch(err => {
      setTimeout(() => {
        throw err;
      }, 0);
    });
}
