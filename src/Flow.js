//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2013-2016 TheGrid (Rituwall Inc.)
//     (c) 2011-2012 Henri Bergius, Nemein
//     NoFlo may be freely distributed under the MIT license
//
// NoFlo is a Flow-Based Programming environment for JavaScript. This file provides the
// main entry point to the NoFlo network.
//
// Find out more about using NoFlo from <http://noflojs.org/documentation/>
//
// ## Main APIs
//
// ### Graph interface
//
// [Graph](Graph.html) is used for instantiating FBP graph definitions.
export let graph = require('./Graph');
export let { Graph } = exports.graph;

// ### Graph journal
//
// Journal is used for keeping track of graph changes
export let journal = require('./Journal');
export let { Journal } = exports.journal;

// ## Network interface
//
// [Network](Network.html) is used for running NoFlo graphs.
export let { Network } = require('./Network');

// ### Platform detection
//
// NoFlo works on both Node.js and the browser. Because some dependencies are different,
// we need a way to detect which we're on.
export let { isBrowser } = require('./Platform');

// ### Component Loader
//
// The [ComponentLoader](ComponentLoader.html) is responsible for finding and loading
// NoFlo components.
//
// Node.js version of the Component Loader finds components and graphs by traversing
// the NPM dependency tree from a given root directory on the file system.
//
// Browser version of the Component Loader finds components and graphs by traversing
// the [Component](http://component.io/) dependency tree from a given Component package
// name.
export let { ComponentLoader } = require('./ComponentLoader');

// ### Component baseclasses
//
// These baseclasses can be used for defining NoFlo components.
export let { Component } = require('./Component');
export let { AsyncComponent } = require('./AsyncComponent');

// ### Component helpers
//
// These helpers aid in providing specific behavior in components with minimal overhead.
export let helpers = require('./Helpers');
export let streams = require('./Streams');

// ### NoFlo ports
//
// These classes are used for instantiating ports on NoFlo components.
import ports from './Ports';
export let { InPorts } = ports;
export let { OutPorts } = ports;
export let InPort = require('./InPort');
export let OutPort = require('./OutPort');

// The old Port API is available for backwards compatibility
export let { Port } = require('./Port');
export let { ArrayPort } = require('./ArrayPort');

// ### NoFlo sockets
//
// The NoFlo [internalSocket](InternalSocket.html) is used for connecting ports of
// different components together in a network.
export let internalSocket = require('./InternalSocket');

// ### Information Packets
//
// NoFlo Information Packets are defined as "IP" objects.
export let IP = require('./IP');

// ## Network instantiation
//
// This function handles instantiation of NoFlo networks from a Graph object. It creates
// the network, and then starts execution by sending the Initial Information Packets.
//
//     noflo.createNetwork(someGraph, function (err, network) {
//       console.log('Network is now running!');
//     });
//
// It is also possible to instantiate a Network but delay its execution by giving the
// third `delay` parameter. In this case you will have to handle connecting the graph and
// sending of IIPs manually.
//
//     noflo.createNetwork(someGraph, function (err, network) {
//       if (err) {
//         throw err;
//       }
//       network.connect(function (err) {
//         network.start();
//         console.log('Network is now running!');
//       })
//     }, true);
export function createNetwork(graph, callback, options) {
  if (typeof options !== 'object') {
    options =
      {delay: options};
  }
  if (typeof callback !== 'function') {
    callback = function(err) {
      if (err) { throw err; }
    };
  }

  let network = new exports.Network(graph, options);

  let networkReady = network =>
    // Send IIPs
    network.start(function(err) {
      if (err) { return callback(err); }
      return callback(null, network);
    })
  ;

  // Ensure components are loaded before continuing
  network.loader.listComponents(function(err) {
    if (err) { return callback(err); }
    // Empty network, no need to connect it up
    if (graph.nodes.length === 0) { return networkReady(network); }

    // In case of delayed execution we don't wire it up
    if (options.delay) {
      callback(null, network);
      return;
    }

    // Wire the network up and start execution
    return network.connect(function(err) {
      if (err) { return callback(err); }
      return networkReady(network);
    });
  });

  return network;
}

// ### Starting a network from a file
//
// It is also possible to start a NoFlo network by giving it a path to a `.json` or `.fbp` network
// definition file.
//
//     noflo.loadFile('somefile.json', function (err, network) {
//       if (err) {
//         throw err;
//       }
//       console.log('Network is now running!');
//     });
export function loadFile(file, options, callback) {
  if (!callback) {
    callback = options;
    let baseDir = null;
  }

  if (callback && typeof options !== 'object') {
    options =
      {baseDir: options};
  }

  return exports.graph.loadFile(file, function(err, net) {
    if (err) { return callback(err); }
    if (options.baseDir) { net.baseDir = options.baseDir; }
    return exports.createNetwork(net, callback, options);
  }
  );
}

// ### Saving a network definition
//
// NoFlo graph files can be saved back into the filesystem with this method.
export function saveFile(graph, file, callback) {
  return exports.graph.save(file, () => callback(file));
}