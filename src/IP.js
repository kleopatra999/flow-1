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

export { IP };