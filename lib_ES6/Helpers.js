/*
#     CloudBoost Flow - Flow-Based Programming for JavaScript
#     (c) 2014 HackerBay, Inc. 
#     CloudBoost Flow may be freely distributed under the Apache 2 License
*/
let { StreamSender } = require('./Streams');
let { StreamReceiver } = require('./Streams');
let InternalSocket = require('./InternalSocket');
let platform =  require('./Platform');
let utils = require('./Utils');

let isArray = function(obj) {
  if (Array.isArray) { return Array.isArray(obj); }
  return Object.prototype.toString.call(arg) === '[object Array]';
};

// MapComponent maps a single inport to a single outport, forwarding all
// groups from in to out and calling `func` on each incoming packet
module.exports.MapComponent = function(component, func, config) {
  platform.deprecated('Flow.helpers.MapComponent is deprecated. Please port Process API');
  if (!config) { config = {}; }
  if (!config.inPort) { config.inPort = 'in'; }
  if (!config.outPort) { config.outPort = 'out'; }

  let inPort = component.inPorts[config.inPort];
  let outPort = component.outPorts[config.outPort];
  let groups = [];
  return inPort.process = function(event, payload) {
    switch (event) {
      case 'connect': return outPort.connect();
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
}

// Wraps OutPort in WirePattern to add transparent scope support
class OutPortWrapper {
  constructor(port, scope) {
    this.port = port;
    this.scope = scope;
  }
  connect(socketId = null) {
    return this.port.openBracket(null, {scope: this.scope}, socketId);
  }
  beginGroup(group, socketId = null) {
    return this.port.openBracket(group, {scope: this.scope}, socketId);
  }
  send(data, socketId = null) {
    return this.port.sendIP('data', data, {scope: this.scope}, socketId, false);
  }
  endGroup(socketId = null) {
    return this.port.closeBracket(null, {scope: this.scope}, socketId);
  }
  disconnect(socketId = null) {
    return this.endGroup(socketId);
  }
  isConnected() { return this.port.isConnected(); }
  isAttached() { return this.port.isAttached(); }
}

// WirePattern makes your component collect data from several inports
// and activates a handler `proc` only when a tuple from all of these
// ports is complete. The signature of handler function is:
// ```
// proc = (combinedInputData, inputGroups, outputPorts, asyncCallback) ->
// ```
//
// With `config.group = true` it checks incoming group IPs and collates
// data with matching group IPs. By default this kind of grouping is `false`.
// Set `config.group` to a RegExp object to correlate inputs only if the
// group matches the expression (e.g. `^req_`). For non-matching groups
// the component will act normally.
//
// With `config.field = 'fieldName' it collates incoming data by specified
// field. The component's proc function is passed a combined object with
// port names used as keys. This kind of grouping is disabled by default.
//
// With `config.forwardGroups = true` it would forward group IPs from
// inputs to the output sending them along with the data. This option also
// accepts string or array values, if you want to forward groups from specific
// port(s) only. By default group forwarding is `false`.
//
// `config.receiveStreams = [portNames]` feature makes the component expect
// substreams on specific inports instead of separate IPs (brackets and data).
// It makes select inports emit `Substream` objects on `data` event
// and silences `beginGroup` and `endGroup` events.
//
// `config.sendStreams = [portNames]` feature makes the component emit entire
// substreams of packets atomically to the outport. Atomically means that a
// substream cannot be interrupted by other packets, which is important when
// doing asynchronous processing. In fact, `sendStreams` is enabled by default
// on all outports when `config.async` is `true`.
//
// WirePattern supports both sync and async `proc` handlers. In latter case
// pass `config.async = true` and make sure that `proc` accepts callback as
// 4th parameter and calls it when async operation completes or fails.
//
// WirePattern sends group packets, sends data packets emitted by `proc`
// via its `outputPort` argument, then closes groups and disconnects
// automatically.
module.exports.WirePattern = function(component, config, proc) {
  // In ports
  let inPorts = 'in' in config ? config.in : 'in';
  if (!isArray(inPorts)) { inPorts = [ inPorts ]; }
  // Out ports
  let outPorts = 'out' in config ? config.out : 'out';
  if (!isArray(outPorts)) { outPorts = [ outPorts ]; }
  // Error port
  if (!('error' in config)) { config.error = 'error'; }
  // For async process
  if (!('async' in config)) { config.async = false; }
  // Keep correct output order for async mode
  if (!('ordered' in config)) { config.ordered = true; }
  // Group requests by group ID
  if (!('group' in config)) { config.group = false; }
  // Group requests by object field
  if (!('field' in config)) { config.field = null; }
  // Forward group events from specific inputs to the output:
  // - false: don't forward anything
  // - true: forward unique groups of all inputs
  // - string: forward groups of a specific port only
  // - array: forward unique groups of inports in the list
  if (!('forwardGroups' in config)) { config.forwardGroups = false; }
  // Receive streams feature
  if (!('receiveStreams' in config)) { config.receiveStreams = false; }
  if (config.receiveStreams) {
    throw new Error('WirePattern receiveStreams is deprecated');
  }
  // if typeof config.receiveStreams is 'string'
  //   config.receiveStreams = [ config.receiveStreams ]
  // Send streams feature
  if (!('sendStreams' in config)) { config.sendStreams = false; }
  if (config.sendStreams) {
    throw new Error('WirePattern sendStreams is deprecated');
  }
  // if typeof config.sendStreams is 'string'
  //   config.sendStreams = [ config.sendStreams ]
  if (config.async) { config.sendStreams = outPorts; }
  // Parameter ports
  if (!('params' in config)) { config.params = []; }
  if (typeof config.params === 'string') { config.params = [ config.params ]; }
  // Node name
  if (!('name' in config)) { config.name = ''; }
  // Drop premature input before all params are received
  if (!('dropInput' in config)) { config.dropInput = false; }
  // Firing policy for addressable ports
  if (!('arrayPolicy' in config)) {
    config.arrayPolicy = {
      in: 'any',
      params: 'all'
    };
  }
  // Garbage collector frequency: execute every N packets
  if (!('gcFrequency' in config)) { config.gcFrequency = 100; }
  // Garbage collector timeout: drop packets older than N seconds
  if (!('gcTimeout' in config)) { config.gcTimeout = 300; }

  let collectGroups = config.forwardGroups;
  // Collect groups from each port?
  if (typeof collectGroups === 'boolean' && !config.group) {
    collectGroups = inPorts;
  }
  // Collect groups from one and only port?
  if (typeof collectGroups === 'string' && !config.group) {
    collectGroups = [collectGroups];
  }
  // Collect groups from any port, as we group by them
  if (collectGroups !== false && config.group) {
    collectGroups = true;
  }

  for (let i = 0; i < inPorts.length; i++) {
    var name = inPorts[i];
    if (!component.inPorts[name]) {
      throw new Error(`no inPort named '${name}'`);
    }
  }
  for (let j = 0; j < outPorts.length; j++) {
    var name = outPorts[j];
    if (!component.outPorts[name]) {
      throw new Error(`no outPort named '${name}'`);
    }
  }

  let disconnectOuts = () =>
    // Manual disconnect forwarding
    (() => {
      let result = [];
      for (let k = 0; k < outPorts.length; k++) {
        let p = outPorts[k];
        let item;
        if (component.outPorts[p].isConnected()) { item = component.outPorts[p].disconnect(); }
        result.push(item);
      }
      return result;
    })()
  ;

  let sendGroupToOuts = grp =>
    outPorts.map((p) =>
      component.outPorts[p].beginGroup(grp))
  ;

  let closeGroupOnOuts = grp =>
    outPorts.map((p) =>
      component.outPorts[p].endGroup(grp))
  ;

  // Declarations
  component.requiredParams = [];
  component.defaultedParams = [];
  component.gcCounter = 0;
  component._wpData = {};
  let _wp = function(scope) {
    if (!(scope in component._wpData)) {
      component._wpData[scope] = {};
      // Input grouping
      component._wpData[scope].groupedData = {};
      component._wpData[scope].groupedGroups = {};
      component._wpData[scope].groupedDisconnects = {};

      // Params and queues
      component._wpData[scope].outputQ = [];
      component._wpData[scope].taskQ = [];
      component._wpData[scope].params = {};
      component._wpData[scope].completeParams = [];
      component._wpData[scope].receivedParams = [];
      component._wpData[scope].defaultsSent = false;

      // Disconnect event forwarding
      component._wpData[scope].disconnectData = {};
      component._wpData[scope].disconnectQ = [];

      // GC and rest
      component._wpData[scope].groupBuffers = {};
      component._wpData[scope].keyBuffers = {};
      component._wpData[scope].gcTimestamps = {};
    }
    return component._wpData[scope];
  };
  component.params = {};
  let setParamsScope = scope => component.params = _wp(scope).params;

  // For ordered output
  let processQueue = function(scope) {
    while (_wp(scope).outputQ.length > 0) {
      let streams = _wp(scope).outputQ[0];
      let flushed = false;
      // Null in the queue means "disconnect all"
      if (streams === null) {
        disconnectOuts();
        flushed = true;
      } else {
        // At least one of the outputs has to be resolved
        // for output streams to be flushed.
        if (outPorts.length === 1) {
          let tmp = {};
          tmp[outPorts[0]] = streams;
          streams = tmp;
        }
        for (let key in streams) {
          let stream = streams[key];
          if (stream.resolved) {
            stream.flush();
            flushed = true;
          }
        }
      }
      if (flushed) { _wp(scope).outputQ.shift(); }
      if (!flushed) { return; }
    }
  };

  if (config.async) {
    if ('load' in component.outPorts) { component.load = 0; }
    // Create before and after hooks
    component.beforeProcess = function(scope, outs) {
      if (config.ordered) { _wp(scope).outputQ.push(outs); }
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
    if (component.defaultedParams.length > 0) {
      for (let k = 0; k < component.defaultedParams.length; k++) {
        let param = component.defaultedParams[k];
        if (_wp(scope).receivedParams.indexOf(param) === -1) {
          let tempSocket = InternalSocket.createSocket();
          component.inPorts[param].attach(tempSocket);
          tempSocket.send();
          tempSocket.disconnect();
          component.inPorts[param].detach(tempSocket);
        }
      }
    }
    return _wp(scope).defaultsSent = true;
  };

  let resumeTaskQ = function(scope) {
    if (_wp(scope).completeParams.length === component.requiredParams.length &&
    _wp(scope).taskQ.length > 0) {
      // Avoid looping when feeding the queue inside the queue itself
      let temp = _wp(scope).taskQ.slice(0);
      _wp(scope).taskQ = [];
      return (() => {
        let result = [];
        while (temp.length > 0) {
          let task = temp.shift();
          result.push(task());
        }
        return result;
      })();
    }
  };
  for (let k = 0; k < config.params.length; k++) {
    var port = config.params[k];
    if (!component.inPorts[port]) {
      throw new Error(`no inPort named '${port}'`);
    }
    if (component.inPorts[port].isRequired()) { component.requiredParams.push(port); }
    if (component.inPorts[port].hasDefault()) { component.defaultedParams.push(port); }
  }
  for (let i1 = 0; i1 < config.params.length; i1++) {
    var port = config.params[i1];
    (function(port) {
      let inPort = component.inPorts[port];
      return inPort.handle = function(ip) {
        let event = ip.type;
        let payload = ip.data;
        let { scope } = ip;
        let { index } = ip;
        // Param ports only react on data
        if (event !== 'data') { return; }
        if (inPort.isAddressable()) {
          if (!(port in _wp(scope).params)) { _wp(scope).params[port] = {}; }
          _wp(scope).params[port][index] = payload;
          if (config.arrayPolicy.params === 'all' &&
          Object.keys(_wp(scope).params[port]).length < inPort.listAttached().length) {
            return; // Need data on all array indexes to proceed
          }
        } else {
          _wp(scope).params[port] = payload;
        }
        if (_wp(scope).completeParams.indexOf(port) === -1 &&
        component.requiredParams.indexOf(port) > -1) {
          _wp(scope).completeParams.push(port);
        }
        _wp(scope).receivedParams.push(port);
        // Trigger pending procs if all params are complete
        return resumeTaskQ(scope);
      };
    })(port);
  }

  // Garbage collector
  component.dropRequest = function(scope, key) {
    // Discard pending disconnect keys
    if (key in _wp(scope).disconnectData) { delete _wp(scope).disconnectData[key]; }
    // Clean grouped data
    if (key in _wp(scope).groupedData) { delete _wp(scope).groupedData[key]; }
    if (key in _wp(scope).groupedGroups) { return delete _wp(scope).groupedGroups[key]; }
  };

  let gc = function() {
    component.gcCounter++;
    if (component.gcCounter % config.gcFrequency === 0) {
      let current;
      return Object.keys(component._wpData).map((scope) =>
        (current = new Date().getTime(),
        (() => {
          let result = [];
          let object = _wp(scope).gcTimestamps;
          for (let key in object) {
            let val = object[key];
            let item;
            if ((current - val) > (config.gcTimeout * 1000)) {
              component.dropRequest(scope, key);
              item = delete _wp(scope).gcTimestamps[key];
            result.push(item);
            }
          }
          return result;
        })()));
    }
  };

  // Grouped ports
  for (let j1 = 0; j1 < inPorts.length; j1++) {
    var port = inPorts[j1];
    (function(port) {
      // Support for StreamReceiver ports
      // if config.receiveStreams and config.receiveStreams.indexOf(port) isnt -1
      //   inPort = new StreamReceiver component.inPorts[port]
      let inPort = component.inPorts[port];

      let needPortGroups = collectGroups instanceof Array && collectGroups.indexOf(port) !== -1;

      // Set processing callback
      return inPort.handle = function(ip) {
        let { index } = ip;
        let payload = ip.data;
        let { scope } = ip;
        if (!(port in _wp(scope).groupBuffers)) { _wp(scope).groupBuffers[port] = []; }
        if (!(port in _wp(scope).keyBuffers)) { _wp(scope).keyBuffers[port] = null; }
        switch (ip.type) {
          case 'openBracket':
            if (payload === null) { return; }
            _wp(scope).groupBuffers[port].push(payload);
            if (config.forwardGroups && (collectGroups === true || needPortGroups) && !config.async) {
              return sendGroupToOuts(payload);
            }
          case 'closeBracket':
            _wp(scope).groupBuffers[port] = _wp(scope).groupBuffers[port].slice(0, _wp(scope).groupBuffers[port].length - 1);
            if (config.forwardGroups && (collectGroups === true || needPortGroups) && !config.async) {
              // FIXME probably need to skip this if payload is null
              closeGroupOnOuts(payload);
            }
            // Disconnect
            if (_wp(scope).groupBuffers[port].length === 0 && payload === null) {
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
                var foundGroup = false;
                var key = _wp(scope).keyBuffers[port];
                if (!(key in _wp(scope).disconnectData)) { _wp(scope).disconnectData[key] = []; }
                let iterable = __range__(0, _wp(scope).disconnectData[key].length, false);
                for (let k1 = 0; k1 < iterable.length; k1++) {
                  var i = iterable[k1];
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
                      if (_wp(scope).disconnectData[key].length === 0) { delete _wp(scope).disconnectData[key]; }
                    }
                    break;
                  }
                }
                if (!foundGroup) {
                  var obj = {};
                  obj[port] = true;
                  return _wp(scope).disconnectData[key].push(obj);
                }
              }
            }

          case 'data':
            if (inPorts.length === 1 && !inPort.isAddressable()) {
              var data = payload;
              var groups = _wp(scope).groupBuffers[port];
            } else {
              var key = '';
              if (config.group && _wp(scope).groupBuffers[port].length > 0) {
                key = _wp(scope).groupBuffers[port].toString();
                if (config.group instanceof RegExp) {
                  let reqId = null;
                  let iterable1 = _wp(scope).groupBuffers[port];
                  for (let i2 = 0; i2 < iterable1.length; i2++) {
                    let grp = iterable1[i2];
                    if (config.group.test(grp)) {
                      reqId = grp;
                      break;
                    }
                  }
                  key = reqId ? reqId : '';
                }
              } else if (config.field && typeof(payload) === 'object' &&
              config.field in payload) {
                key = payload[config.field];
              }
              _wp(scope).keyBuffers[port] = key;
              if (!(key in _wp(scope).groupedData)) { _wp(scope).groupedData[key] = []; }
              if (!(key in _wp(scope).groupedGroups)) { _wp(scope).groupedGroups[key] = []; }
              var foundGroup = false;
              let requiredLength = inPorts.length;
              if (config.field) { ++requiredLength; }
              // Check buffered tuples awaiting completion
              let iterable2 = __range__(0, _wp(scope).groupedData[key].length, false);
              for (let j2 = 0; j2 < iterable2.length; j2++) {
                // Check this buffered tuple if it's missing value for this port
                var i = iterable2[j2];
                if (!(port in _wp(scope).groupedData[key][i]) ||
                (component.inPorts[port].isAddressable() &&
                config.arrayPolicy.in === 'all' &&
                !(index in _wp(scope).groupedData[key][i][port]))) {
                  foundGroup = true;
                  if (component.inPorts[port].isAddressable()) {
                    // Maintain indexes for addressable ports
                    if (!(port in _wp(scope).groupedData[key][i])) {
                      _wp(scope).groupedData[key][i][port] = {};
                    }
                    _wp(scope).groupedData[key][i][port][index] = payload;
                  } else {
                    _wp(scope).groupedData[key][i][port] = payload;
                  }
                  if (needPortGroups) {
                    // Include port groups into the set of the unique ones
                    _wp(scope).groupedGroups[key][i] = utils.unique([..._wp(scope).groupedGroups[key][i], ..._wp(scope).groupBuffers[port]]);
                  } else if (collectGroups === true) {
                    // All the groups we need are here in this port
                    _wp(scope).groupedGroups[key][i][port] = _wp(scope).groupBuffers[port];
                  }
                  // Addressable ports may require other indexes
                  if (component.inPorts[port].isAddressable() &&
                  config.arrayPolicy.in === 'all' &&
                  Object.keys(_wp(scope).groupedData[key][i][port]).length <
                  component.inPorts[port].listAttached().length) {
                    return; // Need data on other array port indexes to arrive
                  }

                  let groupLength = Object.keys(_wp(scope).groupedData[key][i]).length;
                  // Check if the tuple is complete
                  if (groupLength === requiredLength) {
                    var data = (_wp(scope).groupedData[key].splice(i, 1))[0];
                    // Strip port name if there's only one inport
                    if (inPorts.length === 1 && inPort.isAddressable()) {
                      data = data[port];
                    }
                    var groups = (_wp(scope).groupedGroups[key].splice(i, 1))[0];
                    if (collectGroups === true) {
                      groups = utils.intersection.apply(null, utils.getValues(groups));
                    }
                    if (_wp(scope).groupedData[key].length === 0) { delete _wp(scope).groupedData[key]; }
                    if (_wp(scope).groupedGroups[key].length === 0) { delete _wp(scope).groupedGroups[key]; }
                    if (config.group && key) {
                      delete _wp(scope).gcTimestamps[key];
                    }
                    break;
                  } else {
                    return; // need more data to continue
                  }
                }
              }
              if (!foundGroup) {
                // Create a new tuple
                var obj = {};
                if (config.field) { obj[config.field] = key; }
                if (component.inPorts[port].isAddressable()) {
                  obj[port] = {};  obj[port][index] = payload;
                } else {
                  obj[port] = payload;
                }
                if (inPorts.length === 1 &&
                component.inPorts[port].isAddressable() &&
                (config.arrayPolicy.in === 'any' ||
                component.inPorts[port].listAttached().length === 1)) {
                  // This packet is all we need
                  var data = obj[port];
                  var groups = _wp(scope).groupBuffers[port];
                } else {
                  _wp(scope).groupedData[key].push(obj);
                  if (needPortGroups) {
                    _wp(scope).groupedGroups[key].push(_wp(scope).groupBuffers[port]);
                  } else if (collectGroups === true) {
                    let tmp = {};  tmp[port] = _wp(scope).groupBuffers[port];
                    _wp(scope).groupedGroups[key].push(tmp);
                  } else {
                    _wp(scope).groupedGroups[key].push([]);
                  }
                  if (config.group && key) {
                    // Timestamp to garbage collect this request
                    _wp(scope).gcTimestamps[key] = new Date().getTime();
                  }
                  return; // need more data to continue
                }
              }
            }

            // Drop premature data if configured to do so
            if (config.dropInput && _wp(scope).completeParams.length !== component.requiredParams.length) { return; }

            // Prepare outputs
            let outs = {};
            for (let k2 = 0; k2 < outPorts.length; k2++) {
              var name = outPorts[k2];
              let wrp = new OutPortWrapper(component.outPorts[name], scope);
              if ((config.async || config.sendStreams) &&
              config.sendStreams.indexOf(name) !== -1) {
                wrp;
                outs[name] = new StreamSender(wrp, config.ordered);
              } else {
                outs[name] = wrp;
              }
            }

            if (outPorts.length === 1) { outs = outs[outPorts[0]]; } // for simplicity
            if (!groups) { var groups = []; }
            // Filter empty connect/disconnect groups
            var groups = (groups.filter((g) => g !== null).map((g) => g));
            let whenDoneGroups = groups.slice(0);
            let whenDone = function(err) {
              if (err) {
                component.error(err, whenDoneGroups, 'error', scope);
              }
              // For use with MultiError trait
              if (typeof component.fail === 'function' && component.hasErrors) {
                component.fail(null, [], scope);
              }
              // Disconnect outputs if still connected,
              // this also indicates them as resolved if pending
              let outputs = outs;
              if (outPorts.length === 1) {
                outputs = {};
                outputs[port] = outs;
              }
              let disconnect = false;
              if (_wp(scope).disconnectQ.length > 0) {
                _wp(scope).disconnectQ.shift();
                disconnect = true;
              }
              for (let name in outputs) {
                let out = outputs[name];
                if (config.forwardGroups && config.async) { for (let i3 = 0; i3 < whenDoneGroups.length; i3++) { let i = whenDoneGroups[i3]; out.endGroup(); } }
                if (disconnect) { out.disconnect(); }
                if (config.async || config.StreamSender) { out.done(); }
              }
              if (typeof component.afterProcess === 'function') {
                return component.afterProcess(scope, err || component.hasErrors, outs);
              }
            };

            // Before hook
            if (typeof component.beforeProcess === 'function') {
              component.beforeProcess(scope, outs);
            }

            // Group forwarding
            if (config.forwardGroups && config.async) {
              if (outPorts.length === 1) {
                for (let i3 = 0; i3 < groups.length; i3++) { var g = groups[i3]; outs.beginGroup(g); }
              } else {
                for (var name in outs) {
                  let out = outs[name];
                  for (let j3 = 0; j3 < groups.length; j3++) { var g = groups[j3]; out.beginGroup(g); }
                }
              }
            }

            // Enforce MultiError with WirePattern (for group forwarding)
            exports.MultiError(component, config.name, config.error, groups, scope);

            // Call the proc function
            if (config.async) {
              let postpone = function() {};
              let resume = function() {};
              let postponedToQ = false;
              var task = function() {
                setParamsScope(scope);
                return proc.call(component, data, groups, outs, whenDone, postpone, resume, scope);
              };
              postpone = function(backToQueue = true) {
                postponedToQ = backToQueue;
                if (backToQueue) {
                  return _wp(scope).taskQ.push(task);
                }
              };
              resume = function() {
                if (postponedToQ) { return resumeTaskQ(); } else { return task(); }
              };
            } else {
              var task = function() {
                setParamsScope(scope);
                proc.call(component, data, groups, outs, null, null, null, scope);
                return whenDone();
              };
            }
            _wp(scope).taskQ.push(task);
            resumeTaskQ(scope);

            // Call the garbage collector
            return gc();
        }
      };
    })(port);
  }

  // Overload shutdown method to clean WirePattern state
  let baseShutdown = component.shutdown;
  component.shutdown = function() {
    baseShutdown.call(component);
    component.requiredParams = [];
    component.defaultedParams = [];
    component.gcCounter = 0;
    component._wpData = {};
    return component.params = {};
  };

  // Make it chainable or usable at the end of getComponent()
  return component;
}

// Alias for compatibility with 0.5.3
module.exports.GroupedInput = module.exports.WirePattern;


// `CustomError` returns an `Error` object carrying additional properties.
module.exports.CustomError = function(message, options) {
  let err = new Error(message);
  return exports.CustomizeError(err, options);
}

// `CustomizeError` sets additional options for an `Error` object.
module.exports.CustomizeError = function(err, options) {
  for (let key of Object.keys(options)) {
    let val = options[key];
    err[key] = val;
  }
  return err;
}


// `MultiError` simplifies throwing and handling multiple error objects
// during a single component activation.
//
// `group` is an optional group ID which will be used to wrap all error
// packets emitted by the component.
module.exports.MultiError = function(component, group = '', errorPort = 'error', forwardedGroups = [], scope = null) {
  component.hasErrors = false;
  component.errors = [];
  if (component.name && !group) { group = component.name; }
  if (!group) { group = 'Component'; }

  // Override component.error to support group information
  component.error = function(e, groups = []) {
    component.errors.push({
      err: e,
      groups: forwardedGroups.concat(groups)
    });
    return component.hasErrors = true;
  };

  // Fail method should be called to terminate process immediately
  // or to flush error packets.
  component.fail = function(e = null, groups = []) {
    if (e) { component.error(e, groups); }
    if (!component.hasErrors) { return; }
    if (!(errorPort in component.outPorts)) { return; }
    if (!component.outPorts[errorPort].isAttached()) { return; }
    if (group) { component.outPorts[errorPort].openBracket(group, {scope}); }
    for (let i = 0; i < component.errors.length; i++) {
      let error = component.errors[i];
      for (let j = 0; j < error.groups.length; j++) { var grp = error.groups[j]; component.outPorts[errorPort].openBracket(grp, {scope}); }
      component.outPorts[errorPort].data(error.err, {scope});
      for (let k = 0; k < error.groups.length; k++) { var grp = error.groups[k]; component.outPorts[errorPort].closeBracket(grp, {scope}); }
    }
    if (group) { component.outPorts[errorPort].closeBracket(group, {scope}); }
    // component.outPorts[errorPort].disconnect()
    // Clean the status for next activation
    component.hasErrors = false;
    return component.errors = [];
  };

  // Overload shutdown method to clear errors
  let baseShutdown = component.shutdown;
  component.shutdown = function() {
    baseShutdown.call(component);
    component.hasErrors = false;
    return component.errors = [];
  };

  return component;
}

function __range__(left, right, inclusive) {
  let range = [];
  let ascending = left < right;
  let end = !inclusive ? right : ascending ? right + 1 : right - 1;
  for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
    range.push(i);
  }
  return range;
}