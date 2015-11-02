'use strict';

//
// A time series index based on number.
//

var assert = require('chai').assert;
var E = require('linq');
var BaseIndex = require('./baseindex');
var inherit = require('./inherit');

var NumberIndex = function (values) {
	assert.isArray(values, "Expected 'values' parameter to NumberIndex constructor to be an array.");
	
	var self = this;
	self._values = values;	
};

var parent = inherit(NumberIndex, BaseIndex);

NumberIndex.prototype.values = function () {
	var self = this;
	return self._values;	
};

module.exports = NumberIndex;