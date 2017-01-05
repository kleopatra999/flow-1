(function() {
  var EventEmitter, Port, platform,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  EventEmitter = require('events').EventEmitter;

  platform = require('./Platform');

  Port = (function(superClass) {
    extend(Port, superClass);

    Port.prototype.description = '';

    Port.prototype.required = true;

    function Port(type) {
      this.type = type;
      platform.deprecated('noflo.Port is deprecated. Please port to noflo.InPort/noflo.OutPort');
      if (!this.type) {
        this.type = 'all';
      }
      if (this.type === 'integer') {
        this.type = 'int';
      }
      this.sockets = [];
      this.from = null;
      this.node = null;
      this.name = null;
    }

    Port.prototype.getId = function() {
      if (!(this.node && this.name)) {
        return 'Port';
      }
      return this.node + " " + (this.name.toUpperCase());
    };

    Port.prototype.getDataType = function() {
      return this.type;
    };

    Port.prototype.getDescription = function() {
      return this.description;
    };

    Port.prototype.attach = function(socket) {
      this.sockets.push(socket);
      return this.attachSocket(socket);
    };

    Port.prototype.attachSocket = function(socket, localId) {
      if (localId == null) {
        localId = null;
      }
      this.emit("attach", socket, localId);
      this.from = socket.from;
      if (socket.setMaxListeners) {
        socket.setMaxListeners(0);
      }
      socket.on("connect", (function(_this) {
        return function() {
          return _this.emit("connect", socket, localId);
        };
      })(this));
      socket.on("begingroup", (function(_this) {
        return function(group) {
          return _this.emit("begingroup", group, localId);
        };
      })(this));
      socket.on("data", (function(_this) {
        return function(data) {
          return _this.emit("data", data, localId);
        };
      })(this));
      socket.on("endgroup", (function(_this) {
        return function(group) {
          return _this.emit("endgroup", group, localId);
        };
      })(this));
      return socket.on("disconnect", (function(_this) {
        return function() {
          return _this.emit("disconnect", socket, localId);
        };
      })(this));
    };

    Port.prototype.connect = function() {
      var i, len, ref, results, socket;
      if (this.sockets.length === 0) {
        throw new Error((this.getId()) + ": No connections available");
      }
      ref = this.sockets;
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        socket = ref[i];
        results.push(socket.connect());
      }
      return results;
    };

    Port.prototype.beginGroup = function(group) {
      if (this.sockets.length === 0) {
        throw new Error((this.getId()) + ": No connections available");
      }
      return this.sockets.forEach(function(socket) {
        if (socket.isConnected()) {
          return socket.beginGroup(group);
        }
        socket.once('connect', function() {
          return socket.beginGroup(group);
        });
        return socket.connect();
      });
    };

    Port.prototype.send = function(data) {
      if (this.sockets.length === 0) {
        throw new Error((this.getId()) + ": No connections available");
      }
      return this.sockets.forEach(function(socket) {
        if (socket.isConnected()) {
          return socket.send(data);
        }
        socket.once('connect', function() {
          return socket.send(data);
        });
        return socket.connect();
      });
    };

    Port.prototype.endGroup = function() {
      var i, len, ref, results, socket;
      if (this.sockets.length === 0) {
        throw new Error((this.getId()) + ": No connections available");
      }
      ref = this.sockets;
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        socket = ref[i];
        results.push(socket.endGroup());
      }
      return results;
    };

    Port.prototype.disconnect = function() {
      var i, len, ref, results, socket;
      if (this.sockets.length === 0) {
        throw new Error((this.getId()) + ": No connections available");
      }
      ref = this.sockets;
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        socket = ref[i];
        results.push(socket.disconnect());
      }
      return results;
    };

    Port.prototype.detach = function(socket) {
      var index;
      if (this.sockets.length === 0) {
        return;
      }
      if (!socket) {
        socket = this.sockets[0];
      }
      index = this.sockets.indexOf(socket);
      if (index === -1) {
        return;
      }
      if (this.isAddressable()) {
        this.sockets[index] = void 0;
        this.emit('detach', socket, index);
        return;
      }
      this.sockets.splice(index, 1);
      return this.emit("detach", socket);
    };

    Port.prototype.isConnected = function() {
      var connected;
      connected = false;
      this.sockets.forEach((function(_this) {
        return function(socket) {
          if (socket.isConnected()) {
            return connected = true;
          }
        };
      })(this));
      return connected;
    };

    Port.prototype.isAddressable = function() {
      return false;
    };

    Port.prototype.isRequired = function() {
      return this.required;
    };

    Port.prototype.isAttached = function() {
      if (this.sockets.length > 0) {
        return true;
      }
      return false;
    };

    Port.prototype.listAttached = function() {
      var attached, i, idx, len, ref, socket;
      attached = [];
      ref = this.sockets;
      for (idx = i = 0, len = ref.length; i < len; idx = ++i) {
        socket = ref[idx];
        if (!socket) {
          continue;
        }
        attached.push(idx);
      }
      return attached;
    };

    Port.prototype.canAttach = function() {
      return true;
    };

    return Port;

  })(EventEmitter);

  exports.Port = Port;

}).call(this);
