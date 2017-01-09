(function() {
  var customLoader, nofloGraph, platform, utils;

  utils = require('../Utils');

  nofloGraph = require('../Graph');

  platform = require('../Platform');

  customLoader = {
    checked: [],
    getModuleDependencies: function(loader, dependencies, callback) {
      var dependency;
      if (!(dependencies != null ? dependencies.length : void 0)) {
        return callback(null);
      }
      dependency = dependencies.shift();
      dependency = dependency.replace('/', '-');
      return this.getModuleComponents(loader, dependency, (function(_this) {
        return function(err) {
          return _this.getModuleDependencies(loader, dependencies, callback);
        };
      })(this));
    },
    getModuleComponents: function(loader, moduleName, callback) {
      var definition, e, error;
      if (this.checked.indexOf(moduleName) !== -1) {
        return callback();
      }
      this.checked.push(moduleName);
      try {
        definition = require("/" + moduleName + "/component.json");
      } catch (error) {
        e = error;
        if (moduleName.substr(0, 1) === '/' && moduleName.length > 1) {
          return this.getModuleComponents(loader, "noflo-" + (moduleName.substr(1)), callback);
        }
        return callback(e);
      }
      if (!definition.noflo) {
        return callback();
      }
      if (!definition.dependencies) {
        return callback();
      }
      return this.getModuleDependencies(loader, Object.keys(definition.dependencies), function(err) {
        var cPath, def, loaderPath, name, prefix, ref, ref1;
        if (err) {
          return callback(err);
        }
        prefix = loader.getModulePrefix(definition.name);
        if (definition.noflo.icon) {
          loader.setLibraryIcon(prefix, definition.noflo.icon);
        }
        if (moduleName[0] === '/') {
          moduleName = moduleName.substr(1);
        }
        if (definition.noflo.components) {
          ref = definition.noflo.components;
          for (name in ref) {
            cPath = ref[name];
            if (cPath.indexOf('.coffee') !== -1) {
              cPath = cPath.replace('.coffee', '.js');
            }
            if (cPath.substr(0, 2) === './') {
              cPath = cPath.substr(2);
            }
            loader.registerComponent(prefix, name, "/" + moduleName + "/" + cPath);
          }
        }
        if (definition.noflo.graphs) {
          ref1 = definition.noflo.graphs;
          for (name in ref1) {
            cPath = ref1[name];
            def = require("/" + moduleName + "/" + cPath);
            loader.registerGraph(prefix, name, def);
          }
        }
        if (definition.noflo.loader) {
          loaderPath = "/" + moduleName + "/" + definition.noflo.loader;
          customLoader = require(loaderPath);
          loader.registerLoader(customLoader, callback);
          return;
        }
        return callback();
      });
    }
  };

  exports.register = function(loader, callback) {
    platform.deprecated('Component.io is deprecated. Please make browser builds using webpack instead. grunt-noflo-browser provides a simple setup for this');
    customLoader.checked = [];
    return setTimeout(function() {
      return customLoader.getModuleComponents(loader, loader.baseDir, callback);
    }, 1);
  };

  exports.dynamicLoad = function(name, cPath, metadata, callback) {
    var e, error, implementation, instance;
    try {
      implementation = require(cPath);
    } catch (error) {
      e = error;
      callback(e);
      return;
    }
    if (typeof implementation.getComponent === 'function') {
      instance = implementation.getComponent(metadata);
    } else if (typeof implementation === 'function') {
      instance = implementation(metadata);
    } else {
      callback(new Error("Unable to instantiate " + cPath));
      return;
    }
    if (typeof name === 'string') {
      instance.componentName = name;
    }
    return callback(null, instance);
  };

  exports.setSource = function(loader, packageId, name, source, language, callback) {
    var e, error, error1, error2, implementation;
    if (language === 'coffeescript') {
      if (!window.CoffeeScript) {
        return callback(new Error('CoffeeScript compiler not available'));
      }
      try {
        source = CoffeeScript.compile(source, {
          bare: true
        });
      } catch (error) {
        e = error;
        return callback(e);
      }
    } else if (language === 'es6' || language === 'es2015') {
      if (!window.babel) {
        return callback(new Error('Babel compiler not available'));
      }
      try {
        source = babel.transform(source).code;
      } catch (error1) {
        e = error1;
        return callback(e);
      }
    }
    try {
      source = source.replace("require('noflo')", "require('../NoFlo')");
      source = source.replace('require("noflo")', 'require("../NoFlo")');
      implementation = eval("(function () { var exports = {}; " + source + "; return exports; })()");
    } catch (error2) {
      e = error2;
      return callback(e);
    }
    if (!(implementation || implementation.getComponent)) {
      return callback(new Error('Provided source failed to create a runnable component'));
    }
    return loader.registerComponent(packageId, name, implementation, callback);
  };

  exports.getSource = function(loader, name, callback) {
    var component, componentName, nameParts, path;
    component = loader.components[name];
    if (!component) {
      for (componentName in loader.components) {
        if (componentName.split('/')[1] === name) {
          component = loader.components[componentName];
          name = componentName;
          break;
        }
      }
      if (!component) {
        return callback(new Error("Component " + name + " not installed"));
      }
    }
    if (typeof component !== 'string') {
      return callback(new Error("Can't provide source for " + name + ". Not a file"));
    }
    nameParts = name.split('/');
    if (nameParts.length === 1) {
      nameParts[1] = nameParts[0];
      nameParts[0] = '';
    }
    if (loader.isGraph(component)) {
      nofloGraph.loadFile(component, function(err, graph) {
        if (err) {
          return callback(err);
        }
        if (!graph) {
          return callback(new Error('Unable to load graph'));
        }
        return callback(null, {
          name: nameParts[1],
          library: nameParts[0],
          code: JSON.stringify(graph.toJSON()),
          language: 'json'
        });
      });
      return;
    }
    path = window.require.resolve(component);
    if (!path) {
      return callback(new Error("Component " + name + " is not resolvable to a path"));
    }
    return callback(null, {
      name: nameParts[1],
      library: nameParts[0],
      code: window.require.modules[path].toString(),
      language: utils.guessLanguageFromFilename(component)
    });
  };

}).call(this);
