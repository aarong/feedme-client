import _sortedLastIndexBy from "lodash/sortedLastIndexBy";
import macrotask from "./macrotask";

/**
 * Queue that invokes functions asynchronously in priority order. Ties are
 * resolved using insertion order, unlike heap-based priority queues.
 *
 * When multiple items are rapidly inserted into the queue, only one macrotask
 * is deferred up front. Another macrotask is deferred once the first one runs.
 * If you defer all macrotasks on insertion, then a promise settled in one
 * macrotask will not necessarily run before the next queue macrotasks (in
 * Node < v12 and polyfilled promise environments).
 *
 * @constructor
 */
const TaskQueue = function TaskQueue() {
  /**
   * Prioritized list of invocations to make.
   * Each element is: {priority, fn, args}
   *
   * @memberof TaskQueue
   * @instance
   * @type {Array}
   */
  this._queue = [];

  /**
   * True only if a macrotask has already been deferred.
   * @memberof TaskQueue
   * @instance
   * @type {boolean}
   */
  this._deferred = false;

  /**
   * Bound prototype._execute() function - don't re-bind constantly
   * @memberof TaskQueue
   * @instance
   * @type {Function}
   */
  this._boundExecute = this._execute.bind(this);
};

/**
 * Adds an invocation to the queue.
 * @memberof TaskQueue
 * @instance
 * @param {number} priority
 * @param {Function} fn
 * @param  {...*} args
 */
TaskQueue.prototype.add = function add(priority, fn, ...args) {
  // Binary search
  const insertIdx = _sortedLastIndexBy(
    this._queue,
    { priority },
    (queueItem) => queueItem.priority,
  );
  this._queue.splice(insertIdx, 0, { priority, fn, args });

  // Defer macrotask if there isn't one already
  if (!this._deferred) {
    this._deferred = true;
    macrotask(this._boundExecute);
  }
};

/**
 * Invokes a function in the queue and schedules the next.
 * Tasks can return truthy to run the next task synchronously (if there is one).
 *
 * Try/catch the task. If it throws, then schedule another deferral (if needed)
 * and re-throw the error. The library presumably does not throw, so an error
 * means that there was an invocation on the application.
 * @memberof TaskQueue
 * @instance
 */
TaskQueue.prototype._execute = function _execute() {
  // Run a queue item
  let runAnother;
  let err;
  do {
    const item = this._queue.shift();
    try {
      runAnother = !!item.fn(...item.args);
    } catch (e) {
      err = e;
      runAnother = false;
    }
  } while (runAnother && this._queue.length > 0);

  // Defer another?
  if (this._queue.length > 0) {
    macrotask(this._boundExecute);
  } else {
    this._deferred = false;
  }

  // Throw error?
  if (err) {
    throw err;
  }
};

// Exports

export default TaskQueue;
