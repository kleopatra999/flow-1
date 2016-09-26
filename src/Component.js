//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2016 TheGrid (Rituwall Inc.)
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
//
// Baseclass for regular NoFlo components.
import { EventEmitter } from 'events';

import ports from './Ports';
import IP from './IP';

class Component extends EventEmitter {
  description = '';
  icon = null;

  constructor(options) {
    this.error = this.error.bind(this);
    if (!options) { options = {}; }
    if (!options.inPorts) { options.inPorts = {}; }
    if (options.inPorts instanceof ports.InPorts) {
      this.inPorts = options.inPorts;
    } else {
      this.inPorts = new ports.InPorts(options.inPorts);
    }

    if (!options.outPorts) { options.outPorts = {}; }
    if (options.outPorts instanceof ports.OutPorts) {
      this.outPorts = options.outPorts;
    } else {
      this.outPorts = new ports.OutPorts(options.outPorts);
    }

    if (options.icon) { this.icon = options.icon; }
    if (options.description) { this.description = options.description; }

    this.started = false;
    this.load = 0;
    this.ordered = options.ordered != null ? options.ordered : false;
    this.autoOrdering = options.autoOrdering != null ? options.autoOrdering : null;
    this.outputQ = [];
    this.activateOnInput = options.activateOnInput != null ? options.activateOnInput : true;
    this.forwardBrackets = {in: ['out', 'error']};
    this.bracketCounter = {};

    if ('forwardBrackets' in options) {
      this.forwardBrackets = options.forwardBrackets;
    }

    if (typeof options.process === 'function') {
      this.process(options.process);
    }
  }

  getDescription() { return this.description; }

  isReady() { return true; }

  isSubgraph() { return false; }

  setIcon(icon) {
    this.icon = icon;
    return this.emit('icon', this.icon);
  }
  getIcon() { return this.icon; }

  error(e, groups = [], errorPort = 'error', scope = null) {
    if (this.outPorts[errorPort] && (this.outPorts[errorPort].isAttached() || !this.outPorts[errorPort].isRequired())) {
      for (let i = 0; i < groups.length; i++) { var group = groups[i]; this.outPorts[errorPort].openBracket(group, {scope}); }
      this.outPorts[errorPort].data(e, {scope});
      for (let j = 0; j < groups.length; j++) { var group = groups[j]; this.outPorts[errorPort].closeBracket(group, {scope}); }
      // @outPorts[errorPort].disconnect()
      return;
    }
    throw e;
  }

  shutdown() {
    return this.started = false;
  }

  // The startup function performs initialization for the component.
  start() {
    this.started = true;
    return this.started;
  }

  isStarted() { return this.started; }

  // Ensures braket forwarding map is correct for the existing ports
  prepareForwarding() {
    return (() => {
      let result = [];
      for (let inPort in this.forwardBrackets) {
        let outPorts = this.forwardBrackets[inPort];
        if (!(inPort in this.inPorts.ports)) {
          delete this.forwardBrackets[inPort];
          continue;
        }
        let tmp = [];
        for (let i = 0; i < outPorts.length; i++) {
          let outPort = outPorts[i];
          if (outPort in this.outPorts.ports) { tmp.push(outPort); }
        }
        if (tmp.length === 0) {
          result.push(delete this.forwardBrackets[inPort]);
        } else {
          this.forwardBrackets[inPort] = tmp;
          result.push(this.bracketCounter[inPort] = 0);
        }
      }
      return result;
    })();
  }

  // Sets process handler function
  process(handle) {
    if (typeof handle !== 'function') {
      throw new Error("Process handler must be a function");
    }
    if (!this.inPorts) {
      throw new Error("Component ports must be defined before process function");
    }
    this.prepareForwarding();
    this.handle = handle;
    for (let name in this.inPorts.ports) {
      let port = this.inPorts.ports[name];
      ((name, port) => {
        if (!port.name) { port.name = name; }
        return port.on('ip', ip => {
          return this.handleIP(ip, port);
        }
        );
      })(name, port);
    }
    return this;
  }

  // Handles an incoming IP object
  handleIP(ip, port) {
    if (ip.type === 'openBracket') {
      if (this.autoOrdering === null) { this.autoOrdering = true; }
      this.bracketCounter[port.name]++;
    }
    if (port.name in this.forwardBrackets &&
    (ip.type === 'openBracket' || ip.type === 'closeBracket')) {
      // Bracket forwarding
      let outputEntry = {
        __resolved: true,
        __forwarded: true,
        __type: ip.type,
        __scope: ip.scope
      };
      for (let i = 0; i < this.forwardBrackets[port.name].length; i++) {
        let outPort = this.forwardBrackets[port.name][i];
        if (!(outPort in outputEntry)) { outputEntry[outPort] = []; }
        outputEntry[outPort].push(ip);
      }
      if (ip.scope != null) {
        port.scopedBuffer[ip.scope].pop();
      } else {
        port.buffer.pop();
      }
      this.outputQ.push(outputEntry);
      this.processOutputQueue();
      return;
    }
    if (!port.options.triggering) { return; }
    let result = {};
    let input = new ProcessInput(this.inPorts, ip, this, port, result);
    let output = new ProcessOutput(this.outPorts, ip, this, result);
    this.load++;
    return this.handle(input, output, () => output.done());
  }

  processOutputQueue() {
    while (this.outputQ.length > 0) {
      let result = this.outputQ[0];
      if (!result.__resolved) { break; }
      for (var port in result) {
        let ips = result[port];
        if (port.indexOf('__') === 0) { continue; }
        if (!this.outPorts.ports[port].isAttached()) { continue; }
        for (let i = 0; i < ips.length; i++) {
          let ip = ips[i];
          if (ip.type === 'closeBracket') { this.bracketCounter[port]--; }
          this.outPorts[port].sendIP(ip);
        }
      }
      this.outputQ.shift();
    }
    let bracketsClosed = true;
    for (let name in this.outPorts.ports) {
      var port = this.outPorts.ports[name];
      if (this.bracketCounter[port] !== 0) {
        bracketsClosed = false;
        break;
      }
    }
    if (bracketsClosed && this.autoOrdering === true) { return this.autoOrdering = null; }
  }
}

export { Component };

class ProcessInput {
  constructor(ports1, ip, nodeInstance, port, result) {
    this.ports = ports1;
    this.ip = ip;
    this.nodeInstance = nodeInstance;
    this.port = port;
    this.result = result;
    this.scope = this.ip.scope;
    this.buffer = new PortBuffer(this);
  }

  // Sets component state to `activated`
  activate() {
    this.result.__resolved = false;
    if (this.nodeInstance.ordered || this.nodeInstance.autoOrdering) {
      return this.nodeInstance.outputQ.push(this.result);
    }
  }

  // Returns true if a port (or ports joined by logical AND) has a new IP
  // Passing a validation callback as a last argument allows more selective
  // checking of packets.
  has(...args) {
    if (!args.length) { args = ['in']; }
    if (typeof args[args.length - 1] === 'function') {
      let validate = args.pop();
      for (let i = 0; i < args.length; i++) {
        var port = args[i];
        if (!this.ports[port].has(this.scope, validate)) { return false; }
      }
      return true;
    }
    let res = true;
    for (let j = 0; j < args.length; j++) { var port = args[j]; if (res) { res = this.ports[port].ready(this.scope); } }
    return res;
  }

  // Fetches IP object(s) for port(s)
  get(...args) {
    if (!args.length) { args = ['in']; }
    if ((this.nodeInstance.ordered || this.nodeInstance.autoOrdering) &&
    this.nodeInstance.activateOnInput &&
    !('__resolved' in this.result)) {
      this.activate();
    }
    let res = (args.map((port) => this.ports[port].get(this.scope)));
    if (args.length === 1) { return res[0]; } else { return res; }
  }

  // Fetches `data` property of IP object(s) for given port(s)
  getData(...args) {
    if (!args.length) { args = ['in']; }

    let datas = [];
    for (let i = 0; i < args.length; i++) {
      let port = args[i];
      let packet = this.get(port);
      if (packet == null) {
        // we add the null packet to the array so when getting
        // multiple ports, if one is null we still return it
        // so the indexes are correct.
        datas.push(packet);
        continue;
      }

      while (packet.type !== 'data') {
        packet = this.get(port);
      }

      packet = __guard__(packet, x => x.data) != null ? packet.data : undefined;
      datas.push(packet);

      // check if there is any other `data` IPs
      if ((this.buffer.find(port, ip => ip.type === 'data')).length <= 0) {
        this.buffer.set(port, []);
      }
    }

    if (args.length === 1) { return datas.pop(); }
    return datas;
  }

  hasStream(port) {
    let buffer = this.buffer.get(port);
    if (buffer.length === 0) { return false; }
    // check if we have everything until "disconnect"
    let received = 0;
    for (let i = 0; i < buffer.length; i++) {
      let packet = buffer[i];
      if (packet.type === 'openBracket') {
        ++received;
      } else if (packet.type === 'closeBracket') {
        --received;
      }
    }
    return received === 0;
  }

  getStream(port, withoutConnectAndDisconnect = false) {
    let buf = this.buffer.get(port);
    this.buffer.filter(port, ip => false);
    if (withoutConnectAndDisconnect) {
      buf = buf.slice(1);
      buf.pop();
    }
    return buf;
  }
}

class PortBuffer {
  constructor(context) {
    this.context = context;
  }

  set(name, buffer) {
    if ((name != null) && typeof name !== 'string') {
      buffer = name;
      name = null;
    }

    if (this.context.scope != null) {
      if (name != null) {
        this.context.ports[name].scopedBuffer[this.context.scope] = buffer;
        return this.context.ports[name].scopedBuffer[this.context.scope];
      }
      this.context.port.scopedBuffer[this.context.scope] = buffer;
      return this.context.port.scopedBuffer[this.context.scope];
    }

    if (name != null) {
      this.context.ports[name].buffer = buffer;
      return this.context.ports[name].buffer;
    }

    this.context.port.buffer = buffer;
    return this.context.port.buffer;
  }

  // Get a buffer (scoped or not) for a given port
  // if name is optional, use the current port
  get(name = null) {
    if (this.context.scope != null) {
      if (name != null) {
        return this.context.ports[name].scopedBuffer[this.context.scope];
      }
      return this.context.port.scopedBuffer[this.context.scope];
    }

    if (name != null) {
      return this.context.ports[name].buffer;
    }
    return this.context.port.buffer;
  }

  // Find packets matching a callback and return them without modifying the buffer
  find(name, cb) {
    let b = this.get(name);
    return b.filter(cb);
  }

  // Find packets and modify the original buffer
  // cb is a function with 2 arguments (ip, index)
  filter(name, cb) {
    if ((name != null) && typeof name !== 'string') {
      cb = name;
      name = null;
    }

    let b = this.get(name);
    b = b.filter(cb);

    return this.set(name, b);
  }
}

class ProcessOutput {
  constructor(ports1, ip, nodeInstance, result) {
    this.ports = ports1;
    this.ip = ip;
    this.nodeInstance = nodeInstance;
    this.result = result;
    this.scope = this.ip.scope;
  }

  // Sets component state to `activated`
  activate() {
    this.result.__resolved = false;
    if (this.nodeInstance.ordered || this.nodeInstance.autoOrdering) {
      return this.nodeInstance.outputQ.push(this.result);
    }
  }

  // Checks if a value is an Error
  isError(err) {
    return (err instanceof Error ||
    Array.isArray(err)) && err.length > 0 && err[0] instanceof Error;
  }

  // Sends an error object
  error(err) {
    let multiple = Array.isArray(err);
    if (!multiple) { err = [err]; }
    if ('error' in this.ports &&
    (this.ports.error.isAttached() || !this.ports.error.isRequired())) {
      if (multiple) { this.sendIP('error', new IP('openBracket')); }
      for (let i = 0; i < err.length; i++) { let e = err[i]; this.sendIP('error', e); }
      if (multiple) { return this.sendIP('error', new IP('closeBracket')); }
    } else {
      return (() => {
        let result = [];
        for (let j = 0; j < err.length; j++) {
          let e = err[j];
          throw e;
        }
        return result;
      })();
    }
  }

  // Sends a single IP object to a port
  sendIP(port, packet) {
    if (typeof packet !== 'object' || IP.types.indexOf(packet.type) === -1) {
      var ip = new IP('data', packet);
    } else {
      var ip = packet;
    }
    if (this.scope !== null && ip.scope === null) { ip.scope = this.scope; }
    if (this.nodeInstance.ordered || this.nodeInstance.autoOrdering) {
      if (!(port in this.result)) { this.result[port] = []; }
      return this.result[port].push(ip);
    } else {
      return this.nodeInstance.outPorts[port].sendIP(ip);
    }
  }

  // Sends packets for each port as a key in the map
  // or sends Error or a list of Errors if passed such
  send(outputMap) {
    if ((this.nodeInstance.ordered || this.nodeInstance.autoOrdering) &&
    !('__resolved' in this.result)) {
      this.activate();
    }
    if (this.isError(outputMap)) { return this.error(outputMap); }

    let componentPorts = [];
    let mapIsInPorts = false;
    let iterable = Object.keys(this.ports.ports);
    for (let i = 0; i < iterable.length; i++) {
      let port = iterable[i];
      if (port !== 'error' && port !== 'ports' && port !== '_callbacks') { componentPorts.push(port); }
      if (!mapIsInPorts && (outputMap != null) && typeof outputMap === 'object' && Object.keys(outputMap).indexOf(port) !== -1) {
        mapIsInPorts = true;
      }
    }

    if (componentPorts.length === 1 && !mapIsInPorts) {
      this.sendIP(componentPorts[0], outputMap);
      return;
    }

    return (() => {
      let result = [];
      for (let port in outputMap) {
        let packet = outputMap[port];
        result.push(this.sendIP(port, packet));
      }
      return result;
    })();
  }

  // Sends the argument via `send()` and marks activation as `done()`
  sendDone(outputMap) {
    this.send(outputMap);
    return this.done();
  }

  // Makes a map-style component pass a result value to `out`
  // keeping all IP metadata received from `in`,
  // or modifying it if `options` is provided
  pass(data, options = {}) {
    if (!('out' in this.ports)) {
      throw new Error('output.pass() requires port "out" to be present');
    }
    for (let key in options) {
      let val = options[key];
      this.ip[key] = val;
    }
    this.ip.data = data;
    this.sendIP('out', this.ip);
    return this.done();
  }

  // Finishes process activation gracefully
  done(error) {
    if (error) { this.error(error); }
    if (this.nodeInstance.ordered || this.nodeInstance.autoOrdering) {
      this.result.__resolved = true;
      this.nodeInstance.processOutputQueue();
    }
    return this.nodeInstance.load--;
  }
}
function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}