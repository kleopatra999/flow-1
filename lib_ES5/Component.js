(function() {
  var Component, EventEmitter, IP, PortBuffer, ProcessContext, ProcessInput, ProcessOutput, debug, ports,
    bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty,
    slice = [].slice;

  EventEmitter = require('events').EventEmitter;

  ports = require('./Ports');

  IP = require('./IP');

  debug = require('debug')('noflo:component');

  Component = (function(superClass) {
    extend(Component, superClass);

    Component.prototype.description = '';

    Component.prototype.icon = null;

    function Component(options) {
      this.error = bind(this.error, this);
      var ref, ref1, ref2;
      if (!options) {
        options = {};
      }
      if (!options.inPorts) {
        options.inPorts = {};
      }
      if (options.inPorts instanceof ports.InPorts) {
        this.inPorts = options.inPorts;
      } else {
        this.inPorts = new ports.InPorts(options.inPorts);
      }
      if (!options.outPorts) {
        options.outPorts = {};
      }
      if (options.outPorts instanceof ports.OutPorts) {
        this.outPorts = options.outPorts;
      } else {
        this.outPorts = new ports.OutPorts(options.outPorts);
      }
      if (options.icon) {
        this.icon = options.icon;
      }
      if (options.description) {
        this.description = options.description;
      }
      this.started = false;
      this.load = 0;
      this.ordered = (ref = options.ordered) != null ? ref : false;
      this.autoOrdering = (ref1 = options.autoOrdering) != null ? ref1 : null;
      this.outputQ = [];
      this.bracketContext = {};
      this.activateOnInput = (ref2 = options.activateOnInput) != null ? ref2 : true;
      this.forwardBrackets = {
        "in": ['out', 'error']
      };
      if ('forwardBrackets' in options) {
        this.forwardBrackets = options.forwardBrackets;
      }
      if (typeof options.process === 'function') {
        this.process(options.process);
      }
    }

    Component.prototype.getDescription = function() {
      return this.description;
    };

    Component.prototype.isReady = function() {
      return true;
    };

    Component.prototype.isSubgraph = function() {
      return false;
    };

    Component.prototype.setIcon = function(icon) {
      this.icon = icon;
      return this.emit('icon', this.icon);
    };

    Component.prototype.getIcon = function() {
      return this.icon;
    };

    Component.prototype.error = function(e, groups, errorPort, scope) {
      var group, i, j, len1, len2;
      if (groups == null) {
        groups = [];
      }
      if (errorPort == null) {
        errorPort = 'error';
      }
      if (scope == null) {
        scope = null;
      }
      if (this.outPorts[errorPort] && (this.outPorts[errorPort].isAttached() || !this.outPorts[errorPort].isRequired())) {
        for (i = 0, len1 = groups.length; i < len1; i++) {
          group = groups[i];
          this.outPorts[errorPort].openBracket(group, {
            scope: scope
          });
        }
        this.outPorts[errorPort].data(e, {
          scope: scope
        });
        for (j = 0, len2 = groups.length; j < len2; j++) {
          group = groups[j];
          this.outPorts[errorPort].closeBracket(group, {
            scope: scope
          });
        }
        return;
      }
      throw e;
    };

    Component.prototype.shutdown = function() {
      var callback;
      if (!this.started) {
        return;
      }
      callback = (function(_this) {
        return function() {
          _this.started = false;
          return _this.emit('end');
        };
      })(this);
      if (this.load > 0) {
        return this.on('deactivate', (function(_this) {
          return function() {
            if (_this.load === 0) {
              return callback();
            }
          };
        })(this));
      } else {
        return callback();
      }
    };

    Component.prototype.start = function() {
      this.started = true;
      this.emit('start');
      return this.started;
    };

    Component.prototype.isStarted = function() {
      return this.started;
    };

    Component.prototype.prepareForwarding = function() {
      var i, inPort, len1, outPort, outPorts, ref, results, tmp;
      ref = this.forwardBrackets;
      results = [];
      for (inPort in ref) {
        outPorts = ref[inPort];
        if (!(inPort in this.inPorts.ports)) {
          delete this.forwardBrackets[inPort];
          continue;
        }
        tmp = [];
        for (i = 0, len1 = outPorts.length; i < len1; i++) {
          outPort = outPorts[i];
          if (outPort in this.outPorts.ports) {
            tmp.push(outPort);
          }
        }
        if (tmp.length === 0) {
          results.push(delete this.forwardBrackets[inPort]);
        } else {
          results.push(this.forwardBrackets[inPort] = tmp);
        }
      }
      return results;
    };

    Component.prototype.process = function(handle) {
      var fn, name, port, ref;
      if (typeof handle !== 'function') {
        throw new Error("Process handler must be a function");
      }
      if (!this.inPorts) {
        throw new Error("Component ports must be defined before process function");
      }
      this.prepareForwarding();
      this.handle = handle;
      ref = this.inPorts.ports;
      fn = (function(_this) {
        return function(name, port) {
          if (!port.name) {
            port.name = name;
          }
          return port.on('ip', function(ip) {
            return _this.handleIP(ip, port);
          });
        };
      })(this);
      for (name in ref) {
        port = ref[name];
        fn(name, port);
      }
      return this;
    };

    Component.prototype.isForwardingInport = function(port) {
      var portName;
      if (typeof port === 'string') {
        portName = port;
      } else {
        portName = port.name;
      }
      if (portName in this.forwardBrackets) {
        return true;
      }
      return false;
    };

    Component.prototype.isForwardingOutport = function(inport, outport) {
      var inportName, outportName;
      if (typeof inport === 'string') {
        inportName = inport;
      } else {
        inportName = inport.name;
      }
      if (typeof outport === 'string') {
        outportName = outport;
      } else {
        outportName = outport.name;
      }
      if (!this.forwardBrackets[inportName]) {
        return false;
      }
      if (this.forwardBrackets[inportName].indexOf(outportName) !== -1) {
        return true;
      }
      return false;
    };

    Component.prototype.isOrdered = function() {
      if (this.ordered) {
        return true;
      }
      if (this.autoOrdering) {
        return true;
      }
      return false;
    };

    Component.prototype.handleIP = function(ip, port) {
      var buf, context, e, error1, input, output, result;
      if (!port.options.triggering) {
        return;
      }
      if (ip.type === 'openBracket' && this.autoOrdering === null) {
        debug(this.nodeId + " port " + port.name + " entered auto-ordering mode");
        this.autoOrdering = true;
      }
      result = {};
      if (this.isForwardingInport(port)) {
        if (ip.type === 'openBracket') {
          return;
        }
        if (ip.type === 'closeBracket') {
          if (this.outputQ.length >= this.load) {
            buf = port.getBuffer(ip.scope);
            if (buf[0] !== ip) {
              return;
            }
            port.get(ip.scope);
            context = this.bracketContext[port.name][ip.scope].pop();
            context.closeIp = ip;
            debug(this.nodeId + " closeBracket-C " + ip.data + " " + context.ports);
            result = {
              __resolved: true,
              __bracketClosingAfter: [context]
            };
            this.outputQ.push(result);
            this.processOutputQueue();
          }
          return;
        }
      }
      context = new ProcessContext(ip, this, port, result);
      input = new ProcessInput(this.inPorts, context);
      output = new ProcessOutput(this.outPorts, context);
      try {
        this.handle(input, output, context);
      } catch (error1) {
        e = error1;
        this.deactivate(context);
        output.sendDone(e);
      }
      if (!input.activated) {
        debug(this.nodeId + " " + ip.type + " packet on " + port.name + " didn't match preconditions");
        return;
      }
      if (this.isOrdered()) {
        this.outputQ.push(result);
        this.processOutputQueue();
      }
    };

    Component.prototype.addBracketForwards = function(result) {
      var context, i, j, k, l, len1, len2, len3, len4, port, ref, ref1, ref2, ref3, ref4, ref5;
      if ((ref = result.__bracketClosingBefore) != null ? ref.length : void 0) {
        ref1 = result.__bracketClosingBefore;
        for (i = 0, len1 = ref1.length; i < len1; i++) {
          context = ref1[i];
          debug(this.nodeId + " closeBracket-A " + context.closeIp.data + " " + context.ports);
          if (!context.ports.length) {
            continue;
          }
          ref2 = context.ports;
          for (j = 0, len2 = ref2.length; j < len2; j++) {
            port = ref2[j];
            if (!result[port]) {
              result[port] = [];
            }
            result[port].unshift(context.closeIp.clone());
          }
        }
      }
      if (result.__bracketContext) {
        Object.keys(result.__bracketContext).reverse().forEach((function(_this) {
          return function(inport) {
            var ctx, ips, outport, results, unforwarded;
            context = result.__bracketContext[inport];
            if (!context.length) {
              return;
            }
            results = [];
            for (outport in result) {
              ips = result[outport];
              if (outport.indexOf('__') === 0) {
                continue;
              }
              unforwarded = context.filter(function(ctx) {
                if (!_this.isForwardingOutport(inport, outport)) {
                  return false;
                }
                return ctx.ports.indexOf(outport) === -1;
              });
              if (!unforwarded.length) {
                continue;
              }
              unforwarded.reverse();
              results.push((function() {
                var k, len3, results1;
                results1 = [];
                for (k = 0, len3 = unforwarded.length; k < len3; k++) {
                  ctx = unforwarded[k];
                  ips.unshift(ctx.ip.clone());
                  debug(this.nodeId + " register " + outport + " to " + inport + " ctx " + ctx.ip.data);
                  results1.push(ctx.ports.push(outport));
                }
                return results1;
              }).call(_this));
            }
            return results;
          };
        })(this));
      }
      if ((ref3 = result.__bracketClosingAfter) != null ? ref3.length : void 0) {
        ref4 = result.__bracketClosingAfter;
        for (k = 0, len3 = ref4.length; k < len3; k++) {
          context = ref4[k];
          debug(this.nodeId + " closeBracket-B " + context.closeIp.data + " " + context.ports);
          if (!context.ports.length) {
            continue;
          }
          ref5 = context.ports;
          for (l = 0, len4 = ref5.length; l < len4; l++) {
            port = ref5[l];
            if (!result[port]) {
              result[port] = [];
            }
            result[port].push(context.closeIp.clone());
          }
        }
      }
      delete result.__bracketClosingBefore;
      delete result.__bracketContext;
      return delete result.__bracketClosingAfter;
    };

    Component.prototype.processOutputQueue = function() {
      var i, ip, ips, len1, port, result, results;
      results = [];
      while (this.outputQ.length > 0) {
        result = this.outputQ[0];
        if (!result.__resolved) {
          break;
        }
        this.addBracketForwards(result);
        for (port in result) {
          ips = result[port];
          if (port.indexOf('__') === 0) {
            continue;
          }
          if (!this.outPorts.ports[port].isAttached()) {
            continue;
          }
          for (i = 0, len1 = ips.length; i < len1; i++) {
            ip = ips[i];
            if (ip.type === 'openBracket') {
              debug(this.nodeId + " sending < " + ip.data + " to " + port);
            } else if (ip.type === 'closeBracket') {
              debug(this.nodeId + " sending > " + ip.data + " to " + port);
            } else {
              debug(this.nodeId + " sending DATA to " + port);
            }
            this.outPorts[port].sendIP(ip);
          }
        }
        results.push(this.outputQ.shift());
      }
      return results;
    };

    Component.prototype.activate = function(context) {
      if (context.activated) {
        return;
      }
      context.activated = true;
      context.deactivated = false;
      this.load++;
      this.emit('activate', this.load);
      if (this.ordered || this.autoOrdering) {
        return this.outputQ.push(context.result);
      }
    };

    Component.prototype.deactivate = function(context) {
      if (context.deactivated) {
        return;
      }
      context.deactivated = true;
      context.activated = false;
      if (this.ordered || this.autoOrdering) {
        this.processOutputQueue();
      }
      this.load--;
      return this.emit('deactivate', this.load);
    };

    return Component;

  })(EventEmitter);

  exports.Component = Component;

  ProcessContext = (function() {
    function ProcessContext(ip1, nodeInstance, port1, result1) {
      this.ip = ip1;
      this.nodeInstance = nodeInstance;
      this.port = port1;
      this.result = result1;
      this.scope = this.ip.scope;
      this.activated = false;
      this.deactivated = false;
    }

    ProcessContext.prototype.activate = function() {
      if (this.result.__resolved || this.nodeInstance.outputQ.indexOf(this.result) === -1) {
        this.result = {};
      }
      return this.nodeInstance.activate(this);
    };

    ProcessContext.prototype.deactivate = function() {
      if (!this.result.__resolved) {
        this.result.__resolved = true;
      }
      return this.nodeInstance.deactivate(this);
    };

    return ProcessContext;

  })();

  ProcessInput = (function() {
    function ProcessInput(ports1, context1) {
      this.ports = ports1;
      this.context = context1;
      this.nodeInstance = this.context.nodeInstance;
      this.ip = this.context.ip;
      this.port = this.context.port;
      this.result = this.context.result;
      this.scope = this.context.scope;
      this.buffer = new PortBuffer(this);
      this.activated = false;
    }

    ProcessInput.prototype.activate = function() {
      if (this.context.activated) {
        return;
      }
      debug(this.nodeInstance.nodeId + " " + this.ip.type + " packet on " + this.port.name + " caused activation " + this.nodeInstance.load);
      if (this.nodeInstance.isOrdered()) {
        this.result.__resolved = false;
      }
      return this.nodeInstance.activate(this.context);
    };

    ProcessInput.prototype.has = function() {
      var args, i, j, len1, len2, port, res, validate;
      args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      if (!args.length) {
        args = ['in'];
      }
      if (typeof args[args.length - 1] === 'function') {
        validate = args.pop();
        for (i = 0, len1 = args.length; i < len1; i++) {
          port = args[i];
          if (!this.ports[port].has(this.scope, validate)) {
            return false;
          }
        }
        return true;
      }
      res = true;
      for (j = 0, len2 = args.length; j < len2; j++) {
        port = args[j];
        res && (res = this.ports[port].ready(this.scope));
      }
      return res;
    };

    ProcessInput.prototype.hasData = function() {
      var args;
      args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      if (!args.length) {
        args = ['in'];
      }
      args.push(function(ip) {
        return ip.type === 'data';
      });
      return this.has.apply(this, args);
    };

    ProcessInput.prototype.hasStream = function(port) {
      var buffer, i, len1, packet, received;
      buffer = this.buffer.get(port);
      if (buffer.length === 0) {
        return false;
      }
      received = 0;
      for (i = 0, len1 = buffer.length; i < len1; i++) {
        packet = buffer[i];
        if (packet.type === 'openBracket') {
          ++received;
        } else if (packet.type === 'closeBracket') {
          --received;
        }
      }
      return received === 0;
    };

    ProcessInput.prototype.get = function() {
      var args, i, ip, len1, port, res;
      args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      this.activate();
      if (!args.length) {
        args = ['in'];
      }
      res = [];
      for (i = 0, len1 = args.length; i < len1; i++) {
        port = args[i];
        if (this.nodeInstance.isForwardingInport(port)) {
          ip = this.__getForForwarding(port);
          res.push(ip);
          continue;
        }
        ip = this.ports[port].get(this.scope);
        res.push(ip);
      }
      if (args.length === 1) {
        return res[0];
      } else {
        return res;
      }
    };

    ProcessInput.prototype.__getForForwarding = function(port) {
      var context, dataIp, i, ip, len1, prefix;
      if (!this.nodeInstance.bracketContext[port]) {
        this.nodeInstance.bracketContext[port] = {};
      }
      if (!this.nodeInstance.bracketContext[port][this.scope]) {
        this.nodeInstance.bracketContext[port][this.scope] = [];
      }
      prefix = [];
      dataIp = null;
      while (true) {
        ip = this.ports[port].get(this.scope);
        if (!ip) {
          break;
        }
        if (ip.type === 'data') {
          dataIp = ip;
          break;
        }
        prefix.push(ip);
      }
      for (i = 0, len1 = prefix.length; i < len1; i++) {
        ip = prefix[i];
        if (ip.type === 'closeBracket') {
          if (!this.result.__bracketClosingBefore) {
            this.result.__bracketClosingBefore = [];
          }
          context = this.nodeInstance.bracketContext[port][this.scope].pop();
          context.closeIp = ip;
          this.result.__bracketClosingBefore.push(context);
          continue;
        }
        if (ip.type === 'openBracket') {
          this.nodeInstance.bracketContext[port][this.scope].push({
            ip: ip,
            ports: [],
            source: port
          });
          continue;
        }
      }
      if (!this.result.__bracketContext) {
        this.result.__bracketContext = {};
      }
      this.result.__bracketContext[port] = this.nodeInstance.bracketContext[port][this.scope].slice(0);
      return dataIp;
    };

    ProcessInput.prototype.getData = function() {
      var args, datas, i, len1, packet, port, ref;
      args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      if (!args.length) {
        args = ['in'];
      }
      datas = [];
      for (i = 0, len1 = args.length; i < len1; i++) {
        port = args[i];
        packet = this.get(port);
        if (packet == null) {
          datas.push(packet);
          continue;
        }
        while (packet.type !== 'data') {
          packet = this.get(port);
          if (!packet) {
            break;
          }
        }
        packet = (ref = packet != null ? packet.data : void 0) != null ? ref : void 0;
        datas.push(packet);
      }
      if (args.length === 1) {
        return datas.pop();
      }
      return datas;
    };

    ProcessInput.prototype.getStream = function(port, withoutConnectAndDisconnect) {
      var buf;
      if (withoutConnectAndDisconnect == null) {
        withoutConnectAndDisconnect = false;
      }
      buf = this.buffer.get(port);
      this.buffer.filter(port, function(ip) {
        return false;
      });
      if (withoutConnectAndDisconnect) {
        buf = buf.slice(1);
        buf.pop();
      }
      return buf;
    };

    return ProcessInput;

  })();

  PortBuffer = (function() {
    function PortBuffer(context1) {
      this.context = context1;
    }

    PortBuffer.prototype.set = function(name, buffer) {
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
    };

    PortBuffer.prototype.get = function(name) {
      if (name == null) {
        name = null;
      }
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
    };

    PortBuffer.prototype.find = function(name, cb) {
      var b;
      b = this.get(name);
      return b.filter(cb);
    };

    PortBuffer.prototype.filter = function(name, cb) {
      var b;
      if ((name != null) && typeof name !== 'string') {
        cb = name;
        name = null;
      }
      b = this.get(name);
      b = b.filter(cb);
      return this.set(name, b);
    };

    return PortBuffer;

  })();

  ProcessOutput = (function() {
    function ProcessOutput(ports1, context1) {
      this.ports = ports1;
      this.context = context1;
      this.nodeInstance = this.context.nodeInstance;
      this.ip = this.context.ip;
      this.result = this.context.result;
      this.scope = this.context.scope;
    }

    ProcessOutput.prototype.isError = function(err) {
      return err instanceof Error || Array.isArray(err) && err.length > 0 && err[0] instanceof Error;
    };

    ProcessOutput.prototype.error = function(err) {
      var e, i, j, len1, len2, multiple, results;
      multiple = Array.isArray(err);
      if (!multiple) {
        err = [err];
      }
      if ('error' in this.ports && (this.ports.error.isAttached() || !this.ports.error.isRequired())) {
        if (multiple) {
          this.sendIP('error', new IP('openBracket'));
        }
        for (i = 0, len1 = err.length; i < len1; i++) {
          e = err[i];
          this.sendIP('error', e);
        }
        if (multiple) {
          return this.sendIP('error', new IP('closeBracket'));
        }
      } else {
        results = [];
        for (j = 0, len2 = err.length; j < len2; j++) {
          e = err[j];
          throw e;
        }
        return results;
      }
    };

    ProcessOutput.prototype.sendIP = function(port, packet) {
      var ip;
      if (!IP.isIP(packet)) {
        ip = new IP('data', packet);
      } else {
        ip = packet;
      }
      if (this.scope !== null && ip.scope === null) {
        ip.scope = this.scope;
      }
      if (this.nodeInstance.isOrdered()) {
        if (!(port in this.result)) {
          this.result[port] = [];
        }
        this.result[port].push(ip);
        return;
      }
      return this.nodeInstance.outPorts[port].sendIP(ip);
    };

    ProcessOutput.prototype.send = function(outputMap) {
      var componentPorts, i, len1, mapIsInPorts, packet, port, ref, results;
      if (this.isError(outputMap)) {
        return this.error(outputMap);
      }
      componentPorts = [];
      mapIsInPorts = false;
      ref = Object.keys(this.ports.ports);
      for (i = 0, len1 = ref.length; i < len1; i++) {
        port = ref[i];
        if (port !== 'error' && port !== 'ports' && port !== '_callbacks') {
          componentPorts.push(port);
        }
        if (!mapIsInPorts && (outputMap != null) && typeof outputMap === 'object' && Object.keys(outputMap).indexOf(port) !== -1) {
          mapIsInPorts = true;
        }
      }
      if (componentPorts.length === 1 && !mapIsInPorts) {
        this.sendIP(componentPorts[0], outputMap);
        return;
      }
      if (componentPorts.length > 1 && !mapIsInPorts) {
        throw new Error('Port must be specified for sending output');
      }
      results = [];
      for (port in outputMap) {
        packet = outputMap[port];
        results.push(this.sendIP(port, packet));
      }
      return results;
    };

    ProcessOutput.prototype.sendDone = function(outputMap) {
      this.send(outputMap);
      return this.done();
    };

    ProcessOutput.prototype.pass = function(data, options) {
      var key, val;
      if (options == null) {
        options = {};
      }
      if (!('out' in this.ports)) {
        throw new Error('output.pass() requires port "out" to be present');
      }
      for (key in options) {
        val = options[key];
        this.ip[key] = val;
      }
      this.ip.data = data;
      this.sendIP('out', this.ip);
      return this.done();
    };

    ProcessOutput.prototype.done = function(error) {
      var buf, context, contexts, ctx, ip, isLast, nodeContext, port, ref;
      this.result.__resolved = true;
      this.nodeInstance.activate(this.context);
      if (error) {
        this.error(error);
      }
      isLast = (function(_this) {
        return function() {
          var len, load, pos;
          pos = _this.nodeInstance.outputQ.indexOf(_this.result);
          len = _this.nodeInstance.outputQ.length;
          load = _this.nodeInstance.load;
          if (pos === len - 1) {
            return true;
          }
          if (pos === -1 && load === len + 1) {
            return true;
          }
          if (len <= 1 && load === 1) {
            return true;
          }
          return false;
        };
      })(this);
      if (this.nodeInstance.isOrdered() && isLast()) {
        ref = this.nodeInstance.bracketContext;
        for (port in ref) {
          contexts = ref[port];
          if (!contexts[this.scope]) {
            continue;
          }
          nodeContext = contexts[this.scope];
          context = nodeContext[nodeContext.length - 1];
          buf = this.nodeInstance.inPorts[context.source].getBuffer(context.ip.scope);
          while (true) {
            if (!buf.length) {
              break;
            }
            if (buf[0].type !== 'closeBracket') {
              break;
            }
            ip = this.nodeInstance.inPorts[context.source].get(context.ip.scope);
            ctx = nodeContext.pop();
            ctx.closeIp = ip;
            if (!this.result.__bracketClosingAfter) {
              this.result.__bracketClosingAfter = [];
            }
            this.result.__bracketClosingAfter.push(ctx);
          }
        }
      }
      debug(this.nodeInstance.nodeId + " finished processing " + this.nodeInstance.load);
      this.nodeInstance.load--;
      if (this.nodeInstance.isOrdered()) {
        this.result.__resolved = true;
        this.nodeInstance.processOutputQueue();
      }
      return this.nodeInstance.deactivate(this.context);
    };

    return ProcessOutput;

  })();

}).call(this);
