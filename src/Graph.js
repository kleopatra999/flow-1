//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2016 TheGrid (Rituwall Inc.)
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
//
// NoFlo graphs are Event Emitters, providing signals when the graph
// definition changes.
//
import { EventEmitter } from 'events';

import { clone } from './Utils';
import platform from './Platform';

// This class represents an abstract NoFlo graph containing nodes
// connected to each other with edges.
//
// These graphs can be used for visualization and sketching, but
// also are the way to start a NoFlo network.
class Graph extends EventEmitter {
  name = '';
  caseSensitive = false;
  properties = {};
  nodes = [];
  edges = [];
  initializers = [];
  exports = [];
  inports = {};
  outports = {};
  groups = [];

  // ## Creating new graphs
  //
  // Graphs are created by simply instantiating the Graph class
  // and giving it a name:
  //
  //     myGraph = new Graph 'My very cool graph'
  constructor(name, options) {
    this.name = name;
    if(!this.name) {
      this.name = '';
    }
    if(!options) {
      options = {};
    }
    this.properties = {};
    this.nodes = [];
    this.edges = [];
    this.initializers = [];
    this.exports = [];
    this.inports = {};
    this.outports = {};
    this.groups = [];
    this.transaction = {
      id: null,
      depth: 0
    };

    this.caseSensitive = options.caseSensitive || false;
  }

  getPortName(port) {
    if (this.caseSensitive) { return port; } else { return port.toLowerCase(); }
  }

  // ## Group graph changes into transactions
  //
  // If no transaction is explicitly opened, each call to
  // the graph API will implicitly create a transaction for that change
  startTransaction(id, metadata) {
    if (this.transaction.id) {
      throw Error("Nested transactions not supported");
    }

    this.transaction.id = id;
    this.transaction.depth = 1;
    return this.emit('startTransaction', id, metadata);
  }

  endTransaction(id, metadata) {
    if (!this.transaction.id) {
      throw Error("Attempted to end non-existing transaction");
    }

    this.transaction.id = null;
    this.transaction.depth = 0;
    return this.emit('endTransaction', id, metadata);
  }

  checkTransactionStart() {
    if (!this.transaction.id) {
      return this.startTransaction('implicit');
    } else if (this.transaction.id === 'implicit') {
      return this.transaction.depth += 1;
    }
  }

  checkTransactionEnd() {
    if (this.transaction.id === 'implicit') {
      this.transaction.depth -= 1;
    }
    if (this.transaction.depth === 0) {
      return this.endTransaction('implicit');
    }
  }

  // ## Modifying Graph properties
  //
  // This method allows changing properties of the graph.
  setProperties(properties) {
    this.checkTransactionStart();
    let before = clone(this.properties);
    for (let item in properties) {
      let val = properties[item];
      this.properties[item] = val;
    }
    this.emit('changeProperties', this.properties, before);
    return this.checkTransactionEnd();
  }

  // ## Exporting a port from subgraph
  //
  // This allows subgraphs to expose a cleaner API by having reasonably
  // named ports shown instead of all the free ports of the graph
  //
  // The ports exported using this way are ambiguous in their direciton. Use
  // `addInport` or `addOutport` instead to disambiguate.
  addExport(publicPort, nodeKey, portKey, metadata = {x:0,y:0}) {
    platform.deprecated('noflo.Graph exports is deprecated: please use specific inport or outport instead');
    // Check that node exists
    if (!this.getNode(nodeKey)) { return; }

    this.checkTransactionStart();

    let exported = {
      public: this.getPortName(publicPort),
      process: nodeKey,
      port: this.getPortName(portKey),
      metadata
    };
    this.exports.push(exported);
    this.emit('addExport', exported);

    return this.checkTransactionEnd();
  }

  removeExport(publicPort) {
    platform.deprecated('noflo.Graph exports is deprecated: please use specific inport or outport instead');
    publicPort = this.getPortName(publicPort);
    let found = null;
    for (let idx = 0; idx < this.exports.length; idx++) {
      let exported = this.exports[idx];
      if (exported.public === publicPort) { found = exported; }
    }

    if (!found) { return; }
    this.checkTransactionStart();
    this.exports.splice(this.exports.indexOf(found), 1);
    this.emit('removeExport', found);
    return this.checkTransactionEnd();
  }

  addInport(publicPort, nodeKey, portKey, metadata) {
    // Check that node exists
    if (!this.getNode(nodeKey)) { return; }

    publicPort = this.getPortName(publicPort);
    this.checkTransactionStart();
    this.inports[publicPort] = {
      process: nodeKey,
      port: this.getPortName(portKey),
      metadata
    };
    this.emit('addInport', publicPort, this.inports[publicPort]);
    return this.checkTransactionEnd();
  }

  removeInport(publicPort) {
    publicPort = this.getPortName(publicPort);
    if (!this.inports[publicPort]) { return; }

    this.checkTransactionStart();
    let port = this.inports[publicPort];
    this.setInportMetadata(publicPort, {});
    delete this.inports[publicPort];
    this.emit('removeInport', publicPort, port);
    return this.checkTransactionEnd();
  }

  renameInport(oldPort, newPort) {
    oldPort = this.getPortName(oldPort);
    newPort = this.getPortName(newPort);
    if (!this.inports[oldPort]) { return; }

    this.checkTransactionStart();
    this.inports[newPort] = this.inports[oldPort];
    delete this.inports[oldPort];
    this.emit('renameInport', oldPort, newPort);
    return this.checkTransactionEnd();
  }

  setInportMetadata(publicPort, metadata) {
    publicPort = this.getPortName(publicPort);
    if (!this.inports[publicPort]) { return; }

    this.checkTransactionStart();
    let before = clone(this.inports[publicPort].metadata);
    if (!this.inports[publicPort].metadata) { this.inports[publicPort].metadata = {}; }
    for (let item in metadata) {
      let val = metadata[item];
      if (val != null) {
        this.inports[publicPort].metadata[item] = val;
      } else {
        delete this.inports[publicPort].metadata[item];
      }
    }
    this.emit('changeInport', publicPort, this.inports[publicPort], before);
    return this.checkTransactionEnd();
  }

  addOutport(publicPort, nodeKey, portKey, metadata) {
    // Check that node exists
    if (!this.getNode(nodeKey)) { return; }

    publicPort = this.getPortName(publicPort);
    this.checkTransactionStart();
    this.outports[publicPort] = {
      process: nodeKey,
      port: this.getPortName(portKey),
      metadata
    };
    this.emit('addOutport', publicPort, this.outports[publicPort]);

    return this.checkTransactionEnd();
  }

  removeOutport(publicPort) {
    publicPort = this.getPortName(publicPort);
    if (!this.outports[publicPort]) { return; }

    this.checkTransactionStart();

    let port = this.outports[publicPort];
    this.setOutportMetadata(publicPort, {});
    delete this.outports[publicPort];
    this.emit('removeOutport', publicPort, port);

    return this.checkTransactionEnd();
  }

  renameOutport(oldPort, newPort) {
    oldPort = this.getPortName(oldPort);
    newPort = this.getPortName(newPort);
    if (!this.outports[oldPort]) { return; }

    this.checkTransactionStart();
    this.outports[newPort] = this.outports[oldPort];
    delete this.outports[oldPort];
    this.emit('renameOutport', oldPort, newPort);
    return this.checkTransactionEnd();
  }

  setOutportMetadata(publicPort, metadata) {
    publicPort = this.getPortName(publicPort);
    if (!this.outports[publicPort]) { return; }

    this.checkTransactionStart();
    let before = clone(this.outports[publicPort].metadata);
    if (!this.outports[publicPort].metadata) { this.outports[publicPort].metadata = {}; }
    for (let item in metadata) {
      let val = metadata[item];
      if (val != null) {
        this.outports[publicPort].metadata[item] = val;
      } else {
        delete this.outports[publicPort].metadata[item];
      }
    }
    this.emit('changeOutport', publicPort, this.outports[publicPort], before);
    return this.checkTransactionEnd();
  }

  // ## Grouping nodes in a graph
  //
  addGroup(group, nodes, metadata) {
    this.checkTransactionStart();

    let g = {
      name: group,
      nodes,
      metadata
    };
    this.groups.push(g);
    this.emit('addGroup', g);

    return this.checkTransactionEnd();
  }

  renameGroup(oldName, newName) {
    this.checkTransactionStart();
    for (let i = 0; i < this.groups.length; i++) {
      let group = this.groups[i];
      if (!group) { continue; }
      if (group.name !== oldName) { continue; }
      group.name = newName;
      this.emit('renameGroup', oldName, newName);
    }
    return this.checkTransactionEnd();
  }

  removeGroup(groupName) {
    this.checkTransactionStart();

    for (let i = 0; i < this.groups.length; i++) {
      let group = this.groups[i];
      if (!group) { continue; }
      if (group.name !== groupName) { continue; }
      this.setGroupMetadata(group.name, {});
      this.groups.splice(this.groups.indexOf(group), 1);
      this.emit('removeGroup', group);
    }

    return this.checkTransactionEnd();
  }

  setGroupMetadata(groupName, metadata) {
    this.checkTransactionStart();
    for (let i = 0; i < this.groups.length; i++) {
      let group = this.groups[i];
      if (!group) { continue; }
      if (group.name !== groupName) { continue; }
      let before = clone(group.metadata);
      for (let item in metadata) {
        let val = metadata[item];
        if (val != null) {
          group.metadata[item] = val;
        } else {
          delete group.metadata[item];
        }
      }
      this.emit('changeGroup', group, before);
    }
    return this.checkTransactionEnd();
  }

  // ## Adding a node to the graph
  //
  // Nodes are identified by an ID unique to the graph. Additionally,
  // a node may contain information on what NoFlo component it is and
  // possible display coordinates.
  //
  // For example:
  //
  //     myGraph.addNode 'Read, 'ReadFile',
  //       x: 91
  //       y: 154
  //
  // Addition of a node will emit the `addNode` event.
  addNode(id, component, metadata) {
    this.checkTransactionStart();

    if (!metadata) { metadata = {}; }
    let node = {
      id,
      component,
      metadata
    };
    this.nodes.push(node);
    this.emit('addNode', node);

    this.checkTransactionEnd();
    return node;
  }

  // ## Removing a node from the graph
  //
  // Existing nodes can be removed from a graph by their ID. This
  // will remove the node and also remove all edges connected to it.
  //
  //     myGraph.removeNode 'Read'
  //
  // Once the node has been removed, the `removeNode` event will be
  // emitted.
  removeNode(id) {
    let node = this.getNode(id);
    if (!node) { return; }

    this.checkTransactionStart();

    let toRemove = [];
    for (let i = 0; i < this.edges.length; i++) {
      var edge = this.edges[i];
      if ((edge.from.node === node.id) || (edge.to.node === node.id)) {
        toRemove.push(edge);
      }
    }
    for (let j = 0; j < toRemove.length; j++) {
      var edge = toRemove[j];
      this.removeEdge(edge.from.node, edge.from.port, edge.to.node, edge.to.port);
    }

    toRemove = [];
    for (let k = 0; k < this.initializers.length; k++) {
      var initializer = this.initializers[k];
      if (initializer.to.node === node.id) {
        toRemove.push(initializer);
      }
    }
    for (let i1 = 0; i1 < toRemove.length; i1++) {
      var initializer = toRemove[i1];
      this.removeInitial(initializer.to.node, initializer.to.port);
    }

    toRemove = [];
    for (let j1 = 0; j1 < this.exports.length; j1++) {
      var exported = this.exports[j1];
      if (this.getPortName(id) === exported.process) {
        toRemove.push(exported);
      }
    }
    for (let k1 = 0; k1 < toRemove.length; k1++) {
      var exported = toRemove[k1];
      this.removeExport(exported.public);
    }

    toRemove = [];
    for (var pub in this.inports) {
      var priv = this.inports[pub];
      if (priv.process === id) {
        toRemove.push(pub);
      }
    }
    for (let i2 = 0; i2 < toRemove.length; i2++) {
      pub = toRemove[i2];
      this.removeInport(pub);
    }

    toRemove = [];
    for (pub in this.outports) {
      var priv = this.outports[pub];
      if (priv.process === id) {
        toRemove.push(pub);
      }
    }
    for (let j2 = 0; j2 < toRemove.length; j2++) {
      pub = toRemove[j2];
      this.removeOutport(pub);
    }

    for (let k2 = 0; k2 < this.groups.length; k2++) {
      let group = this.groups[k2];
      if (!group) { continue; }
      let index = group.nodes.indexOf(id);
      if (index === -1) { continue; }
      group.nodes.splice(index, 1);
    }

    this.setNodeMetadata(id, {});

    if (-1 !== this.nodes.indexOf(node)) {
      this.nodes.splice(this.nodes.indexOf(node), 1);
    }

    this.emit('removeNode', node);

    return this.checkTransactionEnd();
  }

  // ## Getting a node
  //
  // Nodes objects can be retrieved from the graph by their ID:
  //
  //     myNode = myGraph.getNode 'Read'
  getNode(id) {
    for (let i = 0; i < this.nodes.length; i++) {
      let node = this.nodes[i];
      if (!node) { continue; }
      if (node.id === id) { return node; }
    }
    return null;
  }

  // ## Renaming a node
  //
  // Nodes IDs can be changed by calling this method.
  renameNode(oldId, newId) {
    this.checkTransactionStart();

    let node = this.getNode(oldId);
    if (!node) { return; }
    node.id = newId;

    for (let i = 0; i < this.edges.length; i++) {
      let edge = this.edges[i];
      if (!edge) { continue; }
      if (edge.from.node === oldId) {
        edge.from.node = newId;
      }
      if (edge.to.node === oldId) {
        edge.to.node = newId;
      }
    }

    for (let j = 0; j < this.initializers.length; j++) {
      let iip = this.initializers[j];
      if (!iip) { continue; }
      if (iip.to.node === oldId) {
        iip.to.node = newId;
      }
    }

    for (var pub in this.inports) {
      var priv = this.inports[pub];
      if (priv.process === oldId) {
        priv.process = newId;
      }
    }
    for (pub in this.outports) {
      var priv = this.outports[pub];
      if (priv.process === oldId) {
        priv.process = newId;
      }
    }
    for (let k = 0; k < this.exports.length; k++) {
      let exported = this.exports[k];
      if (exported.process === oldId) {
        exported.process = newId;
      }
    }

    for (let i1 = 0; i1 < this.groups.length; i1++) {
      let group = this.groups[i1];
      if (!group) { continue; }
      let index = group.nodes.indexOf(oldId);
      if (index === -1) { continue; }
      group.nodes[index] = newId;
    }

    this.emit('renameNode', oldId, newId);
    return this.checkTransactionEnd();
  }

  // ## Changing a node's metadata
  //
  // Node metadata can be set or changed by calling this method.
  setNodeMetadata(id, metadata) {
    let node = this.getNode(id);
    if (!node) { return; }

    this.checkTransactionStart();

    let before = clone(node.metadata);
    if (!node.metadata) { node.metadata = {}; }

    for (let item in metadata) {
      let val = metadata[item];
      if (val != null) {
        node.metadata[item] = val;
      } else {
        delete node.metadata[item];
      }
    }

    this.emit('changeNode', node, before);
    return this.checkTransactionEnd();
  }

  // ## Connecting nodes
  //
  // Nodes can be connected by adding edges between a node's outport
  // and another node's inport:
  //
  //     myGraph.addEdge 'Read', 'out', 'Display', 'in'
  //     myGraph.addEdgeIndex 'Read', 'out', null, 'Display', 'in', 2
  //
  // Adding an edge will emit the `addEdge` event.
  addEdge(outNode, outPort, inNode, inPort, metadata = {}) {
    outPort = this.getPortName(outPort);
    inPort = this.getPortName(inPort);
    for (let i = 0; i < this.edges.length; i++) {
      // don't add a duplicate edge
      var edge = this.edges[i];
      if (edge.from.node === outNode && edge.from.port === outPort && edge.to.node === inNode && edge.to.port === inPort) { return; }
    }
    if (!this.getNode(outNode)) { return; }
    if (!this.getNode(inNode)) { return; }

    this.checkTransactionStart();

    var edge = {
      from: {
        node: outNode,
        port: outPort
      },
      to: {
        node: inNode,
        port: inPort
      },
      metadata
    };
    this.edges.push(edge);
    this.emit('addEdge', edge);

    this.checkTransactionEnd();
    return edge;
  }

  // Adding an edge will emit the `addEdge` event.
  addEdgeIndex(outNode, outPort, outIndex, inNode, inPort, inIndex, metadata = {}) {
    if (!this.getNode(outNode)) { return; }
    if (!this.getNode(inNode)) { return; }

    outPort = this.getPortName(outPort);
    inPort = this.getPortName(inPort);

    if (inIndex === null) { inIndex = undefined; }
    if (outIndex === null) { outIndex = undefined; }
    if (!metadata) { metadata = {}; }

    this.checkTransactionStart();

    let edge = {
      from: {
        node: outNode,
        port: outPort,
        index: outIndex
      },
      to: {
        node: inNode,
        port: inPort,
        index: inIndex
      },
      metadata
    };
    this.edges.push(edge);
    this.emit('addEdge', edge);

    this.checkTransactionEnd();
    return edge;
  }

  // ## Disconnected nodes
  //
  // Connections between nodes can be removed by providing the
  // nodes and ports to disconnect.
  //
  //     myGraph.removeEdge 'Display', 'out', 'Foo', 'in'
  //
  // Removing a connection will emit the `removeEdge` event.
  removeEdge(node, port, node2, port2) {
    this.checkTransactionStart();
    port = this.getPortName(port);
    port2 = this.getPortName(port2);
    let toRemove = [];
    let toKeep = [];
    if (node2 && port2) {
      for (var index = 0; index < this.edges.length; index++) {
        var edge = this.edges[index];
        if (edge.from.node === node && edge.from.port === port && edge.to.node === node2 && edge.to.port === port2) {
          this.setEdgeMetadata(edge.from.node, edge.from.port, edge.to.node, edge.to.port, {});
          toRemove.push(edge);
        } else {
          toKeep.push(edge);
        }
      }
    } else {
      for (var index = 0; index < this.edges.length; index++) {
        var edge = this.edges[index];
        if ((edge.from.node === node && edge.from.port === port) || (edge.to.node === node && edge.to.port === port)) {
          this.setEdgeMetadata(edge.from.node, edge.from.port, edge.to.node, edge.to.port, {});
          toRemove.push(edge);
        } else {
          toKeep.push(edge);
        }
      }
    }

    this.edges = toKeep;
    for (let i = 0; i < toRemove.length; i++) {
      var edge = toRemove[i];
      this.emit('removeEdge', edge);
    }

    return this.checkTransactionEnd();
  }

  // ## Getting an edge
  //
  // Edge objects can be retrieved from the graph by the node and port IDs:
  //
  //     myEdge = myGraph.getEdge 'Read', 'out', 'Write', 'in'
  getEdge(node, port, node2, port2) {
    port = this.getPortName(port);
    port2 = this.getPortName(port2);
    for (let index = 0; index < this.edges.length; index++) {
      let edge = this.edges[index];
      if (!edge) { continue; }
      if (edge.from.node === node && edge.from.port === port) {
        if (edge.to.node === node2 && edge.to.port === port2) {
          return edge;
        }
      }
    }
    return null;
  }

  // ## Changing an edge's metadata
  //
  // Edge metadata can be set or changed by calling this method.
  setEdgeMetadata(node, port, node2, port2, metadata) {
    let edge = this.getEdge(node, port, node2, port2);
    if (!edge) { return; }

    this.checkTransactionStart();
    let before = clone(edge.metadata);
    if (!edge.metadata) { edge.metadata = {}; }

    for (let item in metadata) {
      let val = metadata[item];
      if (val != null) {
        edge.metadata[item] = val;
      } else {
        delete edge.metadata[item];
      }
    }

    this.emit('changeEdge', edge, before);
    return this.checkTransactionEnd();
  }

  // ## Adding Initial Information Packets
  //
  // Initial Information Packets (IIPs) can be used for sending data
  // to specified node inports without a sending node instance.
  //
  // IIPs are especially useful for sending configuration information
  // to components at NoFlo network start-up time. This could include
  // filenames to read, or network ports to listen to.
  //
  //     myGraph.addInitial 'somefile.txt', 'Read', 'source'
  //     myGraph.addInitialIndex 'somefile.txt', 'Read', 'source', 2
  //
  // If inports are defined on the graph, IIPs can be applied calling
  // the `addGraphInitial` or `addGraphInitialIndex` methods.
  //
  //     myGraph.addGraphInitial 'somefile.txt', 'file'
  //     myGraph.addGraphInitialIndex 'somefile.txt', 'file', 2
  //
  // Adding an IIP will emit a `addInitial` event.
  addInitial(data, node, port, metadata) {
    if (!this.getNode(node)) { return; }

    port = this.getPortName(port);
    this.checkTransactionStart();
    let initializer = {
      from: {
        data
      },
      to: {
        node,
        port
      },
      metadata
    };
    this.initializers.push(initializer);
    this.emit('addInitial', initializer);

    this.checkTransactionEnd();
    return initializer;
  }

  addInitialIndex(data, node, port, index, metadata) {
    if (!this.getNode(node)) { return; }
    if (index === null) { index = undefined; }

    port = this.getPortName(port);
    this.checkTransactionStart();
    let initializer = {
      from: {
        data
      },
      to: {
        node,
        port,
        index
      },
      metadata
    };
    this.initializers.push(initializer);
    this.emit('addInitial', initializer);

    this.checkTransactionEnd();
    return initializer;
  }

  addGraphInitial(data, node, metadata) {
    let inport = this.inports[node];
    if (!inport) { return; }
    return this.addInitial(data, inport.process, inport.port, metadata);
  }

  addGraphInitialIndex(data, node, index, metadata) {
    let inport = this.inports[node];
    if (!inport) { return; }
    return this.addInitialIndex(data, inport.process, inport.port, index, metadata);
  }

  // ## Removing Initial Information Packets
  //
  // IIPs can be removed by calling the `removeInitial` method.
  //
  //     myGraph.removeInitial 'Read', 'source'
  //
  // If the IIP was applied via the `addGraphInitial` or
  // `addGraphInitialIndex` functions, it can be removed using
  // the `removeGraphInitial` method.
  //
  //     myGraph.removeGraphInitial 'file'
  //
  // Remove an IIP will emit a `removeInitial` event.
  removeInitial(node, port) {
    port = this.getPortName(port);
    this.checkTransactionStart();

    let toRemove = [];
    let toKeep = [];
    for (let index = 0; index < this.initializers.length; index++) {
      var edge = this.initializers[index];
      if (edge.to.node === node && edge.to.port === port) {
        toRemove.push(edge);
      } else {
        toKeep.push(edge);
      }
    }
    this.initializers = toKeep;
    for (let i = 0; i < toRemove.length; i++) {
      var edge = toRemove[i];
      this.emit('removeInitial', edge);
    }

    return this.checkTransactionEnd();
  }

  removeGraphInitial(node) {
    let inport = this.inports[node];
    if (!inport) { return; }
    return this.removeInitial(inport.process, inport.port);
  }

  toDOT() {
    let cleanID = id => id.replace(/\s*/g, "");
    let cleanPort = port => port.replace(/\./g, "");

    let dot = "digraph {\n";

    for (let i = 0; i < this.nodes.length; i++) {
      let node = this.nodes[i];
      dot += `    ${cleanID(node.id)} [label=${node.id} shape=box]\n`;
    }

    for (let id = 0; id < this.initializers.length; id++) {
      let initializer = this.initializers[id];
      if (typeof initializer.from.data === 'function') {
        var data = 'Function';
      } else {
        var { data } = initializer.from;
      }
      dot += `    data${id} [label=\"'${data}'\" shape=plaintext]\n`;
      dot += `    data${id} -> ${cleanID(initializer.to.node)}[headlabel=${cleanPort(initializer.to.port)} labelfontcolor=blue labelfontsize=8.0]\n`;
    }

    for (let j = 0; j < this.edges.length; j++) {
      let edge = this.edges[j];
      dot += `    ${cleanID(edge.from.node)} -> ${cleanID(edge.to.node)}[taillabel=${cleanPort(edge.from.port)} headlabel=${cleanPort(edge.to.port)} labelfontcolor=blue labelfontsize=8.0]\n`;
    }

    dot += "}";

    return dot;
  }

  toYUML() {
    let yuml = [];

    for (let i = 0; i < this.initializers.length; i++) {
      let initializer = this.initializers[i];
      yuml.push(`(start)[${initializer.to.port}]->(${initializer.to.node})`);
    }

    for (let j = 0; j < this.edges.length; j++) {
      let edge = this.edges[j];
      yuml.push(`(${edge.from.node})[${edge.from.port}]->(${edge.to.node})`);
    }
    return yuml.join(",");
  }

  toJSON() {
    let json = {
      caseSensitive: this.caseSensitive,
      properties: {},
      inports: {},
      outports: {},
      groups: [],
      processes: {},
      connections: []
    };

    if (this.name) { json.properties.name = this.name; }
    for (let property in this.properties) {
      let value = this.properties[property];
      json.properties[property] = value;
    }

    for (var pub in this.inports) {
      var priv = this.inports[pub];
      json.inports[pub] = priv;
    }
    for (pub in this.outports) {
      var priv = this.outports[pub];
      json.outports[pub] = priv;
    }

    // Legacy exported ports
    for (let i = 0; i < this.exports.length; i++) {
      let exported = this.exports[i];
      if (!json.exports) { json.exports = []; }
      json.exports.push(exported);
    }

    for (let j = 0; j < this.groups.length; j++) {
      let group = this.groups[j];
      let groupData = {
        name: group.name,
        nodes: group.nodes
      };
      if (Object.keys(group.metadata).length) {
        groupData.metadata = group.metadata;
      }
      json.groups.push(groupData);
    }

    for (let k = 0; k < this.nodes.length; k++) {
      let node = this.nodes[k];
      json.processes[node.id] =
        {component: node.component};
      if (node.metadata) {
        json.processes[node.id].metadata = node.metadata;
      }
    }

    for (let i1 = 0; i1 < this.edges.length; i1++) {
      let edge = this.edges[i1];
      let connection = {
        src: {
          process: edge.from.node,
          port: edge.from.port,
          index: edge.from.index
        },
        tgt: {
          process: edge.to.node,
          port: edge.to.port,
          index: edge.to.index
        }
      };
      if (Object.keys(edge.metadata).length) { connection.metadata = edge.metadata; }
      json.connections.push(connection);
    }

    for (let j1 = 0; j1 < this.initializers.length; j1++) {
      let initializer = this.initializers[j1];
      json.connections.push({
        data: initializer.from.data,
        tgt: {
          process: initializer.to.node,
          port: initializer.to.port,
          index: initializer.to.index
        }
      });
    }

    return json;
  }

  save(file, callback) {
    if (platform.isBrowser()) {
      return callback(new Error("Saving graphs not supported on browser"));
    }

    let json = JSON.stringify(this.toJSON(), null, 4);
    return require('fs').writeFile(`${file}.json`, json, "utf-8", function(err, data) {
      if (err) { throw err; }
      return callback(file);
    }
    );
  }
}

export { Graph };

export function createGraph(name, options) {
  return new Graph(name, options);
}

export function loadJSON(definition, callback, metadata = {}) {
  if (typeof definition === 'string') { definition = JSON.parse(definition); }
  if (!definition.properties) { definition.properties = {}; }
  if (!definition.processes) { definition.processes = {}; }
  if (!definition.connections) { definition.connections = []; }
  let caseSensitive = definition.caseSensitive || false;

  let graph = new Graph(definition.properties.name, {caseSensitive});

  graph.startTransaction('loadJSON', metadata);
  let properties = {};
  for (let property in definition.properties) {
    let value = definition.properties[property];
    if (property === 'name') { continue; }
    properties[property] = value;
  }
  graph.setProperties(properties);

  for (var id in definition.processes) {
    let def = definition.processes[id];
    if (!def.metadata) { def.metadata = {}; }
    graph.addNode(id, def.component, def.metadata);
  }

  for (let i = 0; i < definition.connections.length; i++) {
    let conn = definition.connections[i];
    metadata = conn.metadata ? conn.metadata : {};
    if (conn.data !== undefined) {
      if (typeof conn.tgt.index === 'number') {
        graph.addInitialIndex(conn.data, conn.tgt.process, graph.getPortName(conn.tgt.port), conn.tgt.index, metadata);
      } else {
        graph.addInitial(conn.data, conn.tgt.process, graph.getPortName(conn.tgt.port), metadata);
      }
      continue;
    }
    if (typeof conn.src.index === 'number' || typeof conn.tgt.index === 'number') {
      graph.addEdgeIndex(conn.src.process, graph.getPortName(conn.src.port), conn.src.index, conn.tgt.process, graph.getPortName(conn.tgt.port), conn.tgt.index, metadata);
      continue;
    }
    graph.addEdge(conn.src.process, graph.getPortName(conn.src.port), conn.tgt.process, graph.getPortName(conn.tgt.port), metadata);
  }

  if (definition.exports && definition.exports.length) {
    for (let j = 0; j < definition.exports.length; j++) {
      let exported = definition.exports[j];
      if (exported.private) {
        // Translate legacy ports to new
        let split = exported.private.split('.');
        if (split.length !== 2) { continue; }
        var processId = split[0];
        var portId = split[1];

        // Get properly cased process id
        for (id in definition.processes) {
          if (graph.getPortName(id) === graph.getPortName(processId)) {
            processId = id;
          }
        }
      } else {
        var processId = exported.process;
        var portId = graph.getPortName(exported.port);
      }
      graph.addExport(exported.public, processId, portId, exported.metadata);
    }
  }

  if (definition.inports) {
    for (var pub in definition.inports) {
      var priv = definition.inports[pub];
      graph.addInport(pub, priv.process, graph.getPortName(priv.port), priv.metadata);
    }
  }
  if (definition.outports) {
    for (var pub in definition.outports) {
      var priv = definition.outports[pub];
      graph.addOutport(pub, priv.process, graph.getPortName(priv.port), priv.metadata);
    }
  }

  if (definition.groups) {
    for (let k = 0; k < definition.groups.length; k++) {
      let group = definition.groups[k];
      graph.addGroup(group.name, group.nodes, group.metadata || {});
    }
  }

  graph.endTransaction('loadJSON');

  return callback(null, graph);
}

export function loadFBP(fbpData, callback, metadata = {}, caseSensitive = false) {
  try {
    var definition = require('fbp').parse(fbpData, {caseSensitive});
  } catch (e) {
    return callback(e);
  }
  return exports.loadJSON(definition, callback, metadata);
}

export function loadHTTP(url, callback) {
  let req = new XMLHttpRequest();
  req.onreadystatechange = function() {
    if (req.readyState !== 4) { return; }
    if (req.status !== 200) {
      return callback(new Error(`Failed to load ${url}: HTTP ${req.status}`));
    }
    return callback(null, req.responseText);
  };
  req.open('GET', url, true);
  return req.send();
}

export function loadFile(file, callback, metadata = {}, caseSensitive = false) {
  if (platform.isBrowser()) {
    // On browser we can try getting the file via AJAX
    exports.loadHTTP(file, function(err, data) {
      if (err) { return callback(err); }
      if (file.split('.').pop() === 'fbp') {
        return exports.loadFBP(data, callback, metadata);
      }
      let definition = JSON.parse(data);
      return exports.loadJSON(definition, callback, metadata);
    }
    );
    return;
  }
  // Node.js graph file
  return require('fs').readFile(file, "utf-8", function(err, data) {
    let definition;
    if (err) { return callback(err); }

    if (file.split('.').pop() === 'fbp') {
      return exports.loadFBP(data, callback, {}, caseSensitive);
    }

    return definition = JSON.parse(data);
  }
  );
}
    
exports.loadJSON(definition, callback, {});

// remove everything in the graph
let resetGraph = function(graph) {

  // Edges and similar first, to have control over the order
  // If we'd do nodes first, it will implicitly delete edges
  // Important to make journal transactions invertible
  let iterable = (clone(graph.groups)).reverse();
  for (let i = 0; i < iterable.length; i++) {
    let group = iterable[i];
    if (group != null) { graph.removeGroup(group.name); }
  }
  let object = clone(graph.outports);
  for (var port in object) {
    var v = object[port];
    graph.removeOutport(port);
  }
  let object1 = clone(graph.inports);
  for (port in object1) {
    var v = object1[port];
    graph.removeInport(port);
  }
  let iterable1 = clone((graph.exports).reverse());
  for (let j = 0; j < iterable1.length; j++) {
    let exp = iterable1[j];
    graph.removeExport(exp.public);
  }
  // XXX: does this actually null the props??
  graph.setProperties({});
  let iterable2 = (clone(graph.initializers)).reverse();
  for (let k = 0; k < iterable2.length; k++) {
    let iip = iterable2[k];
    graph.removeInitial(iip.to.node, iip.to.port);
  }
  let iterable3 = (clone(graph.edges)).reverse();
  for (let i1 = 0; i1 < iterable3.length; i1++) {
    let edge = iterable3[i1];
    graph.removeEdge(edge.from.node, edge.from.port, edge.to.node, edge.to.port);
  }
  return (clone(graph.nodes)).reverse().map((node) =>
    graph.removeNode(node.id));
};

// Note: Caller should create transaction
// First removes everything in @base, before building it up to mirror @to
let mergeResolveTheirsNaive = function(base, to) {
  resetGraph(base);

  for (let i = 0; i < to.nodes.length; i++) {
    let node = to.nodes[i];
    base.addNode(node.id, node.component, node.metadata);
  }
  for (let j = 0; j < to.edges.length; j++) {
    let edge = to.edges[j];
    base.addEdge(edge.from.node, edge.from.port, edge.to.node, edge.to.port, edge.metadata);
  }
  for (let k = 0; k < to.initializers.length; k++) {
    let iip = to.initializers[k];
    base.addInitial(iip.from.data, iip.to.node, iip.to.port, iip.metadata);
  }
  for (let i1 = 0; i1 < to.exports.length; i1++) {
    let exp = to.exports[i1];
    base.addExport(exp.public, exp.node, exp.port, exp.metadata);
  }
  base.setProperties(to.properties);
  for (var pub in to.inports) {
    var priv = to.inports[pub];
    base.addInport(pub, priv.process, priv.port, priv.metadata);
  }
  for (pub in to.outports) {
    var priv = to.outports[pub];
    base.addOutport(pub, priv.process, priv.port, priv.metadata);
  }
  return to.groups.map((group) =>
    base.addGroup(group.name, group.nodes, group.metadata));
};

export function equivalent(a, b, options = {}) {
  // TODO: add option to only compare known fields
  // TODO: add option to ignore metadata
  let A = JSON.stringify(a);
  let B = JSON.stringify(b);
  return A === B;
}

export { mergeResolveTheirsNaive as mergeResolveTheirs };