(function() {
  var InternalSocket, OutPortWrapper, StreamReceiver, StreamSender, isArray, platform, utils,
    slice = [].slice,
    hasProp = {}.hasOwnProperty;

  StreamSender = require('./Streams').StreamSender;

  StreamReceiver = require('./Streams').StreamReceiver;

  InternalSocket = require('./InternalSocket');

  platform = require('./Platform');

  utils = require('./Utils');

  isArray = function(obj) {
    if (Array.isArray) {
      return Array.isArray(obj);
    }
    return Object.prototype.toString.call(arg) === '[object Array]';
  };

  exports.MapComponent = function(component, func, config) {
    var groups, inPort, outPort;
    platform.deprecated('noflo.helpers.MapComponent is deprecated. Please port Process API');
    if (!config) {
      config = {};
    }
    if (!config.inPort) {
      config.inPort = 'in';
    }
    if (!config.outPort) {
      config.outPort = 'out';
    }
    inPort = component.inPorts[config.inPort];
    outPort = component.outPorts[config.outPort];
    groups = [];
    return inPort.process = function(event, payload) {
      switch (event) {
        case 'connect':
          return outPort.connect();
        case 'begingroup':
          groups.push(payload);
          return outPort.beginGroup(payload);
        case 'data':
          return func(payload, groups, outPort);
        case 'endgroup':
          groups.pop();
          return outPort.endGroup();
        case 'disconnect':
          groups = [];
          return outPort.disconnect();
      }
    };
  };

  OutPortWrapper = (function() {
    function OutPortWrapper(port1, scope1) {
      this.port = port1;
      this.scope = scope1;
    }

    OutPortWrapper.prototype.connect = function(socketId) {
      if (socketId == null) {
        socketId = null;
      }
      return this.port.openBracket(null, {
        scope: this.scope
      }, socketId);
    };

    OutPortWrapper.prototype.beginGroup = function(group, socketId) {
      if (socketId == null) {
        socketId = null;
      }
      return this.port.openBracket(group, {
        scope: this.scope
      }, socketId);
    };

    OutPortWrapper.prototype.send = function(data, socketId) {
      if (socketId == null) {
        socketId = null;
      }
      return this.port.sendIP('data', data, {
        scope: this.scope
      }, socketId, false);
    };

    OutPortWrapper.prototype.endGroup = function(socketId) {
      if (socketId == null) {
        socketId = null;
      }
      return this.port.closeBracket(null, {
        scope: this.scope
      }, socketId);
    };

    OutPortWrapper.prototype.disconnect = function(socketId) {
      if (socketId == null) {
        socketId = null;
      }
      return this.endGroup(socketId);
    };

    OutPortWrapper.prototype.isConnected = function() {
      return this.port.isConnected();
    };

    OutPortWrapper.prototype.isAttached = function() {
      return this.port.isAttached();
    };

    return OutPortWrapper;

  })();

  exports.WirePattern = function(component, config, proc) {
    var _wp, baseShutdown, closeGroupOnOuts, collectGroups, disconnectOuts, fn, fn1, gc, inPorts, j, k, l, len, len1, len2, len3, len4, m, n, name, outPorts, port, processQueue, ref, ref1, resumeTaskQ, sendGroupToOuts, setParamsScope;
    inPorts = 'in' in config ? config["in"] : 'in';
    if (!isArray(inPorts)) {
      inPorts = [inPorts];
    }
    outPorts = 'out' in config ? config.out : 'out';
    if (!isArray(outPorts)) {
      outPorts = [outPorts];
    }
    if (!('error' in config)) {
      config.error = 'error';
    }
    if (!('async' in config)) {
      config.async = false;
    }
    if (!('ordered' in config)) {
      config.ordered = true;
    }
    if (!('group' in config)) {
      config.group = false;
    }
    if (!('field' in config)) {
      config.field = null;
    }
    if (!('forwardGroups' in config)) {
      config.forwardGroups = false;
    }
    if (!('receiveStreams' in config)) {
      config.receiveStreams = false;
    }
    if (config.receiveStreams) {
      throw new Error('WirePattern receiveStreams is deprecated');
    }
    if (!('sendStreams' in config)) {
      config.sendStreams = false;
    }
    if (config.sendStreams) {
      throw new Error('WirePattern sendStreams is deprecated');
    }
    if (config.async) {
      config.sendStreams = outPorts;
    }
    if (!('params' in config)) {
      config.params = [];
    }
    if (typeof config.params === 'string') {
      config.params = [config.params];
    }
    if (!('name' in config)) {
      config.name = '';
    }
    if (!('dropInput' in config)) {
      config.dropInput = false;
    }
    if (!('arrayPolicy' in config)) {
      config.arrayPolicy = {
        "in": 'any',
        params: 'all'
      };
    }
    if (!('gcFrequency' in config)) {
      config.gcFrequency = 100;
    }
    if (!('gcTimeout' in config)) {
      config.gcTimeout = 300;
    }
    collectGroups = config.forwardGroups;
    if (typeof collectGroups === 'boolean' && !config.group) {
      collectGroups = inPorts;
    }
    if (typeof collectGroups === 'string' && !config.group) {
      collectGroups = [collectGroups];
    }
    if (collectGroups !== false && config.group) {
      collectGroups = true;
    }
    for (j = 0, len = inPorts.length; j < len; j++) {
      name = inPorts[j];
      if (!component.inPorts[name]) {
        throw new Error("no inPort named '" + name + "'");
      }
    }
    for (k = 0, len1 = outPorts.length; k < len1; k++) {
      name = outPorts[k];
      if (!component.outPorts[name]) {
        throw new Error("no outPort named '" + name + "'");
      }
    }
    disconnectOuts = function() {
      var l, len2, p, results;
      results = [];
      for (l = 0, len2 = outPorts.length; l < len2; l++) {
        p = outPorts[l];
        if (component.outPorts[p].isConnected()) {
          results.push(component.outPorts[p].disconnect());
        } else {
          results.push(void 0);
        }
      }
      return results;
    };
    sendGroupToOuts = function(grp) {
      var l, len2, p, results;
      results = [];
      for (l = 0, len2 = outPorts.length; l < len2; l++) {
        p = outPorts[l];
        results.push(component.outPorts[p].beginGroup(grp));
      }
      return results;
    };
    closeGroupOnOuts = function(grp) {
      var l, len2, p, results;
      results = [];
      for (l = 0, len2 = outPorts.length; l < len2; l++) {
        p = outPorts[l];
        results.push(component.outPorts[p].endGroup(grp));
      }
      return results;
    };
    component.requiredParams = [];
    component.defaultedParams = [];
    component.gcCounter = 0;
    component._wpData = {};
    _wp = function(scope) {
      if (!(scope in component._wpData)) {
        component._wpData[scope] = {};
        component._wpData[scope].groupedData = {};
        component._wpData[scope].groupedGroups = {};
        component._wpData[scope].groupedDisconnects = {};
        component._wpData[scope].outputQ = [];
        component._wpData[scope].taskQ = [];
        component._wpData[scope].params = {};
        component._wpData[scope].completeParams = [];
        component._wpData[scope].receivedParams = [];
        component._wpData[scope].defaultsSent = false;
        component._wpData[scope].disconnectData = {};
        component._wpData[scope].disconnectQ = [];
        component._wpData[scope].groupBuffers = {};
        component._wpData[scope].keyBuffers = {};
        component._wpData[scope].gcTimestamps = {};
      }
      return component._wpData[scope];
    };
    component.params = {};
    setParamsScope = function(scope) {
      return component.params = _wp(scope).params;
    };
    processQueue = function(scope) {
      var flushed, key, stream, streams, tmp;
      while (_wp(scope).outputQ.length > 0) {
        streams = _wp(scope).outputQ[0];
        flushed = false;
        if (streams === null) {
          disconnectOuts();
          flushed = true;
        } else {
          if (outPorts.length === 1) {
            tmp = {};
            tmp[outPorts[0]] = streams;
            streams = tmp;
          }
          for (key in streams) {
            stream = streams[key];
            if (stream.resolved) {
              stream.flush();
              flushed = true;
            }
          }
        }
        if (flushed) {
          _wp(scope).outputQ.shift();
        }
        if (!flushed) {
          return;
        }
      }
    };
    if (config.async) {
      if ('load' in component.outPorts) {
        component.load = 0;
      }
      component.beforeProcess = function(scope, outs) {
        if (config.ordered) {
          _wp(scope).outputQ.push(outs);
        }
        component.load++;
        if ('load' in component.outPorts && component.outPorts.load.isAttached()) {
          component.outPorts.load.send(component.load);
          return component.outPorts.load.disconnect();
        }
      };
      component.afterProcess = function(scope, err, outs) {
        processQueue(scope);
        component.load--;
        if ('load' in component.outPorts && component.outPorts.load.isAttached()) {
          component.outPorts.load.send(component.load);
          return component.outPorts.load.disconnect();
        }
      };
    }
    component.sendDefaults = function(scope) {
      var l, len2, param, ref, tempSocket;
      if (component.defaultedParams.length > 0) {
        ref = component.defaultedParams;
        for (l = 0, len2 = ref.length; l < len2; l++) {
          param = ref[l];
          if (_wp(scope).receivedParams.indexOf(param) === -1) {
            tempSocket = InternalSocket.createSocket();
            component.inPorts[param].attach(tempSocket);
            tempSocket.send();
            tempSocket.disconnect();
            component.inPorts[param].detach(tempSocket);
          }
        }
      }
      return _wp(scope).defaultsSent = true;
    };
    resumeTaskQ = function(scope) {
      var results, task, temp;
      if (_wp(scope).completeParams.length === component.requiredParams.length && _wp(scope).taskQ.length > 0) {
        temp = _wp(scope).taskQ.slice(0);
        _wp(scope).taskQ = [];
        results = [];
        while (temp.length > 0) {
          task = temp.shift();
          results.push(task());
        }
        return results;
      }
    };
    ref = config.params;
    for (l = 0, len2 = ref.length; l < len2; l++) {
      port = ref[l];
      if (!component.inPorts[port]) {
        throw new Error("no inPort named '" + port + "'");
      }
      if (component.inPorts[port].isRequired()) {
        component.requiredParams.push(port);
      }
      if (component.inPorts[port].hasDefault()) {
        component.defaultedParams.push(port);
      }
    }
    ref1 = config.params;
    fn = function(port) {
      var inPort;
      inPort = component.inPorts[port];
      return inPort.handle = function(ip) {
        var event, index, payload, scope;
        event = ip.type;
        payload = ip.data;
        scope = ip.scope;
        index = ip.index;
        if (event !== 'data') {
          return;
        }
        if (inPort.isAddressable()) {
          if (!(port in _wp(scope).params)) {
            _wp(scope).params[port] = {};
          }
          _wp(scope).params[port][index] = payload;
          if (config.arrayPolicy.params === 'all' && Object.keys(_wp(scope).params[port]).length < inPort.listAttached().length) {
            return;
          }
        } else {
          _wp(scope).params[port] = payload;
        }
        if (_wp(scope).completeParams.indexOf(port) === -1 && component.requiredParams.indexOf(port) > -1) {
          _wp(scope).completeParams.push(port);
        }
        _wp(scope).receivedParams.push(port);
        return resumeTaskQ(scope);
      };
    };
    for (m = 0, len3 = ref1.length; m < len3; m++) {
      port = ref1[m];
      fn(port);
    }
    component.dropRequest = function(scope, key) {
      if (key in _wp(scope).disconnectData) {
        delete _wp(scope).disconnectData[key];
      }
      if (key in _wp(scope).groupedData) {
        delete _wp(scope).groupedData[key];
      }
      if (key in _wp(scope).groupedGroups) {
        return delete _wp(scope).groupedGroups[key];
      }
    };
    gc = function() {
      var current, key, len4, n, ref2, results, scope, val;
      component.gcCounter++;
      if (component.gcCounter % config.gcFrequency === 0) {
        ref2 = Object.keys(component._wpData);
        results = [];
        for (n = 0, len4 = ref2.length; n < len4; n++) {
          scope = ref2[n];
          current = new Date().getTime();
          results.push((function() {
            var ref3, results1;
            ref3 = _wp(scope).gcTimestamps;
            results1 = [];
            for (key in ref3) {
              val = ref3[key];
              if ((current - val) > (config.gcTimeout * 1000)) {
                component.dropRequest(scope, key);
                results1.push(delete _wp(scope).gcTimestamps[key]);
              } else {
                results1.push(void 0);
              }
            }
            return results1;
          })());
        }
        return results;
      }
    };
    fn1 = function(port) {
      var inPort, needPortGroups;
      inPort = component.inPorts[port];
      needPortGroups = collectGroups instanceof Array && collectGroups.indexOf(port) !== -1;
      return inPort.handle = function(ip) {
        var data, foundGroup, g, groupLength, groups, grp, i, index, key, len5, len6, len7, len8, o, obj, out, outs, payload, postpone, postponedToQ, q, r, ref2, ref3, ref4, reqId, requiredLength, resume, s, scope, t, task, tmp, u, whenDone, whenDoneGroups, wrp;
        index = ip.index;
        payload = ip.data;
        scope = ip.scope;
        if (!(port in _wp(scope).groupBuffers)) {
          _wp(scope).groupBuffers[port] = [];
        }
        if (!(port in _wp(scope).keyBuffers)) {
          _wp(scope).keyBuffers[port] = null;
        }
        switch (ip.type) {
          case 'openBracket':
            if (payload === null) {
              return;
            }
            _wp(scope).groupBuffers[port].push(payload);
            if (config.forwardGroups && (collectGroups === true || needPortGroups) && !config.async) {
              return sendGroupToOuts(payload);
            }
            break;
          case 'closeBracket':
            _wp(scope).groupBuffers[port] = _wp(scope).groupBuffers[port].slice(0, _wp(scope).groupBuffers[port].length - 1);
            if (config.forwardGroups && (collectGroups === true || needPortGroups) && !config.async) {
              closeGroupOnOuts(payload);
            }
            if (_wp(scope).groupBuffers[port].length === 0) {
              if (inPorts.length === 1) {
                if (config.async || config.StreamSender) {
                  if (config.ordered) {
                    _wp(scope).outputQ.push(null);
                    return processQueue(scope);
                  } else {
                    return _wp(scope).disconnectQ.push(true);
                  }
                } else {
                  return disconnectOuts();
                }
              } else {
                foundGroup = false;
                key = _wp(scope).keyBuffers[port];
                if (!(key in _wp(scope).disconnectData)) {
                  _wp(scope).disconnectData[key] = [];
                }
                for (i = o = 0, ref2 = _wp(scope).disconnectData[key].length; 0 <= ref2 ? o < ref2 : o > ref2; i = 0 <= ref2 ? ++o : --o) {
                  if (!(port in _wp(scope).disconnectData[key][i])) {
                    foundGroup = true;
                    _wp(scope).disconnectData[key][i][port] = true;
                    if (Object.keys(_wp(scope).disconnectData[key][i]).length === inPorts.length) {
                      _wp(scope).disconnectData[key].shift();
                      if (config.async || config.StreamSender) {
                        if (config.ordered) {
                          _wp(scope).outputQ.push(null);
                          processQueue(scope);
                        } else {
                          _wp(scope).disconnectQ.push(true);
                        }
                      } else {
                        disconnectOuts();
                      }
                      if (_wp(scope).disconnectData[key].length === 0) {
                        delete _wp(scope).disconnectData[key];
                      }
                    }
                    break;
                  }
                }
                if (!foundGroup) {
                  obj = {};
                  obj[port] = true;
                  return _wp(scope).disconnectData[key].push(obj);
                }
              }
            }
            break;
          case 'data':
            if (inPorts.length === 1 && !inPort.isAddressable()) {
              data = payload;
              groups = _wp(scope).groupBuffers[port];
            } else {
              key = '';
              if (config.group && _wp(scope).groupBuffers[port].length > 0) {
                key = _wp(scope).groupBuffers[port].toString();
                if (config.group instanceof RegExp) {
                  reqId = null;
                  ref3 = _wp(scope).groupBuffers[port];
                  for (q = 0, len5 = ref3.length; q < len5; q++) {
                    grp = ref3[q];
                    if (config.group.test(grp)) {
                      reqId = grp;
                      break;
                    }
                  }
                  key = reqId ? reqId : '';
                }
              } else if (config.field && typeof payload === 'object' && config.field in payload) {
                key = payload[config.field];
              }
              _wp(scope).keyBuffers[port] = key;
              if (!(key in _wp(scope).groupedData)) {
                _wp(scope).groupedData[key] = [];
              }
              if (!(key in _wp(scope).groupedGroups)) {
                _wp(scope).groupedGroups[key] = [];
              }
              foundGroup = false;
              requiredLength = inPorts.length;
              if (config.field) {
                ++requiredLength;
              }
              for (i = r = 0, ref4 = _wp(scope).groupedData[key].length; 0 <= ref4 ? r < ref4 : r > ref4; i = 0 <= ref4 ? ++r : --r) {
                if (!(port in _wp(scope).groupedData[key][i]) || (component.inPorts[port].isAddressable() && config.arrayPolicy["in"] === 'all' && !(index in _wp(scope).groupedData[key][i][port]))) {
                  foundGroup = true;
                  if (component.inPorts[port].isAddressable()) {
                    if (!(port in _wp(scope).groupedData[key][i])) {
                      _wp(scope).groupedData[key][i][port] = {};
                    }
                    _wp(scope).groupedData[key][i][port][index] = payload;
                  } else {
                    _wp(scope).groupedData[key][i][port] = payload;
                  }
                  if (needPortGroups) {
                    _wp(scope).groupedGroups[key][i] = utils.unique(slice.call(_wp(scope).groupedGroups[key][i]).concat(slice.call(_wp(scope).groupBuffers[port])));
                  } else if (collectGroups === true) {
                    _wp(scope).groupedGroups[key][i][port] = _wp(scope).groupBuffers[port];
                  }
                  if (component.inPorts[port].isAddressable() && config.arrayPolicy["in"] === 'all' && Object.keys(_wp(scope).groupedData[key][i][port]).length < component.inPorts[port].listAttached().length) {
                    return;
                  }
                  groupLength = Object.keys(_wp(scope).groupedData[key][i]).length;
                  if (groupLength === requiredLength) {
                    data = (_wp(scope).groupedData[key].splice(i, 1))[0];
                    if (inPorts.length === 1 && inPort.isAddressable()) {
                      data = data[port];
                    }
                    groups = (_wp(scope).groupedGroups[key].splice(i, 1))[0];
                    if (collectGroups === true) {
                      groups = utils.intersection.apply(null, utils.getValues(groups));
                    }
                    if (_wp(scope).groupedData[key].length === 0) {
                      delete _wp(scope).groupedData[key];
                    }
                    if (_wp(scope).groupedGroups[key].length === 0) {
                      delete _wp(scope).groupedGroups[key];
                    }
                    if (config.group && key) {
                      delete _wp(scope).gcTimestamps[key];
                    }
                    break;
                  } else {
                    return;
                  }
                }
              }
              if (!foundGroup) {
                obj = {};
                if (config.field) {
                  obj[config.field] = key;
                }
                if (component.inPorts[port].isAddressable()) {
                  obj[port] = {};
                  obj[port][index] = payload;
                } else {
                  obj[port] = payload;
                }
                if (inPorts.length === 1 && component.inPorts[port].isAddressable() && (config.arrayPolicy["in"] === 'any' || component.inPorts[port].listAttached().length === 1)) {
                  data = obj[port];
                  groups = _wp(scope).groupBuffers[port];
                } else {
                  _wp(scope).groupedData[key].push(obj);
                  if (needPortGroups) {
                    _wp(scope).groupedGroups[key].push(_wp(scope).groupBuffers[port]);
                  } else if (collectGroups === true) {
                    tmp = {};
                    tmp[port] = _wp(scope).groupBuffers[port];
                    _wp(scope).groupedGroups[key].push(tmp);
                  } else {
                    _wp(scope).groupedGroups[key].push([]);
                  }
                  if (config.group && key) {
                    _wp(scope).gcTimestamps[key] = new Date().getTime();
                  }
                  return;
                }
              }
            }
            if (config.dropInput && _wp(scope).completeParams.length !== component.requiredParams.length) {
              return;
            }
            outs = {};
            for (s = 0, len6 = outPorts.length; s < len6; s++) {
              name = outPorts[s];
              wrp = new OutPortWrapper(component.outPorts[name], scope);
              if (config.async || config.sendStreams && config.sendStreams.indexOf(name) !== -1) {
                wrp;
                outs[name] = new StreamSender(wrp, config.ordered);
              } else {
                outs[name] = wrp;
              }
            }
            if (outPorts.length === 1) {
              outs = outs[outPorts[0]];
            }
            if (!groups) {
              groups = [];
            }
            groups = (function() {
              var len7, results, t;
              results = [];
              for (t = 0, len7 = groups.length; t < len7; t++) {
                g = groups[t];
                if (g !== null) {
                  results.push(g);
                }
              }
              return results;
            })();
            whenDoneGroups = groups.slice(0);
            whenDone = function(err) {
              var disconnect, len7, out, outputs, t;
              if (err) {
                component.error(err, whenDoneGroups, 'error', scope);
              }
              if (typeof component.fail === 'function' && component.hasErrors) {
                component.fail(null, [], scope);
              }
              outputs = outs;
              if (outPorts.length === 1) {
                outputs = {};
                outputs[port] = outs;
              }
              disconnect = false;
              if (_wp(scope).disconnectQ.length > 0) {
                _wp(scope).disconnectQ.shift();
                disconnect = true;
              }
              for (name in outputs) {
                out = outputs[name];
                if (config.forwardGroups && config.async) {
                  for (t = 0, len7 = whenDoneGroups.length; t < len7; t++) {
                    i = whenDoneGroups[t];
                    out.endGroup();
                  }
                }
                if (disconnect) {
                  out.disconnect();
                }
                if (config.async || config.StreamSender) {
                  out.done();
                }
              }
              if (typeof component.afterProcess === 'function') {
                return component.afterProcess(scope, err || component.hasErrors, outs);
              }
            };
            if (typeof component.beforeProcess === 'function') {
              component.beforeProcess(scope, outs);
            }
            if (config.forwardGroups && config.async) {
              if (outPorts.length === 1) {
                for (t = 0, len7 = groups.length; t < len7; t++) {
                  g = groups[t];
                  outs.beginGroup(g);
                }
              } else {
                for (name in outs) {
                  out = outs[name];
                  for (u = 0, len8 = groups.length; u < len8; u++) {
                    g = groups[u];
                    out.beginGroup(g);
                  }
                }
              }
            }
            exports.MultiError(component, config.name, config.error, groups, scope);
            if (config.async) {
              postpone = function() {};
              resume = function() {};
              postponedToQ = false;
              task = function() {
                setParamsScope(scope);
                return proc.call(component, data, groups, outs, whenDone, postpone, resume, scope);
              };
              postpone = function(backToQueue) {
                if (backToQueue == null) {
                  backToQueue = true;
                }
                postponedToQ = backToQueue;
                if (backToQueue) {
                  return _wp(scope).taskQ.push(task);
                }
              };
              resume = function() {
                if (postponedToQ) {
                  return resumeTaskQ();
                } else {
                  return task();
                }
              };
            } else {
              task = function() {
                setParamsScope(scope);
                proc.call(component, data, groups, outs, null, null, null, scope);
                return whenDone();
              };
            }
            _wp(scope).taskQ.push(task);
            resumeTaskQ(scope);
            return gc();
        }
      };
    };
    for (n = 0, len4 = inPorts.length; n < len4; n++) {
      port = inPorts[n];
      fn1(port);
    }
    baseShutdown = component.shutdown;
    component.shutdown = function() {
      baseShutdown.call(component);
      component.requiredParams = [];
      component.defaultedParams = [];
      component.gcCounter = 0;
      component._wpData = {};
      return component.params = {};
    };
    return component;
  };

  exports.GroupedInput = exports.WirePattern;

  exports.CustomError = function(message, options) {
    var err;
    err = new Error(message);
    return exports.CustomizeError(err, options);
  };

  exports.CustomizeError = function(err, options) {
    var key, val;
    for (key in options) {
      if (!hasProp.call(options, key)) continue;
      val = options[key];
      err[key] = val;
    }
    return err;
  };

  exports.MultiError = function(component, group, errorPort, forwardedGroups, scope) {
    var baseShutdown;
    if (group == null) {
      group = '';
    }
    if (errorPort == null) {
      errorPort = 'error';
    }
    if (forwardedGroups == null) {
      forwardedGroups = [];
    }
    if (scope == null) {
      scope = null;
    }
    component.hasErrors = false;
    component.errors = [];
    if (component.name && !group) {
      group = component.name;
    }
    if (!group) {
      group = 'Component';
    }
    component.error = function(e, groups) {
      if (groups == null) {
        groups = [];
      }
      component.errors.push({
        err: e,
        groups: forwardedGroups.concat(groups)
      });
      return component.hasErrors = true;
    };
    component.fail = function(e, groups) {
      var error, grp, j, k, l, len, len1, len2, ref, ref1, ref2;
      if (e == null) {
        e = null;
      }
      if (groups == null) {
        groups = [];
      }
      if (e) {
        component.error(e, groups);
      }
      if (!component.hasErrors) {
        return;
      }
      if (!(errorPort in component.outPorts)) {
        return;
      }
      if (!component.outPorts[errorPort].isAttached()) {
        return;
      }
      if (group) {
        component.outPorts[errorPort].openBracket(group, {
          scope: scope
        });
      }
      ref = component.errors;
      for (j = 0, len = ref.length; j < len; j++) {
        error = ref[j];
        ref1 = error.groups;
        for (k = 0, len1 = ref1.length; k < len1; k++) {
          grp = ref1[k];
          component.outPorts[errorPort].openBracket(grp, {
            scope: scope
          });
        }
        component.outPorts[errorPort].data(error.err, {
          scope: scope
        });
        ref2 = error.groups;
        for (l = 0, len2 = ref2.length; l < len2; l++) {
          grp = ref2[l];
          component.outPorts[errorPort].closeBracket(grp, {
            scope: scope
          });
        }
      }
      if (group) {
        component.outPorts[errorPort].closeBracket(group, {
          scope: scope
        });
      }
      component.hasErrors = false;
      return component.errors = [];
    };
    baseShutdown = component.shutdown;
    component.shutdown = function() {
      baseShutdown.call(component);
      component.hasErrors = false;
      return component.errors = [];
    };
    return component;
  };

}).call(this);
