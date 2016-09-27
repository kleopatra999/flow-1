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

    if (!type)
      type = 'data';
    if (!data)
      data = null;
    if (!options)
      options = {};

    this.type = type;
    this.data = data;
    this._isIP = true;
    this.scope = null; // sync scope id
    this.owner = null; // packet owner process
    this.clonable = false; // cloning safety flag
    this.index = null; // addressable port index
    for (let key in options) {
      let val = options[key];
      this[key] = val;
    }
  }

  // Creates a new IP copying its contents by value not reference
  clone() {
    let ip = new IP(this.type);
    for (let key in this) {
      let val = this[key];
      if (['owner'].indexOf(key) !== -1) { continue; }
      if (val === null) { continue; }
      if (typeof (val) === 'object') {
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
    return (() => {
      let result = [];
      for (let key in this) {
        let val = this[key];
        result.push(delete this[key]);
      }
      return result;
    })();
  }
};

module.exports = IP;
