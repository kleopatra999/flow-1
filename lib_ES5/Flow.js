(function() {
  var ports;

  exports.graph = require('./Graph');

  exports.Graph = exports.graph.Graph;

  exports.journal = require('./Journal');

  exports.Journal = exports.journal.Journal;

  exports.Network = require('./Network').Network;

  exports.isBrowser = require('./Platform').isBrowser;

  exports.ComponentLoader = require('./ComponentLoader').ComponentLoader;

  exports.Component = require('./Component').Component;

  exports.AsyncComponent = require('./AsyncComponent').AsyncComponent;

  exports.helpers = require('./Helpers');

  exports.streams = require('./Streams');

  ports = require('./Ports');

  exports.InPorts = ports.InPorts;

  exports.OutPorts = ports.OutPorts;

  exports.InPort = require('./InPort');

  exports.OutPort = require('./OutPort');

  exports.Port = require('./Port').Port;

  exports.ArrayPort = require('./ArrayPort').ArrayPort;

  exports.internalSocket = require('./InternalSocket');

  exports.IP = require('./IP');

  exports.createNetwork = function(graph, callback, options) {
    var network, networkReady;
    if (typeof options !== 'object') {
      options = {
        delay: options
      };
    }
    if (typeof callback !== 'function') {
      callback = function(err) {
        if (err) {
          throw err;
        }
      };
    }
    network = new exports.Network(graph, options);
    networkReady = function(network) {
      return network.start(function(err) {
        if (err) {
          return callback(err);
        }
        return callback(null, network);
      });
    };
    network.loader.listComponents(function(err) {
      if (err) {
        return callback(err);
      }
      if (graph.nodes.length === 0) {
        return networkReady(network);
      }
      if (options.delay) {
        callback(null, network);
        return;
      }
      return network.connect(function(err) {
        if (err) {
          return callback(err);
        }
        return networkReady(network);
      });
    });
    return network;
  };

  exports.loadFile = function(file, options, callback) {
    var baseDir;
    if (!callback) {
      callback = options;
      baseDir = null;
    }
    if (callback && typeof options !== 'object') {
      options = {
        baseDir: options
      };
    }
    return exports.graph.loadFile(file, function(err, net) {
      if (err) {
        return callback(err);
      }
      if (options.baseDir) {
        net.baseDir = options.baseDir;
      }
      return exports.createNetwork(net, callback, options);
    });
  };

  exports.saveFile = function(graph, file, callback) {
    return exports.graph.save(file, function() {
      return callback(file);
    });
  };

}).call(this);
