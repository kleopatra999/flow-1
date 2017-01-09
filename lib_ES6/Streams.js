/*
#     CloudBoost Flow - Flow-Based Programming for JavaScript
#     (c) 2014 HackerBay, Inc. 
#     CloudBoost Flow may be freely distributed under the Apache 2 License
*/
//
// High-level wrappers for FBP substreams processing.
//

// Wraps an object to be used in Substreams
class IP {
  constructor(data) {
    this.data = data;
  }
  sendTo(port) {
    return port.send(this.data);
  }
  getValue() {
    return this.data;
  }
  toObject() {
    return this.data;
  }
}

module.exports.IP = IP;

// Substream contains groups and data packets as a tree structure
class Substream {
  constructor(key) {
    this.key = key;
    this.value = [];
  }
  push(value) {
    return this.value.push(value);
  }
  sendTo(port) {
    port.beginGroup(this.key);
    for (let i = 0; i < this.value.length; i++) {
      let ip = this.value[i];
      if (ip instanceof Substream || ip instanceof IP) {
        ip.sendTo(port);
      } else {
        port.send(ip);
      }
    }
    return port.endGroup();
  }
  getKey() {
    return this.key;
  }
  getValue() {
    switch (this.value.length) {
      case 0:
        return null;
      case 1:
        if (typeof this.value[0].getValue === 'function') {
          if (this.value[0] instanceof Substream) {
            var obj = {};
            obj[this.value[0].key] = this.value[0].getValue();
            return obj;
          } else {
            return this.value[0].getValue();
          }
        } else {
          return this.value[0];
        }
      default:
        let res = [];
        let hasKeys = false;
        for (let i = 0; i < this.value.length; i++) {
          let ip = this.value[i];
          let val = typeof ip.getValue === 'function' ? ip.getValue() : ip;
          if (ip instanceof Substream) {
            var obj = {};
            obj[ip.key] = ip.getValue();
            res.push(obj);
          } else {
            res.push(val);
          }
        }
        return res;
    }
  }
  toObject() {
    let obj = {};
    obj[this.key] = this.getValue();
    return obj;
  }
}

module.exports.Substream = Substream;

// StreamSender sends FBP substreams atomically.
// Supports buffering for preordered output.
class StreamSender {
  constructor(port, ordered) {
    this.port = port;
    this.ordered = ordered;
    this.q = [];
    this.resetCurrent();
    this.resolved = false;
  }
  resetCurrent() {
    this.level = 0;
    this.current = null;
    return this.stack = [];
  }
  beginGroup(group) {
    this.level++;
    let stream = new Substream(group);
    this.stack.push(stream);
    this.current = stream;
    return this;
  }
  endGroup() {
    if (this.level > 0) { this.level--; }
    let value = this.stack.pop();
    if (this.level === 0) {
      this.q.push(value);
      this.resetCurrent();
    } else {
      let parent = this.stack[this.stack.length - 1];
      parent.push(value);
      this.current = parent;
    }
    return this;
  }
  send(data) {
    if (this.level === 0) {
      this.q.push(new IP(data));
    } else {
      this.current.push(new IP(data));
    }
    return this;
  }
  done() {
    if (this.ordered) {
      this.resolved = true;
    } else {
      this.flush();
    }
    return this;
  }
  disconnect() {
    this.q.push(null); // disconnect packet
    return this;
  }
  flush() {
    // Flush the buffers
    let res = false;
    if (this.q.length > 0) {
      for (let i = 0; i < this.q.length; i++) {
        let ip = this.q[i];
        if (ip === null) {
          if (this.port.isConnected()) { this.port.disconnect(); }
        } else {
          ip.sendTo(this.port);
        }
      }
      res = true;
    }
    this.q = [];
    return res;
  }
  isAttached() {
    return this.port.isAttached();
  }
}

module.exports.StreamSender = StreamSender;

// StreamReceiver wraps an inport and reads entire
// substreams as single objects.
class StreamReceiver {
  constructor(port, buffered, process) {
    
    if(!buffered){
      buffered = false;
    }

    if(!process){
      process = null;
    }

    this.port = port;
    this.buffered = buffered;
    this.process = process;
    this.q = [];
    this.resetCurrent();
    this.port.process = (event, payload, index) => {
      switch (event) {
        case 'connect':
          if (typeof this.process === 'function') { return this.process('connect', index); }
        case 'begingroup':
          this.level++;
          let stream = new Substream(payload);
          if (this.level === 1) {
            this.root = stream;
            this.parent = null;
          } else {
            this.parent = this.current;
          }
          return this.current = stream;
        case 'endgroup':
          if (this.level > 0) { this.level--; }
          if (this.level === 0) {
            if (this.buffered) {
              this.q.push(this.root);
              this.process('readable', index);
            } else {
              if (typeof this.process === 'function') { this.process('data', this.root, index); }
            }
            return this.resetCurrent();
          } else {
            this.parent.push(this.current);
            return this.current = this.parent;
          }
        case 'data':
          if (this.level === 0) {
            return this.q.push(new IP(payload));
          } else {
            return this.current.push(new IP(payload));
          }
        case 'disconnect':
          if (typeof this.process === 'function') { return this.process('disconnect', index); }
      }
    };
  }
  resetCurrent() {
    this.level = 0;
    this.root = null;
    this.current = null;
    return this.parent = null;
  }
  read() {
    if (this.q.length === 0) { return undefined; }
    return this.q.shift();
  }
}

module.exports.StreamReceiver = StreamReceiver;
