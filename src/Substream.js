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

export default Substream;