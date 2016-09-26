/*
#     CloudBoost Flow - Flow-Based Programming for JavaScript
#     (c) 2014 HackerBay, Inc. 
#     CloudBoost Flow may be freely distributed under the Apache 2 License
*/

//Platform detection method

class Platform {

  static isBrowser() {
    if (typeof process !== 'undefined' && process.execPath && process.execPath.match(/node|iojs/)) {
      return false;
    }
    return true;
  }

  static deprecated(message) {
    if (Platform.isBrowser()) {
      if (window.FLOW_FATAL_DEPRECATED) {
        throw new Error(message);
      }
      console.warn(message);
      return;
    }
    if (process.env.FLOW_FATAL_DEPRECATED) {
      throw new Error(message);
    }
    return console.warn(message);
  }
}
