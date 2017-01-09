(function() {
  var isBrowser;

  isBrowser = require('../Platform').isBrowser;

  if (isBrowser()) {
    module.exports = require('./ComponentIo');
  } else {
    module.exports = require('./NodeJs');
  }

}).call(this);
