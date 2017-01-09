(function() {
  var EventEmitter, IP, InternalSocket,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  EventEmitter = require('events').EventEmitter;

  IP = require('./IP');

  InternalSocket = (function(superClass) {
    extend(InternalSocket, superClass);

    InternalSocket.prototype.regularEmitEvent = function(event, data) {
      return this.emit(event, data);
    };

    InternalSocket.prototype.debugEmitEvent = function(event, data) {
      var error, error1;
      try {
        return this.emit(event, data);
      } catch (error1) {
        error = error1;
        if (error.id && error.metadata && error.error) {
          if (this.listeners('error').length === 0) {
            throw error.error;
          }
          this.emit('error', error);
          return;
        }
        if (this.listeners('error').length === 0) {
          throw error;
        }
        return this.emit('error', {
          id: this.to.process.id,
          error: error,
          metadata: this.metadata
        });
      }
    };

    function InternalSocket(metadata) {
      this.metadata = metadata != null ? metadata : {};
      this.brackets = [];
      this.connected = false;
      this.dataDelegate = null;
      this.debug = false;
      this.emitEvent = this.regularEmitEvent;
    }

    InternalSocket.prototype.connect = function() {
      this.connected = true;
      return this.emitEvent('connect', null);
    };

    InternalSocket.prototype.disconnect = function() {
      this.connected = false;
      return this.emitEvent('disconnect', null);
    };

    InternalSocket.prototype.isConnected = function() {
      return this.connected;
    };

    InternalSocket.prototype.send = function(data) {
      if (data === void 0 && typeof this.dataDelegate === 'function') {
        data = this.dataDelegate();
      }
      return this.handleSocketEvent('data', data);
    };

    InternalSocket.prototype.post = function(ip, autoDisconnect) {
      if (autoDisconnect == null) {
        autoDisconnect = true;
      }
      if (ip === void 0 && typeof this.dataDelegate === 'function') {
        ip = this.dataDelegate();
      }
      if (!this.isConnected() && this.brackets.length === 0) {
        this.connected = true;
        this.emitEvent('connect', null);
      }
      this.handleSocketEvent('ip', ip, false);
      if (autoDisconnect && this.isConnected() && this.brackets.length === 0) {
        this.connected = false;
        return this.emitEvent('disconnect', null);
      }
    };

    InternalSocket.prototype.beginGroup = function(group) {
      return this.handleSocketEvent('begingroup', group);
    };

    InternalSocket.prototype.endGroup = function() {
      return this.handleSocketEvent('endgroup');
    };

    InternalSocket.prototype.setDataDelegate = function(delegate) {
      if (typeof delegate !== 'function') {
        throw Error('A data delegate must be a function.');
      }
      return this.dataDelegate = delegate;
    };

    InternalSocket.prototype.setDebug = function(active) {
      this.debug = active;
      return this.emitEvent = this.debug ? this.debugEmitEvent : this.regularEmitEvent;
    };

    InternalSocket.prototype.getId = function() {
      var fromStr, toStr;
      fromStr = function(from) {
        return from.process.id + "() " + (from.port.toUpperCase());
      };
      toStr = function(to) {
        return (to.port.toUpperCase()) + " " + to.process.id + "()";
      };
      if (!(this.from || this.to)) {
        return "UNDEFINED";
      }
      if (this.from && !this.to) {
        return (fromStr(this.from)) + " -> ANON";
      }
      if (!this.from) {
        return "DATA -> " + (toStr(this.to));
      }
      return (fromStr(this.from)) + " -> " + (toStr(this.to));
    };

    InternalSocket.prototype.legacyToIp = function(event, payload) {
      if (IP.isIP(payload)) {
        return payload;
      }
      switch (event) {
        case 'begingroup':
          return new IP('openBracket', payload);
        case 'endgroup':
          return new IP('closeBracket');
        case 'data':
          return new IP('data', payload);
        default:
          return null;
      }
    };

    InternalSocket.prototype.ipToLegacy = function(ip) {
      var legacy;
      switch (ip.type) {
        case 'openBracket':
          return legacy = {
            event: 'begingroup',
            payload: ip.data
          };
        case 'data':
          return legacy = {
            event: 'data',
            payload: ip.data
          };
        case 'closeBracket':
          return legacy = {
            event: 'endgroup',
            payload: ip.data
          };
      }
    };

    InternalSocket.prototype.handleSocketEvent = function(event, payload, autoConnect) {
      var ip, isIP, legacy;
      if (autoConnect == null) {
        autoConnect = true;
      }
      isIP = event === 'ip' && IP.isIP(payload);
      ip = isIP ? payload : this.legacyToIp(event, payload);
      if (!ip) {
        return;
      }
      if (!this.isConnected() && autoConnect && this.brackets.length === 0) {
        this.connect();
      }
      if (event === 'begingroup') {
        this.brackets.push(payload);
      }
      if (isIP && ip.type === 'openBracket') {
        this.brackets.push(ip.data);
      }
      if (event === 'endgroup') {
        if (this.brackets.length === 0) {
          return;
        }
        ip.data = this.brackets.pop();
        payload = ip.data;
      }
      if (isIP && payload.type === 'closeBracket') {
        if (this.brackets.length === 0) {
          return;
        }
        this.brackets.pop();
      }
      this.emitEvent('ip', ip);
      if (!(ip && ip.type)) {
        return;
      }
      if (isIP) {
        legacy = this.ipToLegacy(ip);
        event = legacy.event;
        payload = legacy.payload;
      }
      if (event === 'connect') {
        this.connected = true;
      }
      if (event === 'disconnect') {
        this.connected = false;
      }
      return this.emitEvent(event, payload);
    };

    return InternalSocket;

  })(EventEmitter);

  exports.InternalSocket = InternalSocket;

  exports.createSocket = function() {
    return new InternalSocket;
  };

}).call(this);
