/*
#     CloudBoost Flow - Flow-Based Programming for JavaScript
#     (c) 2014 HackerBay, Inc. 
#     CloudBoost Flow may be freely distributed under the Apache 2 License
*/
//
// Flow is a Flow-Based Programming environment for JavaScript. This file provides the
// main entry point to the Flow network.
//
// Find out more about using Flow from <http://Flowjs.org/documentation/>
//
// ## Main APIs
//
// ### Graph interface
//
// [Graph](Graph.html) is used for instantiating FBP graph definitions.
module.exports = {};

let graph = require('./Graph');
module.exports.Graph = graph;

// ### Graph journal
//
// Journal is used for keeping track of graph changes
let journal = require('./Journal');
module.exports.Journal = journal;

// ## Network interface
//
// [Network](Network.html) is used for running Flow graphs.
let { Network } = require('./Network');
module.exports.Network = Network;

// ### Platform detection
//
// Flow works on both Node.js and the browser. Because some dependencies are different,
// we need a way to detect which we're on.
let { isBrowser } = require('./Platform');
module.exports.isBrowser = isBrowser;


// ### Component Loader
//
// The [ComponentLoader](ComponentLoader.html) is responsible for finding and loading
// Flow components.
//
// Node.js version of the Component Loader finds components and graphs by traversing
// the NPM dependency tree from a given root directory on the file system.
//
// Browser version of the Component Loader finds components and graphs by traversing
// the [Component](http://component.io/) dependency tree from a given Component package
// name.
let { ComponentLoader } = require('./ComponentLoader');
module.exports.ComponentLoader = ComponentLoader;

// ### Component baseclasses
//
// These baseclasses can be used for defining Flow components.
let { Component } = require('./Component');
module.exports.Component = Component;


// ### Component helpers
//
// These helpers aid in providing specific behavior in components with minimal overhead.
let helpers = require('./Helpers');
module.exports.helpers = helpers;

let streams = require('./Streams');
module.exports.streams = streams;


// ### Flow ports
//
// These classes are used for instantiating ports on Flow components.

let InPort = require('./InPort');
module.exports.InPort = InPort;

let OutPort = require('./OutPort');
module.exports.OutPort = OutPort;

// ### Flow sockets
//
// The Flow [internalSocket](InternalSocket.html) is used for connecting ports of
// different components together in a network.
let internalSocket = require('./InternalSocket');
module.exports.internalSocket = internalSocket;

// ### Information Packets
//
// Flow Information Packets are defined as "IP" objects.
let IP = require('./IP');
module.exports.IP = IP;

// ## Network instantiation
//
// This function handles instantiation of Flow networks from a Graph object. It creates
// the network, and then starts execution by sending the Initial Information Packets.
//
//     Flow.createNetwork(someGraph, function (err, network) {
//       console.log('Network is now running!');
//     });
//
// It is also possible to instantiate a Network but delay its execution by giving the
// third `delay` parameter. In this case you will have to handle connecting the graph and
// sending of IIPs manually.
//
//     Flow.createNetwork(someGraph, function (err, network) {
//       if (err) {
//         throw err;
//       }
//       network.connect(function (err) {
//         network.start();
//         console.log('Network is now running!');
//       })
//     }, true);
module.exports.createNetwork = function(graph, callback, options) {
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
// It is also possible to start a Flow network by giving it a path to a `.json` or `.fbp` network
// definition file.
//
//     Flow.loadFile('somefile.json', function (err, network) {
//       if (err) {
//         throw err;
//       }
//       console.log('Network is now running!');
//     });
module.exports.loadFile = function (file, options, callback) {
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
// Flow graph files can be saved back into the filesystem with this method.
module.exports.saveFile = function(graph, file, callback) {
  return exports.graph.save(file, () => callback(file));
}
