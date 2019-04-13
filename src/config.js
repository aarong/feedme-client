/**
 * Hard-coded configuration.
 * @memberof client
 * @static
 */
export default {
  defaults: {
    connectTimeoutMs: 10000,
    connectRetryMs: 5000,
    connectRetryBackoffMs: 5000,
    connectRetryMaxMs: 30000,
    connectRetryMaxAttempts: 0,
    actionTimeoutMs: 10000,
    feedTimeoutMs: 10000,
    reconnect: true,
    reopenMaxAttempts: 3,
    reopenTrailingMs: 60000
  }
};
