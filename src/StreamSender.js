class StreamSender {
  constructor(port, ordered) {
    this.port = port;
    this.ordered = ordered || false;
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

export { StreamSender };