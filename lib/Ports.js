/*
#     CloudBoost Flow - Flow-Based Programming for JavaScript
#     (c) 2014 HackerBay, Inc. 
#     CloudBoost Flow may be freely distributed under the Apache 2 License
*/
//
// Ports collection classes for Flow components
let { EventEmitter } = require('events');

let InPort = require('./InPort');
let OutPort = require('./OutPort');

class Ports extends EventEmitter {
  
  constructor(ports) {
    this.model = InPort;
    this.ports = {};
    if (!ports) { return; }
    for (let name in ports) {
      let options = ports[name];
      this.add(name, options);
    }
  }

  add(name, options, process) {
    if (name === 'add' || name === 'remove') {
      throw new Error('Add and remove are restricted port names');
    }

    if (!name.match(/^[a-z0-9_\.\/]+$/)) {
      throw new Error(`Port names can only contain lowercase alphanumeric characters and underscores. '${name}' not allowed`);
    }

    // Remove previous implementation
    if (this.ports[name]) { this.remove(name); }

    if (typeof options === 'object' && options.canAttach) {
      this.ports[name] = options;
    } else {
      this.ports[name] = new this.model(options, process);
    }

    this[name] = this.ports[name];

    this.emit('add', name);

    return this; // chainable
  }

  remove(name) {
    if (!this.ports[name]) { throw new Error(`Port ${name} not defined`); }
    delete this.ports[name];
    delete this[name];
    this.emit('remove', name);

    return this; // chainable
  }
}

module.exports.InPorts = class InPorts extends Ports {
  on(name, event, callback) {
    if (!this.ports[name]) { throw new Error(`Port ${name} not available`); }
    return this.ports[name].on(event, callback);
  }
  once(name, event, callback) {
    if (!this.ports[name]) { throw new Error(`Port ${name} not available`); }
    return this.ports[name].once(event, callback);
  }
};

module.exports.OutPorts = class OutPorts extends Ports {
  constructor(){
    this.model = OutPort;
  }
  

  connect(name, socketId) {
    if (!this.ports[name]) { throw new Error(`Port ${name} not available`); }
    return this.ports[name].connect(socketId);
  }
  beginGroup(name, group, socketId) {
    if (!this.ports[name]) { throw new Error(`Port ${name} not available`); }
    return this.ports[name].beginGroup(group, socketId);
  }
  send(name, data, socketId) {
    if (!this.ports[name]) { throw new Error(`Port ${name} not available`); }
    return this.ports[name].send(data, socketId);
  }
  endGroup(name, socketId) {
    if (!this.ports[name]) { throw new Error(`Port ${name} not available`); }
    return this.ports[name].endGroup(socketId);
  }
  disconnect(name, socketId) {
    if (!this.ports[name]) { throw new Error(`Port ${name} not available`); }
    return this.ports[name].disconnect(socketId);
  }
};
