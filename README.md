CloudBoost Flow: Flow-based programming for JavaScript 
=======================================================

CloudBoost Flow is an implementation of [flow-based programming](http://en.wikipedia.org/wiki/Flow-based_programming) for JavaScript running on both Node.js and the browser. From WikiPedia:

> In computer science, flow-based programming (FBP) is a programming paradigm that defines applications as networks of "black box" processes, which exchange data across predefined connections by message passing, where the connections are specified externally to the processes. These black box processes can be reconnected endlessly to form different applications without having to be changed internally. FBP is thus naturally component-oriented.

Developers used to the [Unix philosophy](http://en.wikipedia.org/wiki/Unix_philosophy) should be immediately familiar with FBP:

> This is the Unix philosophy: Write programs that do one thing and do it well. Write programs to work together. Write programs to handle text streams, because that is a universal interface.

It also fits well in Alan Kay's [original idea of object-oriented programming](http://userpage.fu-berlin.de/~ram/pub/pub_jf47ht81Ht/doc_kay_oop_en):

> I thought of objects being like biological cells and/or individual computers on a network, only able to communicate with messages (so messaging came at the very beginning -- it took a while to see how to do messaging in a programming language efficiently enough to be useful).

CloudBoost Flow has been written in JavaScript for simplicity. The system is forked from [NoFlo](https://github.com/noflo/noflo) and heavily inspired by [J. Paul Morrison's](http://www.jpaulmorrison.com/) book [Flow-Based Programming](http://www.jpaulmorrison.com/fbp/#More). 


## Suitability

CloudBoost Flow is not a web framework or a UI toolkit. It is a way to coordinate and reorganize data flow in any JavaScript application. As such, it can be used for whatever purpose JavaScript can be used for. We know of CloudBoost Flow being used for anything from building [web servers](https://thegrid.io) and build tools, to coordinating events inside [GUI applications](https://flowhub.io), [driving](http://meemoo.org/blog/2015-01-14-turtle-power-to-the-people) [robots](http://bergie.iki.fi/blog/noflo-ardrone/), or building Internet-connected [art installations](http://bergie.iki.fi/blog/ingress-table/).


## Requirements and installing

CloudBoost Flow is available for Node.js [via NPM](https://npmjs.org/package/cloudboost-flow), so you can install it with:

    $ npm install cloudboost-flow --save

### Installing from Git

CloudBoost Flow requires a reasonably recent version of [Node.js](http://nodejs.org/), and some [npm](http://npmjs.org/) packages. Ensure you have the `grunt-cli` package installed (`grunt` command should be available on command line) and CloudBoost Flow checked out from Git. Build CloudBoost Flow with:

    $ grunt build

Then you can install everything needed by a simple:

    $ npm install

CloudBoost Flow is available from [GitHub](https://github.com/cloudboost/flow) under the Apache 2 license.


## Development

CloudBoost Flow development happens on GitHub. Just fork the [main repository](https://github.com/cloudboost/flow), make modifications and send a pull request.

We have an extensive suite of tests available for NoFlo. Run them with:

    $ grunt test

or:

    $ npm test


### Running tests automatically

The build system used for NoFlo is also able to watch for changes in the filesystem and run the tests automatically when something changes. To start the watcher, run:

    $ grunt watch

To quit thew watcher, just end the process with Ctrl-C.

## Discussion

There is an IRC channel `#fbp` on FreeNode, and questions can be posted with the [`cloudboost` tag on Stack Overflow](http://stackoverflow.com/questions/tagged/cloudboost). See <http://cloudboost.io/contact/> for other ways to get in touch.


#LICENSE

Copyright 2016 HackerBay, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.