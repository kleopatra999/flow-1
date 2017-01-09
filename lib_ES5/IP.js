(function() {
  var IP;

  module.exports = IP = (function() {
    IP.types = ['data', 'openBracket', 'closeBracket'];

    IP.isIP = function(obj) {
      return obj && typeof obj === 'object' && obj._isIP === true;
    };

    function IP(type, data, options) {
      var key, val;
      this.type = type != null ? type : 'data';
      this.data = data != null ? data : null;
      if (options == null) {
        options = {};
      }
      this._isIP = true;
      this.scope = null;
      this.owner = null;
      this.clonable = false;
      this.index = null;
      for (key in options) {
        val = options[key];
        this[key] = val;
      }
    }

    IP.prototype.clone = function() {
      var ip, key, val;
      ip = new IP(this.type);
      for (key in this) {
        val = this[key];
        if (['owner'].indexOf(key) !== -1) {
          continue;
        }
        if (val === null) {
          continue;
        }
        if (typeof val === 'object') {
          ip[key] = JSON.parse(JSON.stringify(val));
        } else {
          ip[key] = val;
        }
      }
      return ip;
    };

    IP.prototype.move = function(owner) {
      this.owner = owner;
    };

    IP.prototype.drop = function() {
      var key, results, val;
      results = [];
      for (key in this) {
        val = this[key];
        results.push(delete this[key]);
      }
      return results;
    };

    return IP;

  })();

}).call(this);
