(function() {
  var ComponentLoader, EventEmitter, internalSocket, nofloGraph, registerLoader,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  internalSocket = require('./InternalSocket');

  nofloGraph = require('./Graph');

  EventEmitter = require('events').EventEmitter;

  registerLoader = require('./loader/register');

  ComponentLoader = (function(superClass) {
    extend(ComponentLoader, superClass);

    function ComponentLoader(baseDir, options) {
      this.baseDir = baseDir;
      this.options = options != null ? options : {};
      this.components = null;
      this.libraryIcons = {};
      this.processing = false;
      this.ready = false;
      if (typeof this.setMaxListeners === 'function') {
        this.setMaxListeners(0);
      }
    }

    ComponentLoader.prototype.getModulePrefix = function(name) {
      if (!name) {
        return '';
      }
      if (name === 'noflo') {
        return '';
      }
      if (name[0] === '@') {
        name = name.replace(/\@[a-z\-]+\//, '');
      }
      return name.replace('noflo-', '');
    };

    ComponentLoader.prototype.listComponents = function(callback) {
      if (this.processing) {
        this.once('ready', (function(_this) {
          return function() {
            return callback(null, _this.components);
          };
        })(this));
        return;
      }
      if (this.components) {
        return callback(null, this.components);
      }
      this.ready = false;
      this.processing = true;
      this.components = {};
      registerLoader.register(this, (function(_this) {
        return function(err) {
          if (err) {
            if (callback) {
              return callback(err);
            }
            throw err;
          }
          _this.processing = false;
          _this.ready = true;
          _this.emit('ready', true);
          if (callback) {
            return callback(null, _this.components);
          }
        };
      })(this));
    };

    ComponentLoader.prototype.load = function(name, callback, metadata) {
      var component, componentName;
      if (!this.ready) {
        this.listComponents((function(_this) {
          return function(err) {
            if (err) {
              return callback(err);
            }
            return _this.load(name, callback, metadata);
          };
        })(this));
        return;
      }
      component = this.components[name];
      if (!component) {
        for (componentName in this.components) {
          if (componentName.split('/')[1] === name) {
            component = this.components[componentName];
            break;
          }
        }
        if (!component) {
          callback(new Error("Component " + name + " not available with base " + this.baseDir));
          return;
        }
      }
      if (this.isGraph(component)) {
        if (typeof process !== 'undefined' && process.execPath && process.execPath.indexOf('node') !== -1) {
          process.nextTick((function(_this) {
            return function() {
              return _this.loadGraph(name, component, callback, metadata);
            };
          })(this));
        } else {
          setTimeout((function(_this) {
            return function() {
              return _this.loadGraph(name, component, callback, metadata);
            };
          })(this), 0);
        }
        return;
      }
      return this.createComponent(name, component, metadata, (function(_this) {
        return function(err, instance) {
          if (err) {
            return callback(err);
          }
          if (!instance) {
            callback(new Error("Component " + name + " could not be loaded."));
            return;
          }
          if (name === 'Graph') {
            instance.baseDir = _this.baseDir;
          }
          _this.setIcon(name, instance);
          return callback(null, instance);
        };
      })(this));
    };

    ComponentLoader.prototype.createComponent = function(name, component, metadata, callback) {
      var implementation, instance;
      implementation = component;
      if (!implementation) {
        return callback(new Error("Component " + name + " not available"));
      }
      if (typeof implementation === 'string') {
        if (typeof registerLoader.dynamicLoad === 'function') {
          registerLoader.dynamicLoad(name, implementation, metadata, callback);
          return;
        }
        return callback(Error("Dynamic loading of " + implementation + " for component " + name + " not available on this platform."));
      }
      if (typeof implementation.getComponent === 'function') {
        instance = implementation.getComponent(metadata);
      } else if (typeof implementation === 'function') {
        instance = implementation(metadata);
      } else {
        callback(new Error("Invalid type " + (typeof implementation) + " for component " + name + "."));
        return;
      }
      if (typeof name === 'string') {
        instance.componentName = name;
      }
      return callback(null, instance);
    };

    ComponentLoader.prototype.isGraph = function(cPath) {
      if (typeof cPath === 'object' && cPath instanceof nofloGraph.Graph) {
        return true;
      }
      if (typeof cPath === 'object' && cPath.processes && cPath.connections) {
        return true;
      }
      if (typeof cPath !== 'string') {
        return false;
      }
      return cPath.indexOf('.fbp') !== -1 || cPath.indexOf('.json') !== -1;
    };

    ComponentLoader.prototype.loadGraph = function(name, component, callback, metadata) {
      return this.createComponent(name, this.components['Graph'], metadata, (function(_this) {
        return function(err, graph) {
          var graphSocket;
          if (err) {
            return callback(err);
          }
          graphSocket = internalSocket.createSocket();
          graph.loader = _this;
          graph.baseDir = _this.baseDir;
          graph.inPorts.graph.attach(graphSocket);
          graphSocket.send(component);
          graphSocket.disconnect();
          graph.inPorts.remove('graph');
          _this.setIcon(name, graph);
          return callback(null, graph);
        };
      })(this));
    };

    ComponentLoader.prototype.setIcon = function(name, instance) {
      var componentName, library, ref;
      if (!instance.getIcon || instance.getIcon()) {
        return;
      }
      ref = name.split('/'), library = ref[0], componentName = ref[1];
      if (componentName && this.getLibraryIcon(library)) {
        instance.setIcon(this.getLibraryIcon(library));
        return;
      }
      if (instance.isSubgraph()) {
        instance.setIcon('sitemap');
        return;
      }
      instance.setIcon('square');
    };

    ComponentLoader.prototype.getLibraryIcon = function(prefix) {
      if (this.libraryIcons[prefix]) {
        return this.libraryIcons[prefix];
      }
      return null;
    };

    ComponentLoader.prototype.setLibraryIcon = function(prefix, icon) {
      return this.libraryIcons[prefix] = icon;
    };

    ComponentLoader.prototype.normalizeName = function(packageId, name) {
      var fullName, prefix;
      prefix = this.getModulePrefix(packageId);
      fullName = prefix + "/" + name;
      if (!packageId) {
        fullName = name;
      }
      return fullName;
    };

    ComponentLoader.prototype.registerComponent = function(packageId, name, cPath, callback) {
      var fullName;
      fullName = this.normalizeName(packageId, name);
      this.components[fullName] = cPath;
      if (callback) {
        return callback();
      }
    };

    ComponentLoader.prototype.registerGraph = function(packageId, name, gPath, callback) {
      return this.registerComponent(packageId, name, gPath, callback);
    };

    ComponentLoader.prototype.registerLoader = function(loader, callback) {
      return loader(this, callback);
    };

    ComponentLoader.prototype.setSource = function(packageId, name, source, language, callback) {
      if (!registerLoader.setSource) {
        return callback(new Error('setSource not allowed'));
      }
      if (!this.ready) {
        this.listComponents((function(_this) {
          return function(err) {
            if (err) {
              return callback(err);
            }
            return _this.setSource(packageId, name, source, language, callback);
          };
        })(this));
        return;
      }
      return registerLoader.setSource(this, packageId, name, source, language, callback);
    };

    ComponentLoader.prototype.getSource = function(name, callback) {
      if (!registerLoader.getSource) {
        return callback(new Error('getSource not allowed'));
      }
      if (!this.ready) {
        this.listComponents((function(_this) {
          return function(err) {
            if (err) {
              return callback(err);
            }
            return _this.getSource(name, callback);
          };
        })(this));
        return;
      }
      return registerLoader.getSource(this, name, callback);
    };

    ComponentLoader.prototype.clear = function() {
      this.components = null;
      this.ready = false;
      return this.processing = false;
    };

    return ComponentLoader;

  })(EventEmitter);

  exports.ComponentLoader = ComponentLoader;

}).call(this);
