/*
#     CloudBoost Flow - Flow-Based Programming for JavaScript
#     (c) 2014 HackerBay, Inc. 
#     CloudBoost Flow may be freely distributed under the Apache 2 License
*/
let internalSocket = require("./InternalSocket");
let graph = require("./Graph");
let { EventEmitter } = require('events');
let platform = require('./Platform');
let componentLoader = require('./ComponentLoader');
let utils = require('./Utils');

// ## The Flow network coordinator
//
// Flow networks consist of processes connected to each other
// via sockets attached from outports to inports.
//
// The role of the network coordinator is to take a graph and
// instantiate all the necessary processes from the designated
// components, attach sockets between them, and handle the sending
// of Initial Information Packets.
class Network extends EventEmitter {

  // All Flow networks are instantiated with a graph. Upon instantiation
  // they will load all the needed components, instantiate them, and
  // set up the defined connections and IIPs.
  //
  // The network will also listen to graph changes and modify itself
  // accordingly, including removing connections, adding new nodes,
  // and sending new IIPs.
  constructor(graph, options) {
    //init. 

    // Processes contains all the instantiated components for this network
    this.processes = {};
    // Connections contains all the socket connections in the network
    this.connections = [];
    // Initials contains all Initial Information Packets (IIPs)
    this.initials = [];
    // Container to hold sockets that will be sending default data.
    this.defaults = [];
    // The Graph this network is instantiated with
    this.graph = null;
    // Start-up timestamp for the network, used for calculating uptime
    this.startupDate = null;
    this.portBuffer = {};

    if (!options)
      options = {};

    this.options = options;
    this.processes = {};
    this.connections = [];
    this.initials = [];
    this.nextInitials = [];
    this.defaults = [];
    this.graph = graph;
    this.started = false;
    this.debug = true;
    this.connectionCount = 0;

    // On Node.js we default the baseDir for component loading to
    // the current working directory
    if (!platform.isBrowser()) {
      this.baseDir = graph.baseDir || process.cwd();
      // On browser we default the baseDir to the Component loading
      // root
    } else {
      this.baseDir = graph.baseDir || '/';
    }

    // As most Flow networks are long-running processes, the
    // network coordinator marks down the start-up time. This
    // way we can calculate the uptime of the network.
    this.startupDate = null;

    // Initialize a Component Loader for the network
    if (graph.componentLoader) {
      this.loader = graph.componentLoader;
    } else {
      this.loader = new componentLoader.ComponentLoader(this.baseDir, this.options);
    }
  }

  // The uptime of the network is the current time minus the start-up
  // time, in seconds.
  uptime() {
    if (!this.startupDate) { return 0; }
    return new Date() - this.startupDate;
  }

  // Emit a 'start' event on the first connection, and 'end' event when
  // last connection has been closed
  increaseConnections() {
    if (this.connectionCount === 0) {
      // First connection opened, execution has now started
      this.setStarted(true);
    }
    return this.connectionCount++;
  }
  decreaseConnections() {
    this.connectionCount--;
    if (this.connectionCount) { return; }
    // Last connection closed, execution has now ended
    // We do this in debounced way in case there is an in-flight operation still
    if (!this.debouncedEnd) {
      this.debouncedEnd = utils.debounce(() => {
        if (this.connectionCount) { return; }
        return this.setStarted(false);
      }
        , 50);
    }
    return this.debouncedEnd();
  }

  // ## Loading components
  //
  // Components can be passed to the Flow network in two ways:
  //
  // * As direct, instantiated JavaScript objects
  // * As filenames
  load(component, metadata, callback) {
    return this.loader.load(component, callback, metadata);
  }

  // ## Add a process to the network
  //
  // Processes can be added to a network at either start-up time
  // or later. The processes are added with a node definition object
  // that includes the following properties:
  //
  // * `id`: Identifier of the process in the network. Typically a string
  // * `component`: Filename or path of a Flow component, or a component instance object
  addNode(node, callback) {
    // Processes are treated as singletons by their identifier. If
    // we already have a process with the given ID, return that.
    if (this.processes[node.id]) {
      if (callback) { callback(null, this.processes[node.id]); }
      return;
    }

    let process =
      { id: node.id };

    // No component defined, just register the process but don't start.
    if (!node.component) {
      this.processes[process.id] = process;
      callback(null, process);
      return;
    }

    // Load the component for the process.
    return this.load(node.component, node.metadata, (err, instance) => {
      if (err) { return callback(err); }
      instance.nodeId = node.id;
      process.component = instance;

      // Inform the ports of the node name
      // FIXME: direct process.component.inPorts/outPorts access is only for legacy compat
      let inPorts = process.component.inPorts.ports || process.component.inPorts;
      let outPorts = process.component.outPorts.ports || process.component.outPorts;
      for (var name in inPorts) {
        var port = inPorts[name];
        port.node = node.id;
        port.nodeInstance = instance;
        port.name = name;
      }

      for (name in outPorts) {
        var port = outPorts[name];
        port.node = node.id;
        port.nodeInstance = instance;
        port.name = name;
      }

      if (instance.isSubgraph()) { this.subscribeSubgraph(process); }

      this.subscribeNode(process);

      // Store and return the process instance
      this.processes[process.id] = process;
      return callback(null, process);
    }
    );
  }

  removeNode(node, callback) {
    if (!this.processes[node.id]) {
      return callback(new Error(`Node ${node.id} not found`));
    }
    this.processes[node.id].component.shutdown();
    delete this.processes[node.id];
    if (callback) { return callback(null); }
  }

  renameNode(oldId, newId, callback) {
    let process = this.getNode(oldId);
    if (!process) { return callback(new Error(`Process ${oldId} not found`)); }

    // Inform the process of its ID
    process.id = newId;

    // Inform the ports of the node name
    // FIXME: direct process.component.inPorts/outPorts access is only for legacy compat
    let inPorts = process.component.inPorts.ports || process.component.inPorts;
    let outPorts = process.component.outPorts.ports || process.component.outPorts;
    for (var name in inPorts) {
      var port = inPorts[name];
      port.node = newId;
    }
    for (name in outPorts) {
      var port = outPorts[name];
      port.node = newId;
    }

    this.processes[newId] = process;
    delete this.processes[oldId];
    if (callback) { return callback(null); }
  }

  // Get process by its ID.
  getNode(id) {
    return this.processes[id];
  }

  connect(done = function () { }) {
    // Wrap the future which will be called when done in a function and return
    // it
    let callStack = 0;
    let serialize = (next, add) => {
      return type => {
        // Add either a Node, an Initial, or an Edge and move on to the next one
        // when done
        return this[`add${type}`](add, function (err) {
          if (err) { console.log(err); }
          if (err) { return done(err); }
          callStack++;
          if (callStack % 100 === 0) {
            setTimeout(() => next(type)
              , 0);
            return;
          }
          return next(type);
        }
        );
      };
    };

    // Subscribe to graph changes when everything else is done
    let subscribeGraph = () => {
      this.subscribeGraph();
      return done();
    };

    // Serialize default socket creation then call callback when done
    let setDefaults = utils.reduceRight(this.graph.nodes, serialize, subscribeGraph);

    // Serialize initializers then call defaults.
    let initializers = utils.reduceRight(this.graph.initializers, serialize, () => setDefaults("Defaults"));

    // Serialize edge creators then call the initializers.
    let edges = utils.reduceRight(this.graph.edges, serialize, () => initializers("Initial"));

    // Serialize node creators then call the edge creators
    let nodes = utils.reduceRight(this.graph.nodes, serialize, () => edges("Edge"));
    // Start with node creators
    return nodes("Node");
  }

  connectPort(socket, process, port, index, inbound) {
    if (inbound) {
      socket.to = {
        process,
        port,
        index
      };

      if (!process.component.inPorts || !process.component.inPorts[port]) {
        throw new Error(`No inport '${port}' defined in process ${process.id} (${socket.getId()})`);
      }
      if (process.component.inPorts[port].isAddressable()) {
        return process.component.inPorts[port].attach(socket, index);
      }
      return process.component.inPorts[port].attach(socket);
    }

    socket.from = {
      process,
      port,
      index
    };

    if (!process.component.outPorts || !process.component.outPorts[port]) {
      throw new Error(`No outport '${port}' defined in process ${process.id} (${socket.getId()})`);
    }

    if (process.component.outPorts[port].isAddressable()) {
      return process.component.outPorts[port].attach(socket, index);
    }
    return process.component.outPorts[port].attach(socket);
  }

  subscribeGraph() {
    // A Flow graph may change after network initialization.
    // For this, the network subscribes to the change events from
    // the graph.
    //
    // In graph we talk about nodes and edges. Nodes correspond
    // to Flow processes, and edges to connections between them.
    let graphOps = [];
    let processing = false;
    let registerOp = (op, details) =>
      graphOps.push({
        op,
        details
      })
      ;
    let processOps = err => {
      if (err) {
        if (this.listeners('process-error').length === 0) { throw err; }
        this.emit('process-error', err);
      }

      if (!graphOps.length) {
        processing = false;
        return;
      }
      processing = true;
      let op = graphOps.shift();
      let cb = processOps;
      switch (op.op) {
        case 'renameNode':
          return this.renameNode(op.details.from, op.details.to, cb);
        default:
          return this[op.op](op.details, cb);
      }
    };

    this.graph.on('addNode', node => {
      if (!processing) {
        processOps();
      }
      return registerOp('addNode', node);
    }
    );

    this.graph.on('removeNode', node => {
      if (!processing) {
        processOps();
      }
      return registerOp('removeNode', node);
    }
    );

    this.graph.on('renameNode', (oldId, newId) => {
      if (!processing) {
        processOps();
      }
      return registerOp('renameNode', {
        from: oldId,
        to: newId
      }
      );
    }
    );

    this.graph.on('addEdge', edge => {
      if (!processing) {
        processOps();
      }
      return registerOp('addEdge', edge);
    }
    );

    this.graph.on('removeEdge', edge => {
      if (!processing) {
        processOps();
      }
      return registerOp('removeEdge', edge);
    }
    );

    this.graph.on('addInitial', iip => {
      if (!processing) {
        processOps();
      }
      return registerOp('addInitial', iip);
    }
    );

    return this.graph.on('removeInitial', iip => {
      if (!processing) {
        processOps();
      }
      return registerOp('removeInitial', iip);
    }
    );
  }


  subscribeSubgraph(node) {
    if (!node.component.isReady()) {
      node.component.once('ready', () => {
        return this.subscribeSubgraph(node);
      }
      );
      return;
    }

    if (!node.component.network) { return; }

    node.component.network.setDebug(this.debug);

    let emitSub = (type, data) => {
      if (type === 'process-error' && this.listeners('process-error').length === 0) {
        if (data.id && data.metadata && data.error) { throw data.error; }
        throw data;
      }
      if (type === 'connect') { this.increaseConnections(); }
      if (type === 'disconnect') { this.decreaseConnections(); }
      if (!data) { data = {}; }
      if (data.subgraph) {
        if (!data.subgraph.unshift) {
          data.subgraph = [data.subgraph];
        }
        data.subgraph = data.subgraph.unshift(node.id);
      } else {
        data.subgraph = [node.id];
      }
      return this.emit(type, data);
    };

    node.component.network.on('connect', data => emitSub('connect', data));
    node.component.network.on('begingroup', data => emitSub('begingroup', data));
    node.component.network.on('data', data => emitSub('data', data));
    node.component.network.on('endgroup', data => emitSub('endgroup', data));
    node.component.network.on('disconnect', data => emitSub('disconnect', data));
    return node.component.network.on('process-error', data => emitSub('process-error', data)
    );
  }

  // Subscribe to events from all connected sockets and re-emit them
  subscribeSocket(socket) {
    socket.on('connect', () => {
      this.increaseConnections();
      return this.emit('connect', {
        id: socket.getId(),
        socket,
        metadata: socket.metadata
      }
      );
    }
    );
    socket.on('begingroup', group => {
      return this.emit('begingroup', {
        id: socket.getId(),
        socket,
        group,
        metadata: socket.metadata
      }
      );
    }
    );
    socket.on('data', data => {
      return this.emit('data', {
        id: socket.getId(),
        socket,
        data,
        metadata: socket.metadata
      }
      );
    }
    );
    socket.on('endgroup', group => {
      return this.emit('endgroup', {
        id: socket.getId(),
        socket,
        group,
        metadata: socket.metadata
      }
      );
    }
    );
    socket.on('disconnect', () => {
      this.decreaseConnections();
      return this.emit('disconnect', {
        id: socket.getId(),
        socket,
        metadata: socket.metadata
      }
      );
    }
    );
    return socket.on('error', event => {
      if (this.listeners('process-error').length === 0) {
        if (event.id && event.metadata && event.error) { throw event.error; }
        throw event;
      }
      return this.emit('process-error', event);
    }
    );
  }

  subscribeNode(node) {
    if (!node.component.getIcon) { return; }
    return node.component.on('icon', () => {
      return this.emit('icon', {
        id: node.id,
        icon: node.component.getIcon()
      }
      );
    }
    );
  }

  addEdge(edge, callback) {
    let socket = internalSocket.createSocket(edge.metadata);
    socket.setDebug(this.debug);

    let from = this.getNode(edge.from.node);
    if (!from) {
      return callback(new Error(`No process defined for outbound node ${edge.from.node}`));
    }
    if (!from.component) {
      return callback(new Error(`No component defined for outbound node ${edge.from.node}`));
    }
    if (!from.component.isReady()) {
      from.component.once("ready", () => {
        return this.addEdge(edge, callback);
      }
      );

      return;
    }

    let to = this.getNode(edge.to.node);
    if (!to) {
      return callback(new Error(`No process defined for inbound node ${edge.to.node}`));
    }
    if (!to.component) {
      return callback(new Error(`No component defined for inbound node ${edge.to.node}`));
    }
    if (!to.component.isReady()) {
      to.component.once("ready", () => {
        return this.addEdge(edge, callback);
      }
      );

      return;
    }

    // Subscribe to events from the socket
    this.subscribeSocket(socket);

    this.connectPort(socket, to, edge.to.port, edge.to.index, true);
    this.connectPort(socket, from, edge.from.port, edge.from.index, false);

    this.connections.push(socket);
    if (callback) { return callback(); }
  }

  removeEdge(edge, callback) {
    return (() => {
      let result = [];
      for (let i = 0; i < this.connections.length; i++) {
        let connection = this.connections[i];
        let item;
        if (!connection) { continue; }
        if (edge.to.node !== connection.to.process.id || edge.to.port !== connection.to.port) { continue; }
        connection.to.process.component.inPorts[connection.to.port].detach(connection);
        if (edge.from.node) {
          if (connection.from && edge.from.node === connection.from.process.id && edge.from.port === connection.from.port) {
            connection.from.process.component.outPorts[connection.from.port].detach(connection);
          }
        }
        this.connections.splice(this.connections.indexOf(connection), 1);
        if (callback) { item = callback(); }
        result.push(item);
      }
      return result;
    })();
  }

  addDefaults(node, callback) {

    let process = this.processes[node.id];

    if (!process.component.isReady()) {
      if (process.component.setMaxListeners) { process.component.setMaxListeners(0); }
      process.component.once("ready", () => {
        return this.addDefaults(process, callback);
      }
      );
      return;
    }

    for (let key in process.component.inPorts.ports) {
      // Attach a socket to any defaulted inPorts as long as they aren't already attached.
      // TODO: hasDefault existence check is for backwards compatibility, clean
      //       up when legacy ports are removed.
      let port = process.component.inPorts.ports[key];
      if (typeof port.hasDefault === 'function' && port.hasDefault() && !port.isAttached()) {
        let socket = internalSocket.createSocket();
        socket.setDebug(this.debug);

        // Subscribe to events from the socket
        this.subscribeSocket(socket);

        this.connectPort(socket, process, key, undefined, true);

        this.connections.push(socket);

        this.defaults.push(socket);
      }
    }

    if (callback) { return callback(); }
  }

  addInitial(initializer, callback) {
    let socket = internalSocket.createSocket(initializer.metadata);
    socket.setDebug(this.debug);

    // Subscribe to events from the socket
    this.subscribeSocket(socket);

    let to = this.getNode(initializer.to.node);
    if (!to) {
      return callback(new Error(`No process defined for inbound node ${initializer.to.node}`));
    }

    if (!to.component.isReady() && !to.component.inPorts[initializer.to.port]) {
      if (to.component.setMaxListeners) { to.component.setMaxListeners(0); }
      to.component.once("ready", () => {
        return this.addInitial(initializer, callback);
      }
      );
      return;
    }

    this.connectPort(socket, to, initializer.to.port, initializer.to.index, true);

    this.connections.push(socket);

    let init = {
      socket,
      data: initializer.from.data
    };
    this.initials.push(init);
    this.nextInitials.push(init);

    if (this.isStarted()) { this.sendInitials(); }

    if (callback) { return callback(); }
  }

  removeInitial(initializer, callback) {
    for (let i = 0; i < this.connections.length; i++) {
      let connection = this.connections[i];
      if (!connection) { continue; }
      if (initializer.to.node !== connection.to.process.id || initializer.to.port !== connection.to.port) { continue; }
      connection.to.process.component.inPorts[connection.to.port].detach(connection);
      this.connections.splice(this.connections.indexOf(connection), 1);

      for (let j = 0; j < this.initials.length; j++) {
        var init = this.initials[j];
        if (!init) { continue; }
        if (init.socket !== connection) { continue; }
        this.initials.splice(this.initials.indexOf(init), 1);
      }
      for (let k = 0; k < this.nextInitials.length; k++) {
        var init = this.nextInitials[k];
        if (!init) { continue; }
        if (init.socket !== connection) { continue; }
        this.nextInitials.splice(this.nextInitials.indexOf(init), 1);
      }
    }

    if (callback) { return callback(); }
  }

  sendInitial(initial) {
    initial.socket.connect();
    initial.socket.send(initial.data);
    return initial.socket.disconnect();
  }

  sendInitials(callback) {
    if (!callback) {
      callback = function () { };
    }

    let send = () => {
      for (let i = 0; i < this.initials.length; i++) { let initial = this.initials[i]; this.sendInitial(initial); }
      this.initials = [];
      return callback();
    };

    if (typeof process !== 'undefined' && process.execPath && process.execPath.indexOf('node') !== -1) {
      // nextTick is faster on Node.js
      return process.nextTick(send);
    } else {
      return setTimeout(send, 0);
    }
  }

  isStarted() {
    return this.started;
  }

  isRunning() {
    if (!this.started) { return false; }
    return this.connectionCount > 0;
  }

  startComponents(callback) {
    if (!callback) {
      callback = function () { };
    }

    // Perform any startup routines necessary for every component.
    for (let id in this.processes) {
      let process = this.processes[id];
      process.component.start();
    }
    return callback();
  }

  sendDefaults(callback) {
    if (!callback) {
      callback = function () { };
    }

    if (!this.defaults.length) { return callback(); }

    for (let i = 0; i < this.defaults.length; i++) {
      // Don't send defaults if more than one socket is present on the port.
      // This case should only happen when a subgraph is created as a component
      // as its network is instantiated and its inputs are serialized before
      // a socket is attached from the "parent" graph.
      let socket = this.defaults[i];
      if (socket.to.process.component.inPorts[socket.to.port].sockets.length !== 1) { continue; }
      socket.connect();
      socket.send();
      socket.disconnect();
    }

    return callback();
  }

  start(callback) {
    if (!callback) {
      platform.deprecated('Calling network.start() without callback is deprecated');
      callback = function () { };
    }

    if (this.started) {
      this.stop(err => {
        if (err) { return callback(err); }
        return this.start(callback);
      }
      );
      return;
    }

    this.initials = this.nextInitials.slice(0);
    return this.startComponents(err => {
      if (err) { return callback(err); }
      return this.sendInitials(err => {
        if (err) { return callback(err); }
        return this.sendDefaults(err => {
          if (err) { return callback(err); }
          this.setStarted(true);
          return callback(null);
        }
        );
      }
      );
    }
    );
  }

  stop(callback) {
    if (!callback) {
      platform.deprecated('Calling network.stop() without callback is deprecated');
      callback = function () { };
    }

    // Disconnect all connections
    for (let i = 0; i < this.connections.length; i++) {
      let connection = this.connections[i];
      if (!connection.isConnected()) { continue; }
      connection.disconnect();
    }
    // Tell processes to shut down
    for (let id in this.processes) {
      let process = this.processes[id];
      process.component.shutdown();
    }
    this.setStarted(false);
    return callback();
  }

  setStarted(started) {
    if (this.started === started) { return; }
    if (!started) {
      // Ending the execution
      this.started = false;
      this.emit('end', {
        start: this.startupDate,
        end: new Date(),
        uptime: this.uptime()
      }
      );
      return;
    }

    // Starting the execution
    if (!this.startupDate) { this.startupDate = new Date(); }
    this.started = true;
    return this.emit('start',
      { start: this.startupDate });
  }

  getDebug() {
    return this.debug;
  }

  setDebug(active) {
    if (active === this.debug) { return; }
    this.debug = active;

    for (let i = 0; i < this.connections.length; i++) {
      let socket = this.connections[i];
      socket.setDebug(active);
    }
    return (() => {
      let result = [];
      for (let processId in this.processes) {
        let process = this.processes[processId];
        let item;
        let instance = process.component;
        if (instance.isSubgraph()) { item = instance.network.setDebug(active); }
        result.push(item);
      }
      return result;
    })();
  }
}

module.exports = Network;
