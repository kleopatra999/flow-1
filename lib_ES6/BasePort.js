/*
#     CloudBoost Flow - Flow-Based Programming for JavaScript
#     (c) 2014 HackerBay, Inc. 
#     CloudBoost Flow may be freely distributed under the Apache 2 License
*/
//
// Base port type used for options normalization
let { EventEmitter } = require('events');

let validTypes = [
  'all',
  'string',
  'number',
  'int',
  'object',
  'array',
  'boolean',
  'color',
  'date',
  'bang',
  'function',
  'buffer',
  'stream'
];

class BasePort extends EventEmitter {
  constructor(options) {
    super()
    this.handleOptions(options);
    this.sockets = [];
    this.node = null;
    this.name = null;
  }

  handleOptions(options) {
    if (!options) { options = {}; }
    if (!options.datatype) { options.datatype = 'all'; }
    if (options.required === undefined) { options.required = false; }

    if (options.datatype === 'integer') { options.datatype = 'int'; }
    if (validTypes.indexOf(options.datatype) === -1) {
      throw new Error(`Invalid port datatype '${options.datatype}' specified, valid are ${validTypes.join(', ')}`);
    }

    if (options.type && options.type.indexOf('/') === -1) {
      throw new Error(`Invalid port type '${options.type}' specified. Should be URL or MIME type`);
    }

    return this.options = options;
  }

  getId() {
    if (!this.node || !this.name) {
      return 'Port';
    }
    return `${this.node} ${this.name.toUpperCase()}`;
  }

  getDataType() { return this.options.datatype; }
  getDescription() { return this.options.description; }

  attach(socket, index = null) {
    if (!this.isAddressable() || index === null) {
      index = this.sockets.length;
    }
    this.sockets[index] = socket;
    this.attachSocket(socket, index);
    if (this.isAddressable()) {
      this.emit('attach', socket, index);
      return;
    }
    return this.emit('attach', socket);
  }

  attachSocket() {}

  detach(socket) {
    let index = this.sockets.indexOf(socket);
    if (index === -1) {
      return;
    }
    this.sockets[index] = undefined;
    if (this.isAddressable()) {
      this.emit('detach', socket, index);
      return;
    }
    return this.emit('detach', socket);
  }

  isAddressable() {
    if (this.options.addressable) { return true; }
    return false;
  }

  isBuffered() {
    if (this.options.buffered) { return true; }
    return false;
  }

  isRequired() {
    if (this.options.required) { return true; }
    return false;
  }

  isAttached(socketId = null) {
    if (this.isAddressable() && socketId !== null) {
      if (this.sockets[socketId]) { return true; }
      return false;
    }
    if (this.sockets.length) { return true; }
    return false;
  }

  listAttached() {
    let attached = [];
    for (let idx = 0; idx < this.sockets.length; idx++) {
      let socket = this.sockets[idx];
      if (!socket) { continue; }
      attached.push(idx);
    }
    return attached;
  }

  isConnected(socketId = null) {
    if (this.isAddressable()) {
      if (socketId === null) { throw new Error(`${this.getId()}: Socket ID required`); }
      if (!this.sockets[socketId]) { throw new Error(`${this.getId()}: Socket ${socketId} not available`); }
      return this.sockets[socketId].isConnected();
    }

    let connected = false;
    this.sockets.forEach(socket => {
      if (!socket) { return; }
      if (socket.isConnected()) {
        return connected = true;
      }
    }
    );
    return connected;
  }

  canAttach() { return true; }
}


module.exports = BasePort
