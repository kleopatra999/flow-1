(function() {
  var ArrayPort, platform, port,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  port = require("./Port");

  platform = require('./Platform');

  ArrayPort = (function(superClass) {
    extend(ArrayPort, superClass);

    function ArrayPort(type) {
      this.type = type;
      platform.deprecated('noflo.ArrayPort is deprecated. Please port to noflo.InPort/noflo.OutPort and use addressable: true');
      ArrayPort.__super__.constructor.call(this, this.type);
    }

    ArrayPort.prototype.attach = function(socket, socketId) {
      if (socketId == null) {
        socketId = null;
      }
      if (socketId === null) {
        socketId = this.sockets.length;
      }
      this.sockets[socketId] = socket;
      return this.attachSocket(socket, socketId);
    };

    ArrayPort.prototype.connect = function(socketId) {
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

    ArrayPort.prototype.beginGroup = function(group, socketId) {
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

    ArrayPort.prototype.send = function(data, socketId) {
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

    ArrayPort.prototype.endGroup = function(socketId) {
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

    ArrayPort.prototype.disconnect = function(socketId) {
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

    ArrayPort.prototype.isConnected = function(socketId) {
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

    ArrayPort.prototype.isAddressable = function() {
      return true;
    };

    ArrayPort.prototype.isAttached = function(socketId) {
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

    return ArrayPort;

  })(port.Port);

  exports.ArrayPort = ArrayPort;

}).call(this);
