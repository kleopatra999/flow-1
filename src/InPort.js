//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2014-2016 TheGrid (Rituwall Inc.)
//     NoFlo may be freely distributed under the MIT license
//
// Input Port (inport) implementation for NoFlo components
import BasePort from './BasePort';
import IP from './IP';
import platform from './Platform';

class InPort extends BasePort {
  constructor(options, process) {
    this.process = null;

    if (!process && typeof options === 'function') {
      process = options;
      options = {};
    }

    if (typeof options === 'undefined' || options === null) { options = {}; }

    if (options.buffered == null) { options.buffered = false; }
    if (options.control == null) { options.control = false; }
    if (options.triggering == null) { options.triggering = true; }

    if (!process && options && options.process) {
      ({ process } = options);
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

    super(options);

    this.prepareBuffer();
  }

  // Assign a delegate for retrieving data should this inPort
  attachSocket(socket, localId = null) {
    // have a default value.
    if (this.hasDefault()) {
      if (this.handle) {
        socket.setDataDelegate(() => new IP('data', this.options.default));
      } else {
        socket.setDataDelegate(() => this.options.default);
      }
    }

    socket.on('connect', () => {
      return this.handleSocketEvent('connect', socket, localId);
    }
    );
    socket.on('begingroup', group => {
      return this.handleSocketEvent('begingroup', group, localId);
    }
    );
    socket.on('data', data => {
      this.validateData(data);
      return this.handleSocketEvent('data', data, localId);
    }
    );
    socket.on('endgroup', group => {
      return this.handleSocketEvent('endgroup', group, localId);
    }
    );
    socket.on('disconnect', () => {
      return this.handleSocketEvent('disconnect', socket, localId);
    }
    );
    return socket.on('ip', ip => {
      return this.handleIP(ip, localId);
    }
    );
  }

  handleIP(ip, id) {
    if (this.process) { return; }
    if (this.options.control && ip.type !== 'data') { return; }
    ip.owner = this.nodeInstance;
    ip.index = id;

    if (ip.scope != null) {
      if (!(ip.scope in this.scopedBuffer)) { this.scopedBuffer[ip.scope] = []; }
      var buf = this.scopedBuffer[ip.scope];
    } else {
      var buf = this.buffer;
    }
    buf.push(ip);
    if (this.options.control && buf.length > 1) { buf.shift(); }

    if (this.handle) {
      this.handle(ip, this.nodeInstance);
    }

    return this.emit('ip', ip, id);
  }

  handleSocketEvent(event, payload, id) {
    // Handle buffering the old way
    if (this.isBuffered()) {
      this.buffer.push({
        event,
        payload,
        id
      });

      // Notify receiver
      if (this.isAddressable()) {
        if (this.process) { this.process(event, id, this.nodeInstance); }
        this.emit(event, id);
      } else {
        if (this.process) { this.process(event, this.nodeInstance); }
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

    // Emit port event
    if (this.isAddressable()) { return this.emit(event, payload, id); }
    return this.emit(event, payload);
  }

  hasDefault() {
    return this.options.default !== undefined;
  }

  prepareBuffer() {
    this.buffer = [];
    return this.scopedBuffer = {};
  }

  validateData(data) {
    if (!this.options.values) { return; }
    if (this.options.values.indexOf(data) === -1) {
      throw new Error(`Invalid data='${data}' received, not in [${this.options.values}]`);
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
    return this.buffer.filter(function(packet) { if (packet.event === 'data') { return true; } }).length;
  }

  // Fetches a packet from the port
  get(scope) {
    if (scope != null) {
      if (!(scope in this.scopedBuffer)) { return undefined; }
      var buf = this.scopedBuffer[scope];
    } else {
      var buf = this.buffer;
    }
    return this.options.control ? buf[buf.length - 1] : buf.shift();
  }

  // Returns true if port contains packet(s) matching the validator
  has(scope, validate) {
    if (scope != null) {
      if (!(scope in this.scopedBuffer)) { return false; }
      var buf = this.scopedBuffer[scope];
    } else {
      if (!this.buffer.length) { return false; }
      var buf = this.buffer;
    }
    for (let i = 0; i < buf.length; i++) {
      let packet = buf[i];
      if (validate(packet)) { return true; }
    }
    return false;
  }

  // Returns the number of data packets in an inport
  length(scope) {
    if (scope != null) {
      if (!(scope in this.scopedBuffer)) { return 0; }
      return this.scopedBuffer[scope].length;
    }
    return this.buffer.length;
  }

  // Tells if buffer has packets or not
  ready(scope) {
    return this.length(scope) > 0;
  }
}

export default InPort;