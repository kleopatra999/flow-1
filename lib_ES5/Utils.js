(function() {
  var clone, contains, createReduce, debounce, getKeys, getValues, guessLanguageFromFilename, intersection, isArray, isObject, optimizeCb, reduceRight, unique;

  clone = function(obj) {
    var flags, key, newInstance;
    if ((obj == null) || typeof obj !== 'object') {
      return obj;
    }
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }
    if (obj instanceof RegExp) {
      flags = '';
      if (obj.global != null) {
        flags += 'g';
      }
      if (obj.ignoreCase != null) {
        flags += 'i';
      }
      if (obj.multiline != null) {
        flags += 'm';
      }
      if (obj.sticky != null) {
        flags += 'y';
      }
      return new RegExp(obj.source, flags);
    }
    newInstance = new obj.constructor();
    for (key in obj) {
      newInstance[key] = clone(obj[key]);
    }
    return newInstance;
  };

  guessLanguageFromFilename = function(filename) {
    if (/.*\.coffee$/.test(filename)) {
      return 'coffeescript';
    }
    return 'javascript';
  };

  isArray = function(obj) {
    if (Array.isArray) {
      return Array.isArray(obj);
    }
    return Object.prototype.toString.call(arg) === '[object Array]';
  };

  isObject = function(obj) {
    var type;
    type = typeof obj;
    return type === 'function' || type === 'object' && !!obj;
  };

  unique = function(array) {
    var k, key, output, ref, results, value;
    output = {};
    for (key = k = 0, ref = array.length; 0 <= ref ? k < ref : k > ref; key = 0 <= ref ? ++k : --k) {
      output[array[key]] = array[key];
    }
    results = [];
    for (key in output) {
      value = output[key];
      results.push(value);
    }
    return results;
  };

  optimizeCb = function(func, context, argCount) {
    if (context === void 0) {
      return func;
    }
    switch ((argCount === null ? 3 : argCount)) {
      case 1:
        return function(value) {
          return func.call(context, value);
        };
      case 2:
        return function(value, other) {
          return func.call(context, value, other);
        };
      case 3:
        return function(value, index, collection) {
          return func.call(context, value, index, collection);
        };
      case 4:
        return function(accumulator, value, index, collection) {
          return func.call(context, accumulator, value, index, collection);
        };
    }
    return function() {
      return func.apply(context, arguments);
    };
  };

  createReduce = function(dir) {
    var iterator;
    iterator = function(obj, iteratee, memo, keys, index, length) {
      var currentKey;
      while (index >= 0 && index < length) {
        currentKey = keys ? keys[index] : index;
        memo = iteratee(memo, obj[currentKey], currentKey, obj);
        index += dir;
      }
      return memo;
    };
    return function(obj, iteratee, memo, context) {
      var index, keys, length;
      iteratee = optimizeCb(iteratee, context, 4);
      keys = Object.keys(obj);
      length = (keys || obj).length;
      index = dir > 0 ? 0 : length - 1;
      if (arguments.length < 3) {
        memo = obj[keys ? keys[index] : index];
        index += dir;
      }
      return iterator(obj, iteratee, memo, keys, index, length);
    };
  };

  reduceRight = createReduce(-1);

  debounce = function(func, wait, immediate) {
    var args, context, later, result, timeout, timestamp;
    timeout = void 0;
    args = void 0;
    context = void 0;
    timestamp = void 0;
    result = void 0;
    later = function() {
      var last;
      last = Date.now - timestamp;
      if (last < wait && last >= 0) {
        timeout = setTimeout(later, wait - last);
      } else {
        timeout = null;
        if (!immediate) {
          result = func.apply(context, args);
          if (!timeout) {
            context = args = null;
          }
        }
      }
    };
    return function() {
      var callNow;
      context = this;
      args = arguments;
      timestamp = Date.now;
      callNow = immediate && !timeout;
      if (!timeout) {
        timeout = setTimeout(later, wait);
      }
      if (callNow) {
        result = func.apply(context, args);
        context = args = null;
      }
      return result;
    };
  };

  getKeys = function(obj) {
    var key, keys;
    if (!isObject(obj)) {
      return [];
    }
    if (Object.keys) {
      return Object.keys(obj);
    }
    keys = [];
    for (key in obj) {
      if (obj.has(key)) {
        keys.push(key);
      }
    }
    return keys;
  };

  getValues = function(obj) {
    var i, keys, length, values;
    keys = getKeys(obj);
    length = keys.length;
    values = Array(length);
    i = 0;
    while (i < length) {
      values[i] = obj[keys[i]];
      i++;
    }
    return values;
  };

  contains = function(obj, item, fromIndex) {
    if (!isArray(obj)) {
      obj = getValues(obj);
    }
    if (typeof fromIndex !== 'number' || guard) {
      fromIndex = 0;
    }
    return obj.indexOf(item) >= 0;
  };

  intersection = function(array) {
    var argsLength, i, item, j, k, l, ref, ref1, result;
    result = [];
    argsLength = arguments.length;
    for (i = k = 0, ref = array.length; 0 <= ref ? k <= ref : k >= ref; i = 0 <= ref ? ++k : --k) {
      item = array[i];
      if (contains(result, item)) {
        continue;
      }
      for (j = l = 1, ref1 = argsLength; 1 <= ref1 ? l <= ref1 : l >= ref1; j = 1 <= ref1 ? ++l : --l) {
        if (!contains(arguments[j], item)) {
          break;
        }
      }
      if (j === argsLength) {
        result.push(item);
      }
    }
    return result;
  };

  exports.clone = clone;

  exports.guessLanguageFromFilename = guessLanguageFromFilename;

  exports.optimizeCb = optimizeCb;

  exports.reduceRight = reduceRight;

  exports.debounce = debounce;

  exports.unique = unique;

  exports.intersection = intersection;

  exports.getValues = getValues;

}).call(this);
