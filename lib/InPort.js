/*
#     CloudBoost Flow - Flow-Based Programming for JavaScript
#     (c) 2014 HackerBay, Inc. 
#     CloudBoost Flow may be freely distributed under the Apache 2 License
*/
//
// Input Port (inport) implementation for Flow components
let BasePort = require('./BasePort');
let IP = require('./IP');
let platform = require('./Platform');

class InPort extends BasePort {
  constructor(options, process) {
    super(options)
    this.process = null;
    if (!process && typeof options === 'function') {
      process = options;
      options = {};
    }
    if (options == null) {
      options = {};
    }
    if (options.buffered == null) {
      options.buffered = false;
    }
    if (options.control == null) {
      options.control = false;
    }
    if (options.triggering == null) {
      options.triggering = true;
    }
    if (!process && options && options.process) {
      process = options.process;
      delete options.process;
    }
    if (process) {
      platform.deprecated('InPort process callback is deprecated. Please use Process API or the InPort handle option');
      if (typeof process !== 'function') {
        throw new Error('process must be a function');
      }
      this.process = process;
    }
    if (options.handle) {
      if (typeof options.handle !== 'function') {
        throw new Error('handle must be a function');
      }
      this.handle = options.handle;
      delete options.handle;
    }
    InPort.__super__.constructor.call(this, options);
    this.prepareBuffer();
  }

  // Assign a delegate for retrieving data should this inPort
  attachSocket(socket, localId = null) {
    if (localId == null) {
        localId = null;
      }
    if (this.hasDefault()) {
      if (this.handle) {
        socket.setDataDelegate((function(_this) {
          return function() {
            return new IP('data', _this.options["default"]);
          };
        })(this));
      } else {
        socket.setDataDelegate((function(_this) {
          return function() {
            return _this.options["default"];
          };
        })(this));
      }
    }
    socket.on('connect', (function(_this) {
      return function() {
        return _this.handleSocketEvent('connect', socket, localId);
      };
    })(this));
    socket.on('begingroup', (function(_this) {
      return function(group) {
        return _this.handleSocketEvent('begingroup', group, localId);
      };
    })(this));
    socket.on('data', (function(_this) {
      return function(data) {
        _this.validateData(data);
        return _this.handleSocketEvent('data', data, localId);
      };
    })(this));
    socket.on('endgroup', (function(_this) {
      return function(group) {
        return _this.handleSocketEvent('endgroup', group, localId);
      };
    })(this));
    socket.on('disconnect', (function(_this) {
      return function() {
        return _this.handleSocketEvent('disconnect', socket, localId);
      };
    })(this));
    return socket.on('ip', (function(_this) {
      return function(ip) {
        return _this.handleIP(ip, localId);
      };
    })(this));
  }

  handleIP(ip, id) {
    var buf;
      if (this.process) {
        return;
      }
      if (this.options.control && ip.type !== 'data') {
        return;
      }
      ip.owner = this.nodeInstance;
      ip.index = id;
      if (ip.scope != null) {
        if (!(ip.scope in this.scopedBuffer)) {
          this.scopedBuffer[ip.scope] = [];
        }
        buf = this.scopedBuffer[ip.scope];
      } else {
        buf = this.buffer;
      }
      buf.push(ip);
      if (this.options.control && buf.length > 1) {
        buf.shift();
      }
      if (this.handle) {
        this.handle(ip, this.nodeInstance);
      }
      return this.emit('ip', ip, id);
  }

  handleSocketEvent(event, payload, id) {
   if (this.isBuffered()) {
        this.buffer.push({
          event: event,
          payload: payload,
          id: id
        });
        if (this.isAddressable()) {
          if (this.process) {
            this.process(event, id, this.nodeInstance);
          }
          this.emit(event, id);
        } else {
          if (this.process) {
            this.process(event, this.nodeInstance);
          }
          this.emit(event);
        }
        return;
      }
      if (this.process) {
        if (this.isAddressable()) {
          this.process(event, payload, id, this.nodeInstance);
        } else {
          this.process(event, payload, this.nodeInstance);
        }
      }
      if (this.isAddressable()) {
        return this.emit(event, payload, id);
      }
      return this.emit(event, payload);
  }

  hasDefault() {
    return this.options["default"] !== void 0;
  }

  prepareBuffer() {
    this.buffer = [];
    return this.scopedBuffer = {};
  }

  validateData(data) {
    if (!this.options.values) {
        return;
      }
      if (this.options.values.indexOf(data) === -1) {
        throw new Error("Invalid data='" + data + "' received, not in [" + this.options.values + "]");
      }
  }

  // Returns the next packet in the (legacy) buffer
  receive() {
    platform.deprecated('InPort.receive is deprecated. Use InPort.get instead');
      if (!this.isBuffered()) {
        throw new Error('Receive is only possible on buffered ports');
      }
      return this.buffer.shift();
  }

  // Returns the number of data packets in a (legacy) buffered inport
  contains() {
    platform.deprecated('InPort.contains is deprecated. Use InPort.has instead');
      if (!this.isBuffered()) {
        throw new Error('Contains query is only possible on buffered ports');
      }
      return this.buffer.filter(function(packet) {
        if (packet.event === 'data') {
          return true;
        }
      }).length;
  }

  getBuffer(scope) {
      var buf;
      if (scope != null) {
        if (!(scope in this.scopedBuffer)) {
          return void 0;
        }
        buf = this.scopedBuffer[scope];
      } else {
        buf = this.buffer;
      }
      return buf;
  }
  // Fetches a packet from the port
  get(scope) {
      var buf;
      buf = this.getBuffer(scope);
      if (this.options.control) {
        return buf[buf.length - 1];
      } else {
        return buf.shift();
      }
  }

  // Returns true if port contains packet(s) matching the validator
  has(scope, validate) {
    var buf, i, len, packet;
      buf = this.getBuffer(scope);
      if (!(buf != null ? buf.length : void 0)) {
        return false;
      }
      for (i = 0, len = buf.length; i < len; i++) {
        packet = buf[i];
        if (validate(packet)) {
          return true;
        }
      }
      return false;
  }

  // Returns the number of data packets in an inport
  length(scope) {
    var buf;
      buf = this.getBuffer(scope);
      if (!buf) {
        return 0;
      }
      return buf.length;
  }

  // Tells if buffer has packets or not
  ready(scope) {
    return this.length(scope) > 0;
  }
}

module.exports = InPort;
