'use strict';

var assert = require('chai').assert;

//
// Data-forge enumerator for iterating a standard JavaScript array.
//
var ArrayIterator = function (arr, index) {
	assert.isArray(arr);

	if (index) {
		assert.isArray(index);

		assert(arr.length == index.length, "Expect value array and index array to be the same length.");
	}

	var self = this;

	var rowIndex = -1;
	
	self.moveNext = function () {
		return ++rowIndex < arr.length;
	};

	self.getCurrent = function () {
		if (rowIndex >= 0 && rowIndex < arr.length) {
			return arr[rowIndex];
		}
		else {
			return undefined;
		}		
	};

	self.getCurrentIndex = function () {
		if (rowIndex >= 0 && rowIndex < arr.length) {
			if (index) {
				return index[rowIndex];
			}
			else {
				return rowIndex;
			}
		}
		else {
			return undefined;
		}
	}

	//
	// Bake the iterator into an array.
	//
	self.realize = function () {

		var output = [];

		while (self.moveNext()) {
			output.push(self.getCurrent());
		}

		return output;
	};
};

module.exports = ArrayIterator;