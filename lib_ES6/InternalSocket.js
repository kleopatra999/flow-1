/*
#     CloudBoost Flow - Flow-Based Programming for JavaScript
#     (c) 2014 HackerBay, Inc. 
#     CloudBoost Flow may be freely distributed under the Apache 2 License
*/
let { EventEmitter } = require('events');
let IP = require('./IP');

// ## Internal Sockets
//
// The default communications mechanism between Flow processes is
// an _internal socket_, which is responsible for accepting information
// packets sent from processes' outports, and emitting corresponding
// events so that the packets can be caught to the inport of the
// connected process.
class InternalSocket extends EventEmitter {
  regularEmitEvent(event, data) {
    return this.emit(event, data);
  }

  debugEmitEvent(event, data) {
    try {
      return this.emit(event, data);
    } catch (error) {
      if (error.id && error.metadata && error.error) {
        // Wrapped debuggable error coming from downstream, no need to wrap
        if (this.listeners('error').length === 0) { throw error.error; }
        this.emit('error', error);
        return;
      }

      if (this.listeners('error').length === 0) { throw error; }

      return this.emit('error', {
        id: this.to.process.id,
        error,
        metadata: this.metadata
      }
      );
    }
  }

  constructor(metadata) {
    super()
    if(!metadata)
      metadata = {};
    this.metadata = metadata;
    this.brackets = [];
    this.connected = false;
    this.dataDelegate = null;
    this.debug = false;
    this.emitEvent = this.regularEmitEvent;
  }

  // ## Socket connections
  //
  // Sockets that are attached to the ports of processes may be
  // either connected or disconnected. The semantical meaning of
  // a connection is that the outport is in the process of sending
  // data. Disconnecting means an end of transmission.
  //
  // This can be used for example to signal the beginning and end
  // of information packets resulting from the reading of a single
  // file or a database query.
  //
  // Example, disconnecting when a file has been completely read:
  //
  //     readBuffer: (fd, position, size, buffer) ->
  //       fs.read fd, buffer, 0, buffer.length, position, (err, bytes, buffer) =>
  //         # Send data. The first send will also connect if not
  //         # already connected.
  //         @outPorts.out.send buffer.slice 0, bytes
  //         position += buffer.length
  //
  //         # Disconnect when the file has been completely read
  //         return @outPorts.out.disconnect() if position >= size
  //
  //         # Otherwise, call same method recursively
  //         @readBuffer fd, position, size, buffer
  connect() {
    this.connected = true;
    return this.handleSocketEvent('connect', null, false);
  }

  disconnect() {
    this.connected = false;
    return this.handleSocketEvent('disconnect', null, false);
  }

  isConnected() { return this.connected; }

  // ## Sending information packets
  //
  // The _send_ method is used by a processe's outport to
  // send information packets. The actual packet contents are
  // not defined by Flow, and may be any valid JavaScript data
  // structure.
  //
  // The packet contents however should be such that may be safely
  // serialized or deserialized via JSON. This way the Flow networks
  // can be constructed with more flexibility, as file buffers or
  // message queues can be used as additional packet relay mechanisms.
  send(data) {
    if (data === undefined && typeof this.dataDelegate === 'function') { data = this.dataDelegate(); }
    return this.handleSocketEvent('data', data);
  }

  // ## Sending information packets without open bracket
  //
  // As _connect_ event is considered as open bracket, it needs to be followed
  // by a _disconnect_ event or a closing bracket. In the new simplified
  // sending semantics single IP objects can be sent without open/close brackets.
  post(ip, autoDisconnect = true) {
    if (ip === undefined && typeof this.dataDelegate === 'function') { ip = this.dataDelegate(); }
    // Send legacy connect/disconnect if needed
    if (!this.isConnected() && this.brackets.length === 0) {
      this.connected = true;
      this.emitEvent('connect', null);
    }
    this.handleSocketEvent('ip', ip, false);
    if (autoDisconnect && this.isConnected() && this.brackets.length === 0) {
      this.connected = false;
      return this.emitEvent('disconnect', null);
    }
  }

  // ## Information Packet grouping
  //
  // Processes sending data to sockets may also group the packets
  // when necessary. This allows transmitting tree structures as
  // a stream of packets.
  //
  // For example, an object could be split into multiple packets
  // where each property is identified by a separate grouping:
  //
  //     # Group by object ID
  //     @outPorts.out.beginGroup object.id
  //
  //     for property, value of object
  //       @outPorts.out.beginGroup property
  //       @outPorts.out.send value
  //       @outPorts.out.endGroup()
  //
  //     @outPorts.out.endGroup()
  //
  // This would cause a tree structure to be sent to the receiving
  // process as a stream of packets. So, an article object may be
  // as packets like:
  //
  // * `/<article id>/title/Lorem ipsum`
  // * `/<article id>/author/Henri Bergius`
  //
  // Components are free to ignore groupings, but are recommended
  // to pass received groupings onward if the data structures remain
  // intact through the component's processing.
  beginGroup(group) {
    return this.handleSocketEvent('begingroup', group);
  }

  endGroup() {
    return this.handleSocketEvent('endgroup');
  }

  // ## Socket data delegation
  //
  // Sockets have the option to receive data from a delegate function
  // should the `send` method receive undefined for `data`.  This
  // helps in the case of defaulting values.
  setDataDelegate(delegate) {
    if (typeof delegate !== 'function') {
      throw Error('A data delegate must be a function.');
    }
    return this.dataDelegate = delegate;
  }

  // ## Socket debug mode
  //
  // Sockets can catch exceptions happening in processes when data is
  // sent to them. These errors can then be reported to the network for
  // notification to the developer.
  setDebug(active) {
    this.debug = active;
    return this.emitEvent = this.debug ? this.debugEmitEvent : this.regularEmitEvent;
  }

  // ## Socket identifiers
  //
  // Socket identifiers are mainly used for debugging purposes.
  // Typical identifiers look like _ReadFile:OUT -> Display:IN_,
  // but for sockets sending initial information packets to
  // components may also loom like _DATA -> ReadFile:SOURCE_.
  getId() {
    let fromStr = from => `${from.process.id}() ${from.port.toUpperCase()}`;
    let toStr = to => `${to.port.toUpperCase()} ${to.process.id}()`;

    if (!this.from && !this.to) { return "UNDEFINED"; }
    if (this.from && !this.to) { return `${fromStr(this.from)} -> ANON`; }
    if (!this.from) { return `DATA -> ${toStr(this.to)}`; }
    return `${fromStr(this.from)} -> ${toStr(this.to)}`;
  }

  legacyToIp(event, payload) {
    // No need to wrap modern IP Objects
    if (IP.isIP(payload)) { return payload; }

    // Wrap legacy events into appropriate IP objects
    switch (event) {
      case 'connect': case 'begingroup':
        return new IP('openBracket', payload);
      case 'disconnect': case 'endgroup':
        return new IP('closeBracket');
      default:
        return new IP('data', payload);
    }
  }

  ipToLegacy(ip) {
    let legacy;
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
  }

  handleSocketEvent(event, payload, autoConnect = true) {
    let isIP = event === 'ip' && IP.isIP(payload);
    let ip = isIP ? payload : this.legacyToIp(event, payload);

    if (!this.isConnected() && autoConnect && this.brackets.length === 0) {
      // Connect before sending
      this.connect();
    }

    if (event === 'begingroup') {
      this.brackets.push(payload);
    }
    if (isIP && ip.type === 'openBracket') {
      this.brackets.push(ip.data);
    }

    if (event === 'endgroup') {
      // Prevent closing already closed groups
      if (this.brackets.length === 0) { return; }
      // Add group name to bracket
      ip.data = this.brackets.pop();
      payload = ip.data;
    }
    if (isIP && payload.type === 'closeBracket') {
      // Prevent closing already closed brackets
      if (this.brackets.length === 0) { return; }
      this.brackets.pop();
    }

    // Emit the IP Object
    this.emitEvent('ip', ip);

    // Emit the legacy event
    if (!ip || !ip.type) { return; }

    if (isIP) {
      let legacy = this.ipToLegacy(ip);
      ({ event } = legacy);
      ({ payload } = legacy);
    }

    if (event === 'connect') { this.connected = true; }
    if (event === 'disconnect') { this.connected = false; }
    return this.emitEvent(event, payload);
  }
}

module.exports = { 
  InternalSocket: InternalSocket,
  createSocket: function() {
    return new InternalSocket
  }
}

