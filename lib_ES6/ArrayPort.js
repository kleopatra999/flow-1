/*
#     CloudBoost Flow - Flow-Based Programming for JavaScript
#     (c) 2014 HackerBay, Inc. 
#     CloudBoost Flow may be freely distributed under the Apache 2 License
*/

const port = require("./Port");
const platform = require('./Platform');

class ArrayPort extends port.Port{

  constructor(type) {
    super(type)
    this.type = type;
    platform.deprecated('noflo.ArrayPort is deprecated. Please port to noflo.InPort/noflo.OutPort and use addressable: true');
  }

  attach(socket, socketId) {
    if (socketId == null) {
      socketId = null;
    }
    if (socketId === null) {
      socketId = this.sockets.length;
    }
    this.sockets[socketId] = socket;
    return this.attachSocket(socket, socketId);
  };

  connect(socketId) {
    if (socketId == null) {
      socketId = null;
    }
    if (socketId === null) {
      if (!this.sockets.length) {
        throw new Error((this.getId()) + ": No connections available");
      }
      this.sockets.forEach(function(socket) {
        if (!socket) {
          return;
        }
        return socket.connect();
      });
      return;
    }
    if (!this.sockets[socketId]) {
      throw new Error((this.getId()) + ": No connection '" + socketId + "' available");
    }
    return this.sockets[socketId].connect();
  };

  beginGroup(group, socketId) {
    if (socketId == null) {
      socketId = null;
    }
    if (socketId === null) {
      if (!this.sockets.length) {
        throw new Error((this.getId()) + ": No connections available");
      }
      this.sockets.forEach((function(_this) {
        return function(socket, index) {
          if (!socket) {
            return;
          }
          return _this.beginGroup(group, index);
        };
      })(this));
      return;
    }
    if (!this.sockets[socketId]) {
      throw new Error((this.getId()) + ": No connection '" + socketId + "' available");
    }
    if (this.isConnected(socketId)) {
      return this.sockets[socketId].beginGroup(group);
    }
    this.sockets[socketId].once("connect", (function(_this) {
      return function() {
        return _this.sockets[socketId].beginGroup(group);
      };
    })(this));
    return this.sockets[socketId].connect();
  };

  send(data, socketId) {
    if (socketId == null) {
      socketId = null;
    }
    if (socketId === null) {
      if (!this.sockets.length) {
        throw new Error((this.getId()) + ": No connections available");
      }
      this.sockets.forEach((function(_this) {
        return function(socket, index) {
          if (!socket) {
            return;
          }
          return _this.send(data, index);
        };
      })(this));
      return;
    }
    if (!this.sockets[socketId]) {
      throw new Error((this.getId()) + ": No connection '" + socketId + "' available");
    }
    if (this.isConnected(socketId)) {
      return this.sockets[socketId].send(data);
    }
    this.sockets[socketId].once("connect", (function(_this) {
      return function() {
        return _this.sockets[socketId].send(data);
      };
    })(this));
    return this.sockets[socketId].connect();
  };

  endGroup(socketId) {
    if (socketId == null) {
      socketId = null;
    }
    if (socketId === null) {
      if (!this.sockets.length) {
        throw new Error((this.getId()) + ": No connections available");
      }
      this.sockets.forEach((function(_this) {
        return function(socket, index) {
          if (!socket) {
            return;
          }
          return _this.endGroup(index);
        };
      })(this));
      return;
    }
    if (!this.sockets[socketId]) {
      throw new Error((this.getId()) + ": No connection '" + socketId + "' available");
    }
    return this.sockets[socketId].endGroup();
  };

  disconnect(socketId) {
    var i, len, ref, socket;
    if (socketId == null) {
      socketId = null;
    }
    if (socketId === null) {
      if (!this.sockets.length) {
        throw new Error((this.getId()) + ": No connections available");
      }
      ref = this.sockets;
      for (i = 0, len = ref.length; i < len; i++) {
        socket = ref[i];
        if (!socket) {
          return;
        }
        socket.disconnect();
      }
      return;
    }
    if (!this.sockets[socketId]) {
      return;
    }
    return this.sockets[socketId].disconnect();
  };

  isConnected(socketId) {
    var connected;
    if (socketId == null) {
      socketId = null;
    }
    if (socketId === null) {
      connected = false;
      this.sockets.forEach((function(_this) {
        return function(socket) {
          if (!socket) {
            return;
          }
          if (socket.isConnected()) {
            return connected = true;
          }
        };
      })(this));
      return connected;
    }
    if (!this.sockets[socketId]) {
      return false;
    }
    return this.sockets[socketId].isConnected();
  };

  isAddressable() {
    return true;
  };

  isAttached(socketId) {
    var i, len, ref, socket;
    if (socketId === void 0) {
      ref = this.sockets;
      for (i = 0, len = ref.length; i < len; i++) {
        socket = ref[i];
        if (socket) {
          return true;
        }
      }
      return false;
    }
    if (this.sockets[socketId]) {
      return true;
    }
    return false;
  };

};

module.exports.ArrayPort = ArrayPort;
