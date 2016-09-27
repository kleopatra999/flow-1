let path = require('path');
let fs = require('fs');
let manifest = require('fbp-manifest');
let utils = require('../Utils');
let flowGraph = require('../Graph');

let registerModules = function (loader, modules, callback) {
    let compatible = modules.filter(m => m.runtime === 'flow' || m.runtime === 'flow-nodejs');
    let componentLoaders = [];
    for (let i = 0; i < compatible.length; i++) {
        let m = compatible[i];
        if (m.icon) { loader.setLibraryIcon(m.name, m.icon); }

        if (__guard__(m.flow, x => x.loader)) {
            let loaderPath = path.resolve(loader.baseDir, m.base, m.flow.loader);
            componentLoaders.push(loaderPath);
        }

        for (let j = 0; j < m.components.length; j++) {
            let c = m.components[j];
            loader.registerComponent(m.name, c.name, path.resolve(loader.baseDir, c.path));
        }
    }

    if (!componentLoaders.length) { return callback(null); }

    let done = function () {
        if (--componentLoaders.length < 1)
            return callback.apply(this, arguments);
        else
            return;
    }

    componentLoaders.forEach(loaderPath => {
        let cLoader = require(loaderPath);
        return loader.registerLoader(cLoader, function (err) {
            if (err) { return callback(err); }
            return done(null);
        }
        );
    });

};



let manifestLoader = {
    writeCache(loader, options, manifest, callback) {
        let filePath = path.resolve(loader.baseDir, options.manifest);
        return fs.writeFile(filePath, JSON.stringify(manifest, null, 2),
            { encoding: 'utf-8' }
            , callback);
    },

    readCache(loader, options, callback) {
        options.discover = false;
        return manifest.load.load(loader.baseDir, options, callback);
    },

    prepareManifestOptions(loader) {
        if (!loader.options) { loader.options = {}; }
        let options = {};
        options.runtimes = loader.options.runtimes || [];
        if (options.runtimes.indexOf('flow') === -1) { options.runtimes.push('flow'); }
        options.recursive = typeof loader.options.recursive === 'undefined' ? true : loader.options.recursive;
        if (!options.manifest) { options.manifest = 'fbp.json'; }
        return options;
    },

    listComponents(loader, manifestOptions, callback) {
        return this.readCache(loader, manifestOptions, (err, manifest) => {
            if (err) {
                if (!loader.options.discover) { return callback(err); }
                dynamicLoader.listComponents(loader, manifestOptions, (err, modules) => {
                    if (err) { return callback(err); }
                    return this.writeCache(loader, manifestOptions, {
                        version: 1,
                        modules
                    }
                        , function (err) {
                            if (err) { return callback(err); }
                            return callback(null, modules);
                        }
                    );
                }
                );
                return;
            }
            return registerModules(loader, manifest.modules, function (err) {
                if (err) { return callback(err); }
                return callback(null, manifest.modules);
            }
            );
        }
        );
    }
};


let dynamicLoader = {
    listComponents(loader, manifestOptions, callback) {
        manifestOptions.discover = true;
        return manifest.list.list(loader.baseDir, manifestOptions, (err, modules) => {
            if (err) { return callback(err); }
            return registerModules(loader, modules, function (err) {
                if (err) { return callback(err); }
                return callback(null, modules);
            }
            );
        }
        );
    }
};

let registerSubgraph = function (loader) {
    // Inject subgraph component
    if (path.extname(__filename) === '.js') {
        var graphPath = path.resolve(__dirname, '../../src/components/Graph.coffee');
    } else {
        var graphPath = path.resolve(__dirname, '../../components/Graph.coffee');
    }
    return loader.registerComponent(null, 'Graph', graphPath);
};

module.exports.register = function(loader, callback) {
    let manifestOptions = manifestLoader.prepareManifestOptions(loader);

    if (__guard__(loader.options, x => x.cache)) {
        manifestLoader.listComponents(loader, manifestOptions, function (err, modules) {
            if (err) { return callback(err); }
            registerSubgraph(loader);
            return callback(null, modules);
        }
        );
        return;
    }

    return dynamicLoader.listComponents(loader, manifestOptions, function (err, modules) {
        if (err) { return callback(err); }
        registerSubgraph(loader);
        return callback(null, modules);
    }
    );
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

function __guard__(value, transform) {
    return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}

module.exports.setSource = function(loader, packageId, name, source, language, callback) {
    let Module = require('module');
    if (language === 'coffeescript') {
        try {
            source = CoffeeScript.compile(source,
                { bare: true });
        } catch (e) {
            return callback(e);
        }
    } else if (language === 'es6' || language === 'es2015') {
        try {
            let babel = require('babel-core');
            source = babel.transform(source).code;
        } catch (e) {
            return callback(e);
        }
    }

    try {
        // Use the Node.js module API to evaluate in the correct directory context
        let modulePath = path.resolve(loader.baseDir, `./components/${name}.js`);
        let moduleImpl = new Module(modulePath, module);
        moduleImpl.paths = Module._nodeModulePaths(path.dirname(modulePath));
        moduleImpl.filename = modulePath;
        moduleImpl._compile(source, modulePath);
        var implementation = moduleImpl.exports;
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
        flowGraph.loadFile(component, function (err, graph) {
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

    return fs.readFile(component, 'utf-8', function (err, code) {
        if (err) { return callback(err); }
        return callback(null, {
            name: nameParts[1],
            library: nameParts[0],
            language: utils.guessLanguageFromFilename(component),
            code
        }
        );
    }
    );
}

