(function() {
  var AsyncComponent, component, platform, port,
    bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  port = require("./Port");

  component = require("./Component");

  platform = require('./Platform');

  AsyncComponent = (function(superClass) {
    extend(AsyncComponent, superClass);

    function AsyncComponent(inPortName, outPortName, errPortName) {
      this.inPortName = inPortName != null ? inPortName : "in";
      this.outPortName = outPortName != null ? outPortName : "out";
      this.errPortName = errPortName != null ? errPortName : "error";
      this.error = bind(this.error, this);
      platform.deprecated('noflo.AsyncComponent is deprecated. Please port to Process API');
      if (!this.inPorts[this.inPortName]) {
        throw new Error("no inPort named '" + this.inPortName + "'");
      }
      if (!this.outPorts[this.outPortName]) {
        throw new Error("no outPort named '" + this.outPortName + "'");
      }
      this.load = 0;
      this.q = [];
      this.errorGroups = [];
      this.outPorts.load = new port.Port();
      this.inPorts[this.inPortName].on("begingroup", (function(_this) {
        return function(group) {
          if (_this.load > 0) {
            return _this.q.push({
              name: "begingroup",
              data: group
            });
          }
          _this.errorGroups.push(group);
          return _this.outPorts[_this.outPortName].beginGroup(group);
        };
      })(this));
      this.inPorts[this.inPortName].on("endgroup", (function(_this) {
        return function() {
          if (_this.load > 0) {
            return _this.q.push({
              name: "endgroup"
            });
          }
          _this.errorGroups.pop();
          return _this.outPorts[_this.outPortName].endGroup();
        };
      })(this));
      this.inPorts[this.inPortName].on("disconnect", (function(_this) {
        return function() {
          if (_this.load > 0) {
            return _this.q.push({
              name: "disconnect"
            });
          }
          _this.outPorts[_this.outPortName].disconnect();
          _this.errorGroups = [];
          if (_this.outPorts.load.isAttached()) {
            return _this.outPorts.load.disconnect();
          }
        };
      })(this));
      this.inPorts[this.inPortName].on("data", (function(_this) {
        return function(data) {
          if (_this.q.length > 0) {
            return _this.q.push({
              name: "data",
              data: data
            });
          }
          return _this.processData(data);
        };
      })(this));
    }

    AsyncComponent.prototype.processData = function(data) {
      this.incrementLoad();
      return this.doAsync(data, (function(_this) {
        return function(err) {
          if (err) {
            _this.error(err, _this.errorGroups, _this.errPortName);
          }
          return _this.decrementLoad();
        };
      })(this));
    };

    AsyncComponent.prototype.incrementLoad = function() {
      this.load++;
      if (this.outPorts.load.isAttached()) {
        this.outPorts.load.send(this.load);
      }
      if (this.outPorts.load.isAttached()) {
        return this.outPorts.load.disconnect();
      }
    };

    AsyncComponent.prototype.doAsync = function(data, callback) {
      return callback(new Error("AsyncComponents must implement doAsync"));
    };

    AsyncComponent.prototype.decrementLoad = function() {
      if (this.load === 0) {
        throw new Error("load cannot be negative");
      }
      this.load--;
      if (this.outPorts.load.isAttached()) {
        this.outPorts.load.send(this.load);
      }
      if (this.outPorts.load.isAttached()) {
        this.outPorts.load.disconnect();
      }
      if (typeof process !== 'undefined' && process.execPath && process.execPath.indexOf('node') !== -1) {
        return process.nextTick((function(_this) {
          return function() {
            return _this.processQueue();
          };
        })(this));
      } else {
        return setTimeout((function(_this) {
          return function() {
            return _this.processQueue();
          };
        })(this), 0);
      }
    };

    AsyncComponent.prototype.processQueue = function() {
      var event, processedData;
      if (this.load > 0) {
        return;
      }
      processedData = false;
      while (this.q.length > 0) {
        event = this.q[0];
        switch (event.name) {
          case "begingroup":
            if (processedData) {
              return;
            }
            this.outPorts[this.outPortName].beginGroup(event.data);
            this.errorGroups.push(event.data);
            this.q.shift();
            break;
          case "endgroup":
            if (processedData) {
              return;
            }
            this.outPorts[this.outPortName].endGroup();
            this.errorGroups.pop();
            this.q.shift();
            break;
          case "disconnect":
            if (processedData) {
              return;
            }
            this.outPorts[this.outPortName].disconnect();
            if (this.outPorts.load.isAttached()) {
              this.outPorts.load.disconnect();
            }
            this.errorGroups = [];
            this.q.shift();
            break;
          case "data":
            this.processData(event.data);
            this.q.shift();
            processedData = true;
        }
      }
    };

    AsyncComponent.prototype.shutdown = function() {
      this.q = [];
      return this.errorGroups = [];
    };

    AsyncComponent.prototype.error = function(e, groups, errorPort) {
      var group, i, j, len, len1;
      if (groups == null) {
        groups = [];
      }
      if (errorPort == null) {
        errorPort = 'error';
      }
      if (this.outPorts[errorPort] && (this.outPorts[errorPort].isAttached() || !this.outPorts[errorPort].isRequired())) {
        for (i = 0, len = groups.length; i < len; i++) {
          group = groups[i];
          this.outPorts[errorPort].beginGroup(group);
        }
        this.outPorts[errorPort].send(e);
        for (j = 0, len1 = groups.length; j < len1; j++) {
          group = groups[j];
          this.outPorts[errorPort].endGroup();
        }
        this.outPorts[errorPort].disconnect();
        return;
      }
      throw e;
    };

    return AsyncComponent;

  })(component.Component);

  exports.AsyncComponent = AsyncComponent;

}).call(this);
