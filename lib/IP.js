/*
#     CloudBoost Flow - Flow-Based Programming for JavaScript
#     (c) 2014 HackerBay, Inc. 
#     CloudBoost Flow may be freely distributed under the Apache 2 License
*/
 class IP {
  // Valid IP types
  static get types() {
    return [
      'data',
      'openBracket',
      'closeBracket'
    ];
  }

  // Detects if an arbitrary value is an IP
  static isIP(obj) {
    return obj && typeof obj === 'object' && obj._isIP === true;
  }

  // Creates as new IP object
  // Valid types: 'data', 'openBracket', 'closeBracket'
  constructor(type, data, options) {
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

  // Creates a new IP copying its contents by value not reference
  clone() {
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
  }

  // Moves an IP to a different owner
  move(owner) {
    this.owner = owner;
  }
  // no-op

  // Frees IP contents
  drop() {
    var key, results, val;
    results = [];
    for (key in this) {
      val = this[key];
      results.push(delete this[key]);
    }
    return results;
  }
};

module.exports = IP;
