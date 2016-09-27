/*
#     CloudBoost Flow - Flow-Based Programming for JavaScript
#     (c) 2014 HackerBay, Inc. 
#     CloudBoost Flow may be freely distributed under the Apache 2 License
*/
//
// Output Port (outport) implementation for Flow components
let BasePort =  require('./BasePort');
let IP = require('./IP');

class OutPort extends BasePort {
  constructor(options) {
    this.cache = {};
    super(options);
  }

  attach(socket, index = null) {
    super.attach(socket, index);
    if (this.isCaching() && (this.cache[index] != null)) {
      return this.send(this.cache[index], index);
    }
  }

  connect(socketId = null) {
    let sockets = this.getSockets(socketId);
    this.checkRequired(sockets);
    return (() => {
      let result = [];
      for (let i = 0; i < sockets.length; i++) {
        let socket = sockets[i];
        if (!socket) { continue; }
        result.push(socket.connect());
      }
      return result;
    })();
  }

  beginGroup(group, socketId = null) {
    let sockets = this.getSockets(socketId);
    this.checkRequired(sockets);
    return sockets.forEach(function(socket) {
      if (!socket) { return; }
      return socket.beginGroup(group);
    });
  }

  send(data, socketId = null) {
    let sockets = this.getSockets(socketId);
    this.checkRequired(sockets);
    if (this.isCaching() && data !== this.cache[socketId]) {
      this.cache[socketId] = data;
    }
    return sockets.forEach(function(socket) {
      if (!socket) { return; }
      return socket.send(data);
    });
  }

  endGroup(socketId = null) {
    let sockets = this.getSockets(socketId);
    this.checkRequired(sockets);
    return (() => {
      let result = [];
      for (let i = 0; i < sockets.length; i++) {
        let socket = sockets[i];
        if (!socket) { continue; }
        result.push(socket.endGroup());
      }
      return result;
    })();
  }

  disconnect(socketId = null) {
    let sockets = this.getSockets(socketId);
    this.checkRequired(sockets);
    return (() => {
      let result = [];
      for (let i = 0; i < sockets.length; i++) {
        let socket = sockets[i];
        if (!socket) { continue; }
        result.push(socket.disconnect());
      }
      return result;
    })();
  }

  sendIP(type, data, options, socketId, autoConnect = true) {
    if (IP.isIP(type)) {
      var ip = type;
      socketId = ip.index;
    } else {
      var ip = new IP(type, data, options);
    }
    let sockets = this.getSockets(socketId);
    this.checkRequired(sockets);
    if (this.isCaching() && data !== __guard__(this.cache[socketId], x => x.data)) {
      this.cache[socketId] = ip;
    }
    let pristine = true;
    for (let i = 0; i < sockets.length; i++) {
      let socket = sockets[i];
      if (!socket) { continue; }
      if (pristine) {
        socket.post(ip, autoConnect);
        pristine = false;
      } else {
        if (ip.clonable) { var ip = ip.clone(); }
        socket.post(ip, autoConnect);
      }
    }
    return this;
  }

  openBracket(data = null, options = {}, socketId = null) {
    return this.sendIP('openBracket', data, options, socketId);
  }

  data(data, options = {}, socketId = null) {
    return this.sendIP('data', data, options, socketId);
  }

  closeBracket(data = null, options = {}, socketId = null) {
    return this.sendIP('closeBracket', data, options, socketId);
  }

  checkRequired(sockets) {
    if (sockets.length === 0 && this.isRequired()) {
      throw new Error(`${this.getId()}: No connections available`);
    }
  }

  getSockets(socketId) {
    // Addressable sockets affect only one connection at time
    if (this.isAddressable()) {
      if (socketId === null) { throw new Error(`${this.getId()} Socket ID required`); }
      if (!this.sockets[socketId]) { return []; }
      return [this.sockets[socketId]];
    }
    // Regular sockets affect all outbound connections
    return this.sockets;
  }

  isCaching() {
    if (this.options.caching) { return true; }
    return false;
  }
}

module.exports = OutPort;

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}