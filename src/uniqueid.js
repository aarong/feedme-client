import _uniqueId from "lodash/uniqueId";

/**
 * Generate string ids that are unique module-wide.
 * @returns {string}
 */
const uniqueId = function uniqueId() {
  return _uniqueId();
};

export default uniqueId;
