/**
 * @enum {number}
 */
const ClientState = {
  DISCONNECTED: 0,
  CONNECTING: 1,
  CONNECTED: 2,
  DISCONNECTING: 3,
  ERROR: 4,
};

/**
 * @enum {number}
 */
const FeedState = {
  CLOSED: 10,
  OPENING: 11,
  OPEN: 12,
  CLOSING: 13,
  TERMINATED: 14,
};

export { ClientState, FeedState };
