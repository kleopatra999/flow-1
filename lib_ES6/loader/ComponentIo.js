let utils = require('../Utils');
let nofloGraph = require('../Graph');
let platform = require('../Platform');

let customLoader = {
  checked: [],

  getModuleDependencies(loader, dependencies, callback) {
    if (!__guard__(dependencies, x => x.length)) {
      return callback(null);
    }

    let dependency = dependencies.shift();
    dependency = dependency.replace('/', '-');
    return this.getModuleComponents(loader, dependency, err => {
      return this.getModuleDependencies(loader, dependencies, callback);
    }
    );
  },

  getModuleComponents(loader, moduleName, callback) {
    if (this.checked.indexOf(moduleName) !== -1) { return callback(); }
    this.checked.push(moduleName);
    try {
      var definition = require(`/${moduleName}/component.json`);
    } catch (e) {
      if (moduleName.substr(0, 1) === '/' && moduleName.length > 1) {
        return this.getModuleComponents(loader, `noflo-${moduleName.substr(1)}`, callback);
      }
      return callback(e);
    }

    if (!definition.noflo) { return callback(); }
    if (!definition.dependencies) { return callback(); }

    return this.getModuleDependencies(loader, Object.keys(definition.dependencies), function(err) {
      if (err) { return callback(err); }

      let prefix = loader.getModulePrefix(definition.name);

      if (definition.noflo.icon) {
        loader.setLibraryIcon(prefix, definition.noflo.icon);
      }

      if (moduleName[0] === '/') {
        moduleName = moduleName.substr(1);
      }

      if (definition.noflo.components) {
        for (var name in definition.noflo.components) {
          var cPath = definition.noflo.components[name];
          if (cPath.indexOf('.coffee') !== -1) {
            cPath = cPath.replace('.coffee', '.js');
          }
          if (cPath.substr(0, 2) === './') {
            cPath = cPath.substr(2);
          }
          loader.registerComponent(prefix, name, `/${moduleName}/${cPath}`);
        }
      }
      if (definition.noflo.graphs) {
        for (var name in definition.noflo.graphs) {
          var cPath = definition.noflo.graphs[name];
          let def = require(`/${moduleName}/${cPath}`);
          loader.registerGraph(prefix, name, def);
        }
      }

      if (definition.noflo.loader) {
        // Run a custom component loader
        let loaderPath = `/${moduleName}/${definition.noflo.loader}`;
        customLoader = require(loaderPath);
        loader.registerLoader(customLoader, callback);
        return;
      }

      return callback();
    }
    );
  }
};

module.exports.register = function(loader, callback) {
  platform.deprecated('Component.io is deprecated. Please make browser builds using webpack instead. grunt-noflo-browser provides a simple setup for this');

  customLoader.checked = [];
  // Start discovery from baseDir
  return setTimeout(() => customLoader.getModuleComponents(loader, loader.baseDir, callback)
  , 1);
}

module.exports.dynamicLoad = function(name, cPath, metadata, callback) {
  try {
    var implementation = require(cPath);
  } catch (e) {
    callback(e);
    return;
  }

  if (typeof implementation.getComponent === 'function') {
    var instance = implementation.getComponent(metadata);
  } else if (typeof implementation === 'function') {
    var instance = implementation(metadata);
  } else {
    callback(new Error(`Unable to instantiate ${cPath}`));
    return;
  }
  if (typeof name === 'string') { instance.componentName = name; }
  return callback(null, instance);
}

module.exports.setSource = function(loader, packageId, name, source, language, callback) {
  if (language === 'coffeescript') {
    if (!window.CoffeeScript) {
      return callback(new Error('CoffeeScript compiler not available'));
    }
    try {
      source = CoffeeScript.compile(source,
        {bare: true});
    } catch (e) {
      return callback(e);
    }
  } else if (language === 'es6' || language === 'es2015') {
    if (!window.babel) {
      return callback(new Error('Babel compiler not available'));
    }
    try {
      source = babel.transform(source).code;
    } catch (e) {
      return callback(e);
    }
  }

  // We eval the contents to get a runnable component
  try {
    // Modify require path for NoFlo since we're inside the NoFlo context
    source = source.replace("require('noflo')", "require('../NoFlo')");
    source = source.replace('require("noflo")', 'require("../NoFlo")');

    // Eval so we can get a function
    var implementation = eval(`(function () { var exports = {}; ${source}; return exports; })()`);
  } catch (e) {
    return callback(e);
  }
  if (!implementation && !implementation.getComponent) {
    return callback(new Error('Provided source failed to create a runnable component'));
  }

  return loader.registerComponent(packageId, name, implementation, callback);
}

module.exports.getSource = function(loader, name, callback) {
  let component = loader.components[name];
  if (!component) {
    // Try an alias
    for (let componentName in loader.components) {
      if (componentName.split('/')[1] === name) {
        component = loader.components[componentName];
        name = componentName;
        break;
      }
    }
    if (!component) {
      return callback(new Error(`Component ${name} not installed`));
    }
  }

  if (typeof component !== 'string') {
    return callback(new Error(`Can't provide source for ${name}. Not a file`));
  }

  let nameParts = name.split('/');
  if (nameParts.length === 1) {
    nameParts[1] = nameParts[0];
    nameParts[0] = '';
  }

  if (loader.isGraph(component)) {
    nofloGraph.loadFile(component, function(err, graph) {
      if (err) { return callback(err); }
      if (!graph) { return callback(new Error('Unable to load graph')); }
      return callback(null, {
        name: nameParts[1],
        library: nameParts[0],
        code: JSON.stringify(graph.toJSON()),
        language: 'json'
      }
      );
    }
    );
    return;
  }

  let path = window.require.resolve(component);
  if (!path) {
    return callback(new Error(`Component ${name} is not resolvable to a path`));
  }
  return callback(null, {
    name: nameParts[1],
    library: nameParts[0],
    code: window.require.modules[path].toString(),
    language: utils.guessLanguageFromFilename(component)
  }
  );
}

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}