/**
 * Default library configuration.
 * @type {Object}
 */
export default {
  connect: false,
  connectTimeoutMs: 10000,
  disconnectTimeoutMs: 10000,
  responseTimeoutMs: 10000,
  connectRetryMs: 5000,
  connectRetryBackoffMs: 5000,
  connectRetryMaxMs: 30000,
  connectRetryMaxAttempts: 0,
  reconnect: true,
  reconnectMax: 5,
  reconnectMaxMs: 30000,
};
