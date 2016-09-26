class StreamReceiver {
  constructor(port, buffered, process) {
    this.port = port;
    this.buffered = buffered || false;
    this.process = process || null;
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

export { StreamReceiver };