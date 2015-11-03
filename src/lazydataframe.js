'use strict';

//
// Implements a lazily evaluated data frame.
//

var LazyColumn = require('./lazycolumn');
var BaseDataFrame = require('./basedataframe');

var assert = require('chai').assert;
var E = require('linq');
var inherit = require('./inherit');

var LazyDataFrame = function (columnNamesFn, valuesFn) {
	assert.isFunction(columnNamesFn, "Expected 'columnNamesFn' parameter to LazyDataFrame constructor to be a function.");
	assert.isFunction(valuesFn, "Expected 'values' parameter to LazyDataFrame constructor to be a function.");
	
	var self = this;
	self._columnNamesFn = columnNamesFn;
	self._valuesFn = valuesFn;	
};

var parent = inherit(LazyDataFrame, BaseDataFrame);

LazyDataFrame.prototype.columns = function () {
	var self = this;
	return self._columnNamesFn();
};

LazyDataFrame.prototype.values = function () {
	var self = this;
	return self._valuesFn();
};

//
// Bake the lazy data frame to a normal data frame. 
//
LazyDataFrame.prototype.bake = function () {
	var DataFrame = require('./dataframe'); // Local require, to prevent circular reference.
	
	var self = this;
	return new DataFrame(self.columns(), self.values());
};

module.exports = LazyDataFrame;