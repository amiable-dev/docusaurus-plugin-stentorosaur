// Identity proxy for CSS modules - returns class name as-is
// This allows tests to query by class names like .statusBadge
module.exports = new Proxy(
  {},
  {
    get: function (target, key) {
      if (key === '__esModule') {
        return false;
      }
      return key;
    },
  }
);
