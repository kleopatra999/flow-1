/*
#     CloudBoost Flow - Flow-Based Programming for JavaScript
#     (c) 2014 HackerBay, Inc. 
#     CloudBoost Flow may be freely distributed under the Apache 2 License
*/


module.exports = function(grunt) {
  // Project configuration
  grunt.initConfig({
   pkg: grunt.file.readJSON('package.json'),


   flow_manifest: {
      update: {
        files: {
          'package.json': [],
          'component.json': ['src/components/*.coffee']
        }
      }
    },

    // Browser build of NoFlo
    flow_browser: {
      options: {
        baseDir: './'
      },
      build: {
        files: {
          'browser/flow.js': ['spec/fixtures/entry.js']
        }
      }
    },

    watch: {
        files: ['spec/*.js', 'spec/**/*.js', 'test/*.js', 'src/**/*.js'],
        tasks: ['test']
      },

      // BDD tests on Node.js
      mochaTest: {
        nodejs: {
          src: ['spec/*.js'],
          options: {
            reporter: 'spec',
            grep: process.env.TESTS
          }
        }
      },

      // Web server for the browser tests
      connect: {
        server: {
          options: {
            port: 8000
          }
        }
      },

      // BDD tests on browser
      mocha_phantomjs: {
        all: {
          options: {
            output: 'spec/result.xml',
            reporter: 'spec',
            urls: ['http://localhost:8000/spec/runner.html'],
            failWithOutput: true
          }
        }
      },
  });

  // Grunt plugins used for testing
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-connect');
  grunt.loadNpmTasks('grunt-mocha-test');
  grunt.loadNpmTasks('grunt-mocha-phantomjs');

   // Our local tasks
  grunt.registerTask('build', 'Build NoFlo for the chosen target platform', (target = 'all') => {
    if (target === 'all' || target === 'browser') {
      return grunt.task.run('flow_browser');
    }
  }
  );

  grunt.registerTask('test', 'Build Flow and run automated tests', (target = 'all') => {
    if (target === 'all' || target === 'nodejs') {
      // The components directory has to exist for Node.js 4.x
      grunt.file.mkdir('components');
      grunt.task.run('mochaTest');
    }
    if (target === 'all' || target === 'browser') {
      grunt.task.run('connect');
      grunt.task.run('flow_browser');
      return grunt.task.run('mocha_phantomjs');
    }
  });

  grunt.registerTask('default', ['test']);
};