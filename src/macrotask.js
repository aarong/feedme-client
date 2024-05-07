/**
 * Common access point for macrotask deferral.
 * @param {Function} fn
 * @param  {...any} args
 */
export default function macrotask(fn, ...args) {
  setImmediate(fn, ...args);
}
