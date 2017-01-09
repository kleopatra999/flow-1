(function() {
  var EventEmitter, Network, componentLoader, graph, internalSocket, platform, utils,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  internalSocket = require("./InternalSocket");

  graph = require("./Graph");

  EventEmitter = require('events').EventEmitter;

  platform = require('./Platform');

  componentLoader = require('./ComponentLoader');

  utils = require('./Utils');

  Network = (function(superClass) {
    extend(Network, superClass);

    Network.prototype.processes = {};

    Network.prototype.connections = [];

    Network.prototype.initials = [];

    Network.prototype.defaults = [];

    Network.prototype.graph = null;

    Network.prototype.startupDate = null;

    Network.prototype.portBuffer = {};

    function Network(graph, options) {
      this.options = options != null ? options : {};
      this.processes = {};
      this.connections = [];
      this.initials = [];
      this.nextInitials = [];
      this.defaults = [];
      this.graph = graph;
      this.started = false;
      this.debug = true;
      this.connectionCount = 0;
      if (!platform.isBrowser()) {
        this.baseDir = graph.baseDir || process.cwd();
      } else {
        this.baseDir = graph.baseDir || '/';
      }
      this.startupDate = null;
      if (graph.componentLoader) {
        this.loader = graph.componentLoader;
      } else {
        this.loader = new componentLoader.ComponentLoader(this.baseDir, this.options);
      }
    }

    Network.prototype.uptime = function() {
      if (!this.startupDate) {
        return 0;
      }
      return new Date() - this.startupDate;
    };

    Network.prototype.increaseConnections = function() {
      if (this.connectionCount === 0) {
        this.setStarted(true);
      }
      return this.connectionCount++;
    };

    Network.prototype.decreaseConnections = function() {
      this.connectionCount--;
      if (this.connectionCount) {
        return;
      }
      if (!this.debouncedEnd) {
        this.debouncedEnd = utils.debounce((function(_this) {
          return function() {
            if (_this.connectionCount) {
              return;
            }
            return _this.setStarted(false);
          };
        })(this), 50);
      }
      return this.debouncedEnd();
    };

    Network.prototype.load = function(component, metadata, callback) {
      return this.loader.load(component, callback, metadata);
    };

    Network.prototype.addNode = function(node, callback) {
      var process;
      if (this.processes[node.id]) {
        if (callback) {
          callback(null, this.processes[node.id]);
        }
        return;
      }
      process = {
        id: node.id
      };
      if (!node.component) {
        this.processes[process.id] = process;
        if (callback) {
          callback(null, process);
        }
        return;
      }
      return this.load(node.component, node.metadata, (function(_this) {
        return function(err, instance) {
          var inPorts, name, outPorts, port;
          if (err) {
            return callback(err);
          }
          instance.nodeId = node.id;
          process.component = instance;
          inPorts = process.component.inPorts.ports || process.component.inPorts;
          outPorts = process.component.outPorts.ports || process.component.outPorts;
          for (name in inPorts) {
            port = inPorts[name];
            port.node = node.id;
            port.nodeInstance = instance;
            port.name = name;
          }
          for (name in outPorts) {
            port = outPorts[name];
            port.node = node.id;
            port.nodeInstance = instance;
            port.name = name;
          }
          if (instance.isSubgraph()) {
            _this.subscribeSubgraph(process);
          }
          _this.subscribeNode(process);
          _this.processes[process.id] = process;
          if (callback) {
            return callback(null, process);
          }
        };
      })(this));
    };

    Network.prototype.removeNode = function(node, callback) {
      if (!this.processes[node.id]) {
        return callback(new Error("Node " + node.id + " not found"));
      }
      this.processes[node.id].component.shutdown();
      delete this.processes[node.id];
      if (callback) {
        return callback(null);
      }
    };

    Network.prototype.renameNode = function(oldId, newId, callback) {
      var inPorts, name, outPorts, port, process;
      process = this.getNode(oldId);
      if (!process) {
        return callback(new Error("Process " + oldId + " not found"));
      }
      process.id = newId;
      inPorts = process.component.inPorts.ports || process.component.inPorts;
      outPorts = process.component.outPorts.ports || process.component.outPorts;
      for (name in inPorts) {
        port = inPorts[name];
        port.node = newId;
      }
      for (name in outPorts) {
        port = outPorts[name];
        port.node = newId;
      }
      this.processes[newId] = process;
      delete this.processes[oldId];
      if (callback) {
        return callback(null);
      }
    };

    Network.prototype.getNode = function(id) {
      return this.processes[id];
    };

    Network.prototype.connect = function(done) {
      var callStack, edges, initializers, nodes, serialize, setDefaults, subscribeGraph;
      if (done == null) {
        done = function() {};
      }
      callStack = 0;
      serialize = (function(_this) {
        return function(next, add) {
          return function(type) {
            return _this["add" + type](add, function(err) {
              if (err) {
                console.log(err);
              }
              if (err) {
                return done(err);
              }
              callStack++;
              if (callStack % 100 === 0) {
                setTimeout(function() {
                  return next(type);
                }, 0);
                return;
              }
              return next(type);
            });
          };
        };
      })(this);
      subscribeGraph = (function(_this) {
        return function() {
          _this.subscribeGraph();
          return done();
        };
      })(this);
      setDefaults = utils.reduceRight(this.graph.nodes, serialize, subscribeGraph);
      initializers = utils.reduceRight(this.graph.initializers, serialize, function() {
        return setDefaults("Defaults");
      });
      edges = utils.reduceRight(this.graph.edges, serialize, function() {
        return initializers("Initial");
      });
      nodes = utils.reduceRight(this.graph.nodes, serialize, function() {
        return edges("Edge");
      });
      return nodes("Node");
    };

    Network.prototype.connectPort = function(socket, process, port, index, inbound) {
      if (inbound) {
        socket.to = {
          process: process,
          port: port,
          index: index
        };
        if (!(process.component.inPorts && process.component.inPorts[port])) {
          throw new Error("No inport '" + port + "' defined in process " + process.id + " (" + (socket.getId()) + ")");
          return;
        }
        if (process.component.inPorts[port].isAddressable()) {
          return process.component.inPorts[port].attach(socket, index);
        }
        return process.component.inPorts[port].attach(socket);
      }
      socket.from = {
        process: process,
        port: port,
        index: index
      };
      if (!(process.component.outPorts && process.component.outPorts[port])) {
        throw new Error("No outport '" + port + "' defined in process " + process.id + " (" + (socket.getId()) + ")");
        return;
      }
      if (process.component.outPorts[port].isAddressable()) {
        return process.component.outPorts[port].attach(socket, index);
      }
      return process.component.outPorts[port].attach(socket);
    };

    Network.prototype.subscribeGraph = function() {
      var graphOps, processOps, processing, registerOp;
      graphOps = [];
      processing = false;
      registerOp = function(op, details) {
        return graphOps.push({
          op: op,
          details: details
        });
      };
      processOps = (function(_this) {
        return function(err) {
          var cb, op;
          if (err) {
            if (_this.listeners('process-error').length === 0) {
              throw err;
            }
            _this.emit('process-error', err);
          }
          if (!graphOps.length) {
            processing = false;
            return;
          }
          processing = true;
          op = graphOps.shift();
          cb = processOps;
          switch (op.op) {
            case 'renameNode':
              return _this.renameNode(op.details.from, op.details.to, cb);
            default:
              return _this[op.op](op.details, cb);
          }
        };
      })(this);
      this.graph.on('addNode', (function(_this) {
        return function(node) {
          registerOp('addNode', node);
          if (!processing) {
            return processOps();
          }
        };
      })(this));
      this.graph.on('removeNode', (function(_this) {
        return function(node) {
          registerOp('removeNode', node);
          if (!processing) {
            return processOps();
          }
        };
      })(this));
      this.graph.on('renameNode', (function(_this) {
        return function(oldId, newId) {
          registerOp('renameNode', {
            from: oldId,
            to: newId
          });
          if (!processing) {
            return processOps();
          }
        };
      })(this));
      this.graph.on('addEdge', (function(_this) {
        return function(edge) {
          registerOp('addEdge', edge);
          if (!processing) {
            return processOps();
          }
        };
      })(this));
      this.graph.on('removeEdge', (function(_this) {
        return function(edge) {
          registerOp('removeEdge', edge);
          if (!processing) {
            return processOps();
          }
        };
      })(this));
      this.graph.on('addInitial', (function(_this) {
        return function(iip) {
          registerOp('addInitial', iip);
          if (!processing) {
            return processOps();
          }
        };
      })(this));
      return this.graph.on('removeInitial', (function(_this) {
        return function(iip) {
          registerOp('removeInitial', iip);
          if (!processing) {
            return processOps();
          }
        };
      })(this));
    };

    Network.prototype.subscribeSubgraph = function(node) {
      var emitSub;
      if (!node.component.isReady()) {
        node.component.once('ready', (function(_this) {
          return function() {
            return _this.subscribeSubgraph(node);
          };
        })(this));
        return;
      }
      if (!node.component.network) {
        return;
      }
      node.component.network.setDebug(this.debug);
      emitSub = (function(_this) {
        return function(type, data) {
          if (type === 'process-error' && _this.listeners('process-error').length === 0) {
            if (data.id && data.metadata && data.error) {
              throw data.error;
            }
            throw data;
          }
          if (type === 'connect') {
            _this.increaseConnections();
          }
          if (type === 'disconnect') {
            _this.decreaseConnections();
          }
          if (!data) {
            data = {};
          }
          if (data.subgraph) {
            if (!data.subgraph.unshift) {
              data.subgraph = [data.subgraph];
            }
            data.subgraph = data.subgraph.unshift(node.id);
          } else {
            data.subgraph = [node.id];
          }
          return _this.emit(type, data);
        };
      })(this);
      node.component.network.on('connect', function(data) {
        return emitSub('connect', data);
      });
      node.component.network.on('begingroup', function(data) {
        return emitSub('begingroup', data);
      });
      node.component.network.on('data', function(data) {
        return emitSub('data', data);
      });
      node.component.network.on('endgroup', function(data) {
        return emitSub('endgroup', data);
      });
      node.component.network.on('disconnect', function(data) {
        return emitSub('disconnect', data);
      });
      return node.component.network.on('process-error', function(data) {
        return emitSub('process-error', data);
      });
    };

    Network.prototype.subscribeSocket = function(socket) {
      socket.on('connect', (function(_this) {
        return function() {
          _this.increaseConnections();
          return _this.emit('connect', {
            id: socket.getId(),
            socket: socket,
            metadata: socket.metadata
          });
        };
      })(this));
      socket.on('begingroup', (function(_this) {
        return function(group) {
          return _this.emit('begingroup', {
            id: socket.getId(),
            socket: socket,
            group: group,
            metadata: socket.metadata
          });
        };
      })(this));
      socket.on('data', (function(_this) {
        return function(data) {
          return _this.emit('data', {
            id: socket.getId(),
            socket: socket,
            data: data,
            metadata: socket.metadata
          });
        };
      })(this));
      socket.on('endgroup', (function(_this) {
        return function(group) {
          return _this.emit('endgroup', {
            id: socket.getId(),
            socket: socket,
            group: group,
            metadata: socket.metadata
          });
        };
      })(this));
      socket.on('disconnect', (function(_this) {
        return function() {
          _this.decreaseConnections();
          return _this.emit('disconnect', {
            id: socket.getId(),
            socket: socket,
            metadata: socket.metadata
          });
        };
      })(this));
      return socket.on('error', (function(_this) {
        return function(event) {
          if (_this.listeners('process-error').length === 0) {
            if (event.id && event.metadata && event.error) {
              throw event.error;
            }
            throw event;
          }
          return _this.emit('process-error', event);
        };
      })(this));
    };

    Network.prototype.subscribeNode = function(node) {
      if (!node.component.getIcon) {
        return;
      }
      return node.component.on('icon', (function(_this) {
        return function() {
          return _this.emit('icon', {
            id: node.id,
            icon: node.component.getIcon()
          });
        };
      })(this));
    };

    Network.prototype.addEdge = function(edge, callback) {
      var from, socket, to;
      socket = internalSocket.createSocket(edge.metadata);
      socket.setDebug(this.debug);
      from = this.getNode(edge.from.node);
      if (!from) {
        return callback(new Error("No process defined for outbound node " + edge.from.node));
      }
      if (!from.component) {
        return callback(new Error("No component defined for outbound node " + edge.from.node));
      }
      if (!from.component.isReady()) {
        from.component.once("ready", (function(_this) {
          return function() {
            return _this.addEdge(edge, callback);
          };
        })(this));
        return;
      }
      to = this.getNode(edge.to.node);
      if (!to) {
        return callback(new Error("No process defined for inbound node " + edge.to.node));
      }
      if (!to.component) {
        return callback(new Error("No component defined for inbound node " + edge.to.node));
      }
      if (!to.component.isReady()) {
        to.component.once("ready", (function(_this) {
          return function() {
            return _this.addEdge(edge, callback);
          };
        })(this));
        return;
      }
      this.subscribeSocket(socket);
      this.connectPort(socket, to, edge.to.port, edge.to.index, true);
      this.connectPort(socket, from, edge.from.port, edge.from.index, false);
      this.connections.push(socket);
      if (callback) {
        return callback();
      }
    };

    Network.prototype.removeEdge = function(edge, callback) {
      var connection, i, len, ref, results;
      ref = this.connections;
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        connection = ref[i];
        if (!connection) {
          continue;
        }
        if (!(edge.to.node === connection.to.process.id && edge.to.port === connection.to.port)) {
          continue;
        }
        connection.to.process.component.inPorts[connection.to.port].detach(connection);
        if (edge.from.node) {
          if (connection.from && edge.from.node === connection.from.process.id && edge.from.port === connection.from.port) {
            connection.from.process.component.outPorts[connection.from.port].detach(connection);
          }
        }
        this.connections.splice(this.connections.indexOf(connection), 1);
        if (callback) {
          results.push(callback());
        } else {
          results.push(void 0);
        }
      }
      return results;
    };

    Network.prototype.addDefaults = function(node, callback) {
      var key, port, process, ref, socket;
      process = this.processes[node.id];
      if (!process.component.isReady()) {
        if (process.component.setMaxListeners) {
          process.component.setMaxListeners(0);
        }
        process.component.once("ready", (function(_this) {
          return function() {
            return _this.addDefaults(process, callback);
          };
        })(this));
        return;
      }
      ref = process.component.inPorts.ports;
      for (key in ref) {
        port = ref[key];
        if (typeof port.hasDefault === 'function' && port.hasDefault() && !port.isAttached()) {
          socket = internalSocket.createSocket();
          socket.setDebug(this.debug);
          this.subscribeSocket(socket);
          this.connectPort(socket, process, key, void 0, true);
          this.connections.push(socket);
          this.defaults.push(socket);
        }
      }
      if (callback) {
        return callback();
      }
    };

    Network.prototype.addInitial = function(initializer, callback) {
      var init, socket, to;
      socket = internalSocket.createSocket(initializer.metadata);
      socket.setDebug(this.debug);
      this.subscribeSocket(socket);
      to = this.getNode(initializer.to.node);
      if (!to) {
        return callback(new Error("No process defined for inbound node " + initializer.to.node));
      }
      if (!(to.component.isReady() || to.component.inPorts[initializer.to.port])) {
        if (to.component.setMaxListeners) {
          to.component.setMaxListeners(0);
        }
        to.component.once("ready", (function(_this) {
          return function() {
            return _this.addInitial(initializer, callback);
          };
        })(this));
        return;
      }
      this.connectPort(socket, to, initializer.to.port, initializer.to.index, true);
      this.connections.push(socket);
      init = {
        socket: socket,
        data: initializer.from.data
      };
      this.initials.push(init);
      this.nextInitials.push(init);
      if (this.isStarted()) {
        this.sendInitials();
      }
      if (callback) {
        return callback();
      }
    };

    Network.prototype.removeInitial = function(initializer, callback) {
      var connection, i, init, j, k, len, len1, len2, ref, ref1, ref2;
      ref = this.connections;
      for (i = 0, len = ref.length; i < len; i++) {
        connection = ref[i];
        if (!connection) {
          continue;
        }
        if (!(initializer.to.node === connection.to.process.id && initializer.to.port === connection.to.port)) {
          continue;
        }
        connection.to.process.component.inPorts[connection.to.port].detach(connection);
        this.connections.splice(this.connections.indexOf(connection), 1);
        ref1 = this.initials;
        for (j = 0, len1 = ref1.length; j < len1; j++) {
          init = ref1[j];
          if (!init) {
            continue;
          }
          if (init.socket !== connection) {
            continue;
          }
          this.initials.splice(this.initials.indexOf(init), 1);
        }
        ref2 = this.nextInitials;
        for (k = 0, len2 = ref2.length; k < len2; k++) {
          init = ref2[k];
          if (!init) {
            continue;
          }
          if (init.socket !== connection) {
            continue;
          }
          this.nextInitials.splice(this.nextInitials.indexOf(init), 1);
        }
      }
      if (callback) {
        return callback();
      }
    };

    Network.prototype.sendInitial = function(initial) {
      initial.socket.connect();
      initial.socket.send(initial.data);
      return initial.socket.disconnect();
    };

    Network.prototype.sendInitials = function(callback) {
      var send;
      if (!callback) {
        callback = function() {};
      }
      send = (function(_this) {
        return function() {
          var i, initial, len, ref;
          ref = _this.initials;
          for (i = 0, len = ref.length; i < len; i++) {
            initial = ref[i];
            _this.sendInitial(initial);
          }
          _this.initials = [];
          return callback();
        };
      })(this);
      if (typeof process !== 'undefined' && process.execPath && process.execPath.indexOf('node') !== -1) {
        return process.nextTick(send);
      } else {
        return setTimeout(send, 0);
      }
    };

    Network.prototype.isStarted = function() {
      return this.started;
    };

    Network.prototype.isRunning = function() {
      if (!this.started) {
        return false;
      }
      return this.connectionCount > 0;
    };

    Network.prototype.startComponents = function(callback) {
      var count, id, length, onProcessStart, process, ref, results;
      if (!callback) {
        callback = function() {};
      }
      count = 0;
      length = this.processes ? Object.keys(this.processes).length : 0;
      onProcessStart = function() {
        count++;
        if (count === length) {
          return callback();
        }
      };
      if (!(this.processes && Object.keys(this.processes).length)) {
        return callback();
      }
      ref = this.processes;
      results = [];
      for (id in ref) {
        process = ref[id];
        process.component.on('start', onProcessStart);
        results.push(process.component.start());
      }
      return results;
    };

    Network.prototype.sendDefaults = function(callback) {
      var i, len, ref, socket;
      if (!callback) {
        callback = function() {};
      }
      if (!this.defaults.length) {
        return callback();
      }
      ref = this.defaults;
      for (i = 0, len = ref.length; i < len; i++) {
        socket = ref[i];
        if (socket.to.process.component.inPorts[socket.to.port].sockets.length !== 1) {
          continue;
        }
        socket.connect();
        socket.send();
        socket.disconnect();
      }
      return callback();
    };

    Network.prototype.start = function(callback) {
      if (!callback) {
        platform.deprecated('Calling network.start() without callback is deprecated');
        callback = function() {};
      }
      if (this.started) {
        this.stop((function(_this) {
          return function(err) {
            if (err) {
              return callback(err);
            }
            return _this.start(callback);
          };
        })(this));
        return;
      }
      this.initials = this.nextInitials.slice(0);
      return this.startComponents((function(_this) {
        return function(err) {
          if (err) {
            return callback(err);
          }
          return _this.sendInitials(function(err) {
            if (err) {
              return callback(err);
            }
            return _this.sendDefaults(function(err) {
              if (err) {
                return callback(err);
              }
              _this.setStarted(true);
              return callback(null);
            });
          });
        };
      })(this));
    };

    Network.prototype.stop = function(callback) {
      var connection, count, i, id, len, length, onProcessEnd, process, ref, ref1, results;
      if (!callback) {
        platform.deprecated('Calling network.stop() without callback is deprecated');
        callback = function() {};
      }
      ref = this.connections;
      for (i = 0, len = ref.length; i < len; i++) {
        connection = ref[i];
        if (!connection.isConnected()) {
          continue;
        }
        connection.disconnect();
      }
      count = 0;
      length = this.processes ? Object.keys(this.processes).length : 0;
      onProcessEnd = (function(_this) {
        return function() {
          count++;
          if (count === length) {
            _this.setStarted(false);
            return callback();
          }
        };
      })(this);
      if (!(this.processes && Object.keys(this.processes).length)) {
        this.setStarted(false);
        return callback();
      }
      ref1 = this.processes;
      results = [];
      for (id in ref1) {
        process = ref1[id];
        process.component.on('end', onProcessEnd);
        results.push(process.component.shutdown());
      }
      return results;
    };

    Network.prototype.setStarted = function(started) {
      if (this.started === started) {
        return;
      }
      if (!started) {
        this.started = false;
        this.emit('end', {
          start: this.startupDate,
          end: new Date,
          uptime: this.uptime()
        });
        return;
      }
      if (!this.startupDate) {
        this.startupDate = new Date;
      }
      this.started = true;
      return this.emit('start', {
        start: this.startupDate
      });
    };

    Network.prototype.getDebug = function() {
      return this.debug;
    };

    Network.prototype.setDebug = function(active) {
      var i, instance, len, process, processId, ref, ref1, results, socket;
      if (active === this.debug) {
        return;
      }
      this.debug = active;
      ref = this.connections;
      for (i = 0, len = ref.length; i < len; i++) {
        socket = ref[i];
        socket.setDebug(active);
      }
      ref1 = this.processes;
      results = [];
      for (processId in ref1) {
        process = ref1[processId];
        instance = process.component;
        if (instance.isSubgraph()) {
          results.push(instance.network.setDebug(active));
        } else {
          results.push(void 0);
        }
      }
      return results;
    };

    return Network;

  })(EventEmitter);

  exports.Network = Network;

}).call(this);
