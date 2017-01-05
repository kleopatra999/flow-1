/*
#     CloudBoost Flow - Flow-Based Programming for JavaScript
#     (c) 2014 HackerBay, Inc. 
#     CloudBoost Flow may be freely distributed under the Apache 2 License
*/
//
// This is the browser version of the ComponentLoader.
let internalSocket = require('./InternalSocket');
let FlowGraph = require('./Graph');
let { EventEmitter } = require('events');
let registerLoader = require('./loader/register');

class ComponentLoader extends EventEmitter {
  constructor(baseDir, options) {
    super()
  	if(!options){
  		options = {};
  	}
    this.baseDir = baseDir;
    this.options = options;
    this.components = null;
    this.libraryIcons = {};
    this.processing = false;
    this.ready = false;
    if (typeof this.setMaxListeners === 'function') { this.setMaxListeners(0); }
  }

  getModulePrefix(name) {
    if (!name) { return ''; }
    if (name === 'Flow') { return ''; }
    if (name[0] === '@') { name = name.replace(/\@[a-z\-]+\//, ''); }
    return name.replace('Flow-', '');
  }

  listComponents(callback) {
    if (this.processing) {
      this.once('ready', () => {
        return callback(null, this.components);
      }
      );
      return;
    }
    if (this.components) { return callback(null, this.components); }

    this.ready = false;
    this.processing = true;

    this.components = {};
    return registerLoader.register(this, err => {
      if (err) {
        if (callback) { return callback(err); }
        throw err;
      }
      this.processing = false;
      this.ready = true;
      this.emit('ready', true);
      if(callback)
      	return callback(null, this.components);
    }
    );
  }

  load(name, callback, metadata) {
    if (!this.ready) {
      this.listComponents(err => {
        if (err) { return callback(err); }
        return this.load(name, callback, metadata);
      }
      );
      return;
    }

    let component = this.components[name];
    if (!component) {
      // Try an alias
      for (let componentName in this.components) {
        if (componentName.split('/')[1] === name) {
          component = this.components[componentName];
          break;
        }
      }
      if (!component) {
        // Failure to load
        callback(new Error(`Component ${name} not available with base ${this.baseDir}`));
        return;
      }
    }

    if (this.isGraph(component)) {
      if (typeof process !== 'undefined' && process.execPath && process.execPath.indexOf('node') !== -1) {
        // nextTick is faster on Node.js
        process.nextTick(() => {
          return this.loadGraph(name, component, callback, metadata);
        }
        );
      } else {
        setTimeout(() => {
          return this.loadGraph(name, component, callback, metadata);
        }
        , 0);
      }
      return;
    }

    return this.createComponent(name, component, metadata, (err, instance) => {
      if (err) { return callback(err); }
      if (!instance) {
        callback(new Error(`Component ${name} could not be loaded.`));
        return;
      }

      if (name === 'Graph') { instance.baseDir = this.baseDir; }
      this.setIcon(name, instance);
      return callback(null, instance);
    }
    );
  }

  // Creates an instance of a component.
  createComponent(name, component, metadata, callback) {
    let implementation = component;
    if (!implementation) {
      return callback(new Error(`Component ${name} not available`));
    }

    // If a string was specified, attempt to `require` it.
    if (typeof implementation === 'string') {
      if (typeof registerLoader.dynamicLoad === 'function') {
        registerLoader.dynamicLoad(name, implementation, metadata, callback);
        return;
      }
      return callback(Error(`Dynamic loading of ${implementation} for component ${name} not available on this platform.`));
    }

    // Attempt to create the component instance using the `getComponent` method.
    if (typeof implementation.getComponent === 'function') {
      var instance = implementation.getComponent(metadata);
    // Attempt to create a component using a factory function.
    } else if (typeof implementation === 'function') {
      var instance = implementation(metadata);
    } else {
      callback(new Error(`Invalid type ${typeof(implementation)} for component ${name}.`));
      return;
    }

    if (typeof name === 'string') { instance.componentName = name; }
    return callback(null, instance);
  }

  isGraph(cPath) {
    // Live graph instance
    if (typeof cPath === 'object' && cPath instanceof FlowGraph.Graph) { return true; }
    // Graph JSON definition
    if (typeof cPath === 'object' && cPath.processes && cPath.connections) { return true; }
    if (typeof cPath !== 'string') { return false; }
    // Graph file path
    return cPath.indexOf('.fbp') !== -1 || cPath.indexOf('.json') !== -1;
  }

  loadGraph(name, component, callback, metadata) {
    return this.createComponent(name, this.components['Graph'], metadata, (err, graph) => {
      if (err) { return callback(err); }
      let graphSocket = internalSocket.createSocket();
      graph.loader = this;
      graph.baseDir = this.baseDir;
      graph.inPorts.graph.attach(graphSocket);
      graphSocket.send(component);
      graphSocket.disconnect();
      graph.inPorts.remove('graph');
      this.setIcon(name, graph);
      return callback(null, graph);
    }
    );
  }

  setIcon(name, instance) {
    // See if component has an icon
    if (!instance.getIcon || instance.getIcon()) { return; }

    // See if library has an icon
    let [library, componentName] = name.split('/');
    if (componentName && this.getLibraryIcon(library)) {
      instance.setIcon(this.getLibraryIcon(library));
      return;
    }

    // See if instance is a subgraph
    if (instance.isSubgraph()) {
      instance.setIcon('sitemap');
      return;
    }

    instance.setIcon('square');
  }

  getLibraryIcon(prefix) {
    if (this.libraryIcons[prefix]) {
      return this.libraryIcons[prefix];
    }
    return null;
  }

  setLibraryIcon(prefix, icon) {
    return this.libraryIcons[prefix] = icon;
  }

  normalizeName(packageId, name) {
    let prefix = this.getModulePrefix(packageId);
    let fullName = `${prefix}/${name}`;
    if (!packageId) { fullName = name; }
    return fullName;
  }

  registerComponent(packageId, name, cPath, callback) {
    let fullName = this.normalizeName(packageId, name);
    this.components[fullName] = cPath;
    if (callback) { return callback(); }
  }

  registerGraph(packageId, name, gPath, callback) {
    return this.registerComponent(packageId, name, gPath, callback);
  }

  registerLoader(loader, callback) {
    return loader(this, callback);
  }

  setSource(packageId, name, source, language, callback) {
    if (!registerLoader.setSource) {
      return callback(new Error('setSource not allowed'));
    }

    if (!this.ready) {
      this.listComponents(err => {
        if (err) { return callback(err); }
        return this.setSource(packageId, name, source, language, callback);
      }
      );
      return;
    }

    return registerLoader.setSource(this, packageId, name, source, language, callback);
  }

  getSource(name, callback) {
    if (!registerLoader.getSource) {
      return callback(new Error('getSource not allowed'));
    }
    if (!this.ready) {
      this.listComponents(err => {
        if (err) { return callback(err); }
        return this.getSource(name, callback);
      }
      );
      return;
    }

    return registerLoader.getSource(this, name, callback);
  }

  clear() {
    this.components = null;
    this.ready = false;
    return this.processing = false;
  }
}

module.exports = { ComponentLoader:ComponentLoader };
