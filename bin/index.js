#!/usr/bin/env node

require('newrelic');
require('babel-polyfill');
require('babel-register');
require('q').longStackSupport = true;

require('./up-to-code');
