'use strict';

// 
// Base class for series classes.
//

var assert = require('chai').assert; 
var E = require('linq');
var moment = require('moment');
var ArrayIterator = require('./iterators/array');
var validateIterator = require('./iterators/validate');
var Index = require('./index');
var SkipIterator = require('./iterators/skip');
var SkipWhileIterator = require('./iterators/skip-while');
var TakeIterator = require('../src/iterators/take');
var TakeWhileIterator = require('../src/iterators/take-while');
var SelectIterator = require('../src/iterators/select');
var MultiIterator = require('../src/iterators/multi');

/**
 * Represents a time series.
 */
var Series = function (config) {

	var self = this;

	if (config) {

		if (!config.values) {
			throw new Error("Expected 'values' field to be set on 'config' parameter to Series constructor.");
		}

		if (Object.isFunction(config.values)) {
			self._iterable = config.values;
		}
		else {
			assert.isArray(config.values, "Expected 'values' field of 'config' parameter to Series constructor be an array or an iterable.");

			self._iterable = function () {
				return new ArrayIterator(config.values);
			};
		}		

		if (config.index) {
			assert.isObject(config.index, "Expected 'index' parameter to Series constructor to be an object.");

			self._index = config.index;
		}
		else {
			// Generate the index.
			self._index = new Index(function () {
					var iterator = self._iterable();
					var length = 0;
					while (iterator.moveNext()) {
						++length;
					}
					return new ArrayIterator(E.range(0, length).toArray());
				});
		}
	}
	else {
		self._iterable = function () {
			return new ArrayIterator([]);
		};
		self._index = new Index([]);
	}

	assert.isFunction(self._iterable);
};

/**
 * Get an iterator for the iterating the values of the series.
 */
Series.prototype.getIterator = function () {
	var self = this;
	return self._iterable();
};

/**
 * Retreive the index of the series.
 */
Series.prototype.getIndex = function () {
	var self = this;
	return self._index;
};

/**
 * Skip a number of rows in the series.
 *
 * @param {int} numRows - Number of rows to skip.
 */
Series.prototype.skip = function (numRows) {
	assert.isNumber(numRows, "Expected 'numRows' parameter to 'skip' function to be a number.");

	var self = this;
	return new Series({
		values: function () {
			return new SkipIterator(self.getIterator(), numRows);
		},		
		index: self.getIndex().skip(numRows),
	}); 	
};

/**
 * Skips values in the series while a condition is met.
 *
 * @param {function} predicate - Return true to indicate the condition met.
 */
Series.prototype.skipWhile = function (predicate) {
	assert.isFunction(predicate, "Expected 'predicate' parameter to 'skipWhile' function to be a predicate function that returns true/false.");

	var self = this;
	return new Series({
		values: function () {
			return new SkipWhileIterator(self.getIterator(), predicate);
		},
		index: new Index(function () {
			var multiIterator = new MultiIterator([self.getIndex().getIterator(), self.getIterator()]);
			return new SelectIterator(
					new SkipWhileIterator(
						multiIterator, 
						function (pair) {
							return predicate(pair[1]);
						}
					),
					function (pair) {
						return pair[0];
					}
				);
		}),
	}); 	
};

/**
 * Skips values in the series until a condition is met.
 *
 * @param {function} predicate - Return true to indicate the condition met.
 */
Series.prototype.skipUntil = function (predicate) {
	assert.isFunction(predicate, "Expected 'predicate' parameter to 'skipUntil' function to be a predicate function that returns true/false.");

	var self = this;
	return self.skipWhile(function (value) { return !predicate(value); });
};

/**
 * Take a number of rows in the series.
 *
 * @param {int} numRows - Number of rows to take.
 */
Series.prototype.take = function (numRows) {
	assert.isNumber(numRows, "Expected 'numRows' parameter to 'take' function to be a number.");

	var self = this;
	return new Series({
		values: function () {
			return new TakeIterator(self.getIterator(), numRows);
		},
		index: self.getIndex().take(numRows),
	});
};

/**
 * Take values from the series while a condition is met.
 *
 * @param {function} predicate - Return true to indicate the condition met.
 */
Series.prototype.takeWhile = function (predicate) {
	assert.isFunction(predicate, "Expected 'predicate' parameter to 'takeWhile' function to be a predicate function that returns true/false.");

	var self = this;
	return new Series({
		values: function () {
			return new TakeWhileIterator(self.getIterator(), predicate);
		},
		index: new Index(function () {
			var multiIterator = new MultiIterator([self.getIndex().getIterator(), self.getIterator()]);
			return new SelectIterator(
					new TakeWhileIterator(
						multiIterator, 
						function (pair) {
							return predicate(pair[1]);
						}
					),
					function (pair) {
						return pair[0];
					}
				);
		}),
	}); 	
};

/**
 * Take values from the series until a condition is met.
 *
 * @param {function} predicate - Return true to indicate the condition met.
 */
Series.prototype.takeUntil = function (predicate) {
	assert.isFunction(predicate, "Expected 'predicate' parameter to 'takeUntil' function to be a predicate function that returns true/false.");

	var self = this;
	return self.takeWhile(function (value) { return !predicate(value); });
};

/**
 * Filter a series by a predicate selector.
 *
 * @param {function} filterSelectorPredicate - Predicte function to filter rows of the series.
 */
Series.prototype.where = function (filterSelectorPredicate) {
	assert.isFunction(filterSelectorPredicate, "Expected 'filterSelectorPredicate' parameter to 'where' function to be a function.");

	var self = this;

	var cachedFilteredIndexAndValues = null;

	//
	// Lazy  execute the filtering.
	//
	var executeLazyWhere = function () { //todo: make this properly lazy.

		if (cachedFilteredIndexAndValues) {
			return cachedFilteredIndexAndValues;
		}

		cachedFilteredIndexAndValues = E
			.from(self.getIndex().toValues())
			.zip(self.toValues(), function (index, value) {
				return [index, value];
			})
			.where(function (data) {
				var value = data[1];
				return filterSelectorPredicate(value);
			})
			.toArray();
		return cachedFilteredIndexAndValues;
	};

	return new Series({
		values: function () {
			return new ArrayIterator(E.from(executeLazyWhere())
				.select(function (data) {
					return data[1]; // Value
				})
				.toArray()
			);
		},
		index: new Index(function () {
			return new ArrayIterator(E.from(executeLazyWhere())
				.select(function (data) {
					return data[0]; // Index
				})
				.toArray()
			);
		}),
	}); 	
};

/**
 * Generate a new series based on the results of the selector function.
 *
 * @param {function} selector - Selector function that transforms each value to a different data structure.
 */
Series.prototype.select = function (selector) {
	assert.isFunction(selector, "Expected 'selector' parameter to 'select' function to be a function.");

	var self = this;
	return new Series({
		values: function () {
			return new SelectIterator(self.getIterator(), selector);
		},		
		index: self.getIndex(),
	}); 	
};

/**
 * Generate a new series based on the results of the selector function.
 *
 * @param {function} selector - Selector function that transforms each value to a different data structure.
 */
Series.prototype.selectMany = function (selector) {
	assert.isFunction(selector, "Expected 'selector' parameter to 'selectMany' function to be a function.");

	var self = this;

	var newIndexAndNewValues = null;
	var newValues = null;

	var lazyEvaluate = function () {

		if (newIndexAndNewValues) {
			return;
		}

		newIndexAndNewValues = E.from(self.getIndex().toValues())
			.zip(self.toValues(), function (index, value) {
				return [index, selector(value)];
			})
			.toArray();

		newValues = E.from(newIndexAndNewValues)
			.selectMany(function (data) {
				return data[1]; // Extract expanded values.
			})
			.toArray();
	};

	return new Series({
		values: function () {
			lazyEvaluate();
			return new ArrayIterator(newValues);
		},
		index: new Index(function () {
			lazyEvaluate();
			var indexValues = E.from(newIndexAndNewValues)
				.selectMany(function (data) {
					var index = data[0];
					var values = data[1];
					return E.range(0, values.length)
						.select(function (_) {
							return index;
						})
						.toArray();
				})
				.toArray();
			return new ArrayIterator(indexValues);
		}),
	}); 	
};

//
// Throw an exception if the sort method doesn't make sense.
//
var validateSortMethod = function (sortMethod) {
	assert.isString(sortMethod);
	assert(
		sortMethod === 'orderBy' || 
	   sortMethod === 'orderByDescending' ||
	   sortMethod === 'thenBy' ||
	   sortMethod === 'thenByDescending', 
	   "Expected 'sortMethod' to be one of 'orderBy', 'orderByDescending', 'thenBy' or 'thenByDescending', instead it is '" + sortMethod + "'."
   );
};

//
// Execute a batched sorting command.
//
var executeOrderBy = function (self, batch) {

	assert.isObject(self);
	assert.isArray(batch);
	assert(batch.length > 0);

	var cachedSorted = null;

	//
	// Don't invoke the sort until we really know what we need.
	//
	var executeLazySort = function () {
		if (cachedSorted) {
			return cachedSorted;
		}

		batch.forEach(function (orderCmd) {
			assert.isObject(orderCmd);
			assert.isFunction(orderCmd.sortSelector);
			validateSortMethod(orderCmd.sortMethod);
		});

		var valuesWithIndex = E.from(self.getIndex().toValues())
			.zip(self.toValues(), function (index, value) {
				return [index, value];
			})
			.toArray();	

		cachedSorted = E.from(batch)
			.aggregate(E.from(valuesWithIndex), function (unsorted, orderCmd) {
				return unsorted[orderCmd.sortMethod](function (row) {
					var value = row[1];
					return orderCmd.sortSelector(value);
				}); 
			})
			.toArray();

		return cachedSorted;
	};

	return new Series({
		values: function () {
			return new ArrayIterator(
				E.from(executeLazySort())
					.select(function (row) {
						return row[1]; // Extract the value (minus the index) from the sorted data.					
					})
					.toArray()
				);
		},
		index: new Index(function () {
			return new ArrayIterator(E.from(executeLazySort())
				.select(function (row) {
					return row[0]; // Extract the index from the sorted data.
				})
				.toArray()
			);
		}),
	});
};

//
// Order by values in a partcular series, either ascending or descending
//
var orderBy = function (self, sortMethod, sortSelector) {
	assert.isObject(self);
	validateSortMethod(sortMethod);
	assert.isFunction(sortSelector);

	var batchOrder = [
		{ 
			sortSelector: sortSelector, 
			sortMethod: sortMethod 
		}
	];

	var sortedDataFrame = executeOrderBy(self, batchOrder);
	sortedDataFrame.thenBy = orderThenBy(self, batchOrder, 'thenBy');
	sortedDataFrame.thenByDescending = orderThenBy(self, batchOrder, 'thenByDescending');	
	return sortedDataFrame;
};

//
// Generates a thenBy function that is attached to already ordered data frames.
//
var orderThenBy = function (self, batch, nextSortMethod) {
	assert.isObject(self);
	assert.isArray(batch);
	assert(batch.length > 0);
	validateSortMethod(nextSortMethod);
	
	return function (sortSelector) {
		assert.isFunction(sortSelector, "Expected parameter 'sortSelector' to be a function");

		var extendedBatch = batch.concat([
			{
				sortSelector: sortSelector,
				sortMethod: nextSortMethod,
			},
		]);

		var sortedDataFrame = executeOrderBy(self, extendedBatch);
		sortedDataFrame.thenBy = orderThenBy(self, extendedBatch, 'thenBy');
		sortedDataFrame.thenByDescending = orderThenBy(self, extendedBatch, 'thenByDescending');		
		return sortedDataFrame;
	};	
};

/**
 * Sorts the series by value (ascending). 
 */
Series.prototype.order = function () {

	var self = this;
	return orderBy(self, 'orderBy', function (value) { 
		return value; 
	});
};

/**
 * Sorts the series by value (descending). 
 */
Series.prototype.orderDescending = function (optionalSortSelector) {

	var self = this;
	return orderBy(self, 'orderByDescending', function (value) {
		return value;
	});
};

/**
 * Sorts the series by sort selector (ascending). 
 * 
 * @param {function} sortSelector - An function to select a value to sort by.
 */
Series.prototype.orderBy = function (sortSelector) {

	assert.isFunction

	var self = this;
	return orderBy(self, 'orderBy', sortSelector);
};

/**
 * Sorts the series by sort selector (descending). 
 * 
 * @param {function} sortSelector - An function to select a value to sort by.
 */
Series.prototype.orderByDescending = function (sortSelector) {

	var self = this;
	return orderBy(self, 'orderByDescending', sortSelector);
};

/**
 * Create a new series from a slice of rows.
 *
 * @param {int|function} startIndexOrStartPredicate - Index where the slice starts or a predicate function that determines where the slice starts.
 * @param {int|function} endIndexOrEndPredicate - Marks the end of the slice, one row past the last row to include. Or a predicate function that determines when the slice has ended.
 * @param {function} [predicate] - Optional predicate to compare index against start/end index. Return true to start or stop the slice.
 */
Series.prototype.slice = function (startIndexOrStartPredicate, endIndexOrEndPredicate, predicate) {

	var self = this;

	var startIndex;
	var endIndex;
	var startPredicate = null;
	var endPredicate = null;

	if (predicate) {
		assert.isFunction(predicate, "Expected 'predicate' parameter to slice function to be function.");
	}

	if (Object.isFunction(startIndexOrStartPredicate)) {
		startPredicate = startIndexOrStartPredicate;
	}
	else {
		startIndex = startIndexOrStartPredicate;
		startPredicate = function (value) {
				return predicate && predicate(value, startIndex) || value < startIndex;
			};
	}

	if (Object.isFunction(endIndexOrEndPredicate)) {
		endPredicate = endIndexOrEndPredicate;
	}
	else {
		endIndex = endIndexOrEndPredicate;
		endPredicate = function (value) {
				return predicate && predicate(value, endIndex) || value < endIndex;
			};
	}

	return new Series({
		values: function () {
			return new SelectIterator(
				new TakeWhileIterator(
					new SkipWhileIterator(
						new MultiIterator([self.getIndex().getIterator(), self.getIterator()]),
						function (pair) {
							return startPredicate(pair[0]); // Check index for start condition.
						}
					),
					function (pair) {
						return endPredicate(pair[0]); // Check index for end condition.
					}
				),
				function (pair) {
					return pair[1]; // Value.
				}
			);
		},		
		index: self.getIndex().slice(startIndexOrStartPredicate, endIndexOrEndPredicate, predicate),
	});
};

/** 
 * Move a rolling window over the series, invoke a selector function to build a new series.
 *
 * @param {integer} period - The number of entries to include in the window.
 * @param {function} selector - The selector function that builds the output series.
 *
 * The selector has the following parameters: 
 *
 *		window - Series that represents the rolling window.
 *		windowIndex - The 0-based index of the window.
 */
Series.prototype.rollingWindow = function (period, fn) {

	assert.isNumber(period, "Expected 'period' parameter to 'rollingWindow' to be a number.");
	assert.isFunction(fn, "Expected 'fn' parameter to 'rollingWindow' to be a function.");

	var self = this;

	//todo: make this properly lazy

	var index = self.getIndex().toValues();
	var values = self.toValues();

	if (values.length == 0) {
		return new Series();
	}

	var newIndexAndValues = E.range(0, values.length-period+1)
		.select(function (rowIndex) {
			var _window = new Series({
					values: function () {
						return new TakeIterator(new SkipIterator(self.getIterator(), rowIndex), period);
					},
					index: new Index(function () {
						return new TakeIterator(new SkipIterator(self.getIndex().getIterator(), rowIndex), period);
					}),
				});			
			return fn(_window, rowIndex);
		})
		.toArray();

	return new Series({
		values: function () {
			return new ArrayIterator(E.from(newIndexAndValues)
				.select(function (indexAndValue) {
					return indexAndValue[1];
				})
				.toArray()
			);
		},
		index: new Index(function () {
			return new ArrayIterator(E.from(newIndexAndValues)
				.select(function (indexAndValue) {
					return indexAndValue[0];
				})
				.toArray()
			);
		}),
	});
};

/**
 * Create a new series, reindexed from this series.
 *
 * @param {index} newIndex - The index used to generate the new series.
 */
Series.prototype.reindex = function (newIndex) {
	assert.isObject(newIndex, "Expected 'newIndex' parameter to 'reindex' function to be an index.");

	var self = this;

	return new Series({
		values: function () {
			//
			// Generate a map to relate an index value to a series value.
			//
			var indexMap = {};
			var indexExists = {};

			E.from(self.getIndex().toValues())
				.zip(self.toValues(), 
					function (indexValue, seriesValue) {
						return [indexValue, seriesValue];
					}
				)
				.toArray()
				.forEach(function (pair) {
					var index = pair[0];
					var value = pair[1];

					if (indexExists[index]) {
						throw new Error("Duplicate index detected, failed to 'reindex'");
					}

					indexMap[index] = value;
					indexExists[index] = true;
				});

			//
			// Return the series values in the order specified by the new index.
			//
			return new ArrayIterator(E.from(newIndex.toValues())
				.select(function (newIndexValue) {
					return indexMap[newIndexValue];
				})
				.toArray()
			);
		},		
		index: newIndex,
	});
};

/** 
 * Format the data frame for display as a string.
 */
Series.prototype.toString = function () {

	var self = this;
	var Table = require('easy-table');

	var index = self.getIndex().toValues();
	var header = ["__index__", "__value__"];
	var rows = E.from(self.toValues())
			.select(function (value, rowIndex) { 
				return [index[rowIndex], value];
			})
			.toArray()

	var t = new Table();
	rows.forEach(function (row, rowIndex) {
		row.forEach(function (cell, cellIndex) {
			t.cell(header[cellIndex], cell);
		});
		t.newRow();
	});

	return t.toString();
};

/**
 * Compute the percent change for each row after the first.
 * Percentages are expressed as 0-1 values.
 */
Series.prototype.percentChange = function () {

	var self = this;
	return self.rollingWindow(2, function (window) {
		var index = window.getIndex().skip(1).first();
		var values = window.toValues();
		var amountChange = values[1] - values[0]; // Compute amount of change.
		var pctChange = amountChange / values[0]; // Compute % change.
		return [index, pctChange]; // Return new index and value.
	});
};

/**
 * Parse a series with string values to a series with int values.
 */
Series.prototype.parseInts = function () {

	var self = this;
	return self.select(function (value, valueIndex) {
		if (value === undefined) {
			return undefined;
		}
		else {
			assert.isString(value, "Called parseInt on series, expected all values in the series to be strings, instead found a '" + typeof(value) + "' at index " + valueIndex);

			if (value.length === 0) {
				return undefined;
			}

			return parseInt(value);
		}
	});
};

/**
 * Parse a series with string values to a series with float values.
 */
Series.prototype.parseFloats = function () {

	var self = this;
	return self.select(function (value, valueIndex) {
		if (value === undefined) {
			return undefined;
		}
		else {
			assert.isString(value, "Called parseInt on series, expected all values in the series to be strings, instead found a '" + typeof(value) + "' at index " + valueIndex);

			if (value.length === 0) {
				return undefined;
			}

			return parseFloat(value);
		}
	});
};

/**
 * Parse a series with string values to a series with date values.
 */
Series.prototype.parseDates = function () {

	var self = this;
	return self.select(function (value, valueIndex) {
		if (value === undefined) {
			return undefined;
		}
		else {
			assert.isString(value, "Called parseInt on series, expected all values in the series to be strings, instead found a '" + typeof(value) + "' at index " + valueIndex);

			if (value.length === 0) {
				return undefined;
			}

			return moment(value).toDate();
		}
	});
};

/**
 * Convert a series of values of different types to a series of string values.
 */
Series.prototype.toStrings = function () {

	var self = this;
	return self.select(function (value) {
		if (value === undefined) {
			return undefined;
		}
		else if (value === null) {
			return null;
		}
		else {
			return value.toString();	
		}		
	});
};

/** 
  * Detect the actual types of the values that comprised the series and their frequency.
  * Returns a new series containing the type information.
  */
Series.prototype.detectTypes = function () {

	var self = this;

	var DataFrame = require('./dataframe');
	return new DataFrame({
		columnNames: ["Type", "Frequency"],
		rows: function () { //todo: make this properly lazy.
			var values = self.toValues();
			var totalValues = values.length;

			var typeFrequencies = E.from(values)
				.select(function (value) {
					var valueType = typeof(value);
					if (valueType === 'object') {
						if (Object.isDate(value)) {
							valueType = 'date';
						}
					}
					return valueType;
				})
				.aggregate({}, function (accumulated, valueType) {
					var typeInfo = accumulated[valueType];
					if (!typeInfo) {
						typeInfo = {
							count: 0
						};
						accumulated[valueType] = typeInfo;
					}
					++typeInfo.count;
					return accumulated;
				});

			return new ArrayIterator(
				E.from(Object.keys(typeFrequencies))
					.select(function (valueType) {
						return [
							valueType,
							(typeFrequencies[valueType].count / totalValues) * 100
						];
					})
					.toArray()
			);
		},		
	});
};

/** 
  * Detect the frequency of values in the series.
  * Returns a new series containing the information.
  */
Series.prototype.detectValues = function () {

	var self = this;

	var DataFrame = require('./dataframe');
	return new DataFrame({
		columnNames: ["Value", "Frequency"],
		rows: function () {
			var values = self.toValues();
			var totalValues = values.length;

			var valueFrequencies = E.from(values)
				.aggregate({}, function (accumulated, value) {
					var valueKey = value.toString() + "-" + typeof(value);
					var valueInfo = accumulated[valueKey];
					if (!valueInfo) {
						valueInfo = {
							count: 0,
							value: value,
						};
						accumulated[valueKey] = valueInfo;
					}
					++valueInfo.count;
					return accumulated;
				});

			return new ArrayIterator(
				E.from(Object.keys(valueFrequencies))
					.select(function (valueKey) {
						var valueInfo = valueFrequencies[valueKey];
						return [
							valueInfo.value,
							(valueInfo.count / totalValues) * 100
						];
					})
					.toArray()
			);
		},
	});
};

/**
 * Produces a new series with all string values truncated to the requested maximum length.
 *
 * @param {int} maxLength - The maximum length of the string values after truncation.
 */
Series.prototype.truncateStrings = function (maxLength) {
	assert.isNumber(maxLength, "Expected 'maxLength' parameter to 'truncateStrings' to be an integer.");

	var self = this;
	return self
		.select(function (value) {
			if (Object.isString(value)) {
				if (value.length > maxLength) {
					return value.substring(0, maxLength);
				}
			}

			return value;
		});
};

/*
 * Extract values from the series. This forces lazy evaluation to complete.
 */
Series.prototype.toValues = function () {

	var self = this;
	var iterator = self.getIterator();
	validateIterator(iterator);

	var values = [];

	while (iterator.moveNext()) {
		values.push(iterator.getCurrent());
	}

	return values;
};

/**
 * Forces lazy evaluation to complete and 'bakes' the series into memory.
 */
Series.prototype.bake = function () {

	var self = this;

	return new Series({ 
		values: self.toValues(), 
		index: self.getIndex().bake(),
	});
};

/**
 * Retreive the data as pairs of [index, value].
 */
Series.prototype.toPairs = function () {

	var self = this;
	return E.from(self.getIndex().toValues())
		.zip(self.toValues(), function (index, value) {
			return [index, value];
		})
		.toArray();
};

/**
 * Count the number of rows in the series.
 */
Series.prototype.count = function () {

	var self = this;
	var total = 0;
	var iterator = self.getIterator();

	while (iterator.moveNext()) {
		++total;
	}

	return total;
};

/**
 * Get the first row of the series.
 */
Series.prototype.first = function () {

	var self = this;
	var iterator = self.getIterator();

	if (!iterator.moveNext()) {
		throw new Error("No rows in series.");
	}

	return iterator.getCurrent();	
};

/**
 * Get the last row of the series.
 */
Series.prototype.last = function () {

	var self = this;
	var iterator = self.getIterator();

	if (!iterator.moveNext()) {
		throw new Error("No rows in series.");
	}

	var last = iterator.getCurrent();

	while (iterator.moveNext()) {
		last = iterator.getCurrent();
	}

	return last;
};

/** 
 * Reverse the series.
 */
Series.prototype.reverse = function () {

	var self = this;

	return new Series({
			values: E.from(self.toValues()).reverse().toArray(),
			index: self.getIndex().reverse(),
		});
};

/** 
 * Inflate a series to a data-frame.
 *
 * @param {function} selector - Selector function that transforms each value in the series to a row in the new data-frame.
 */
Series.prototype.inflate = function (selector) {

	assert.isFunction(selector, "Expected 'selector' parameter to 'inflate' function to be a function.");

	var self = this;

	//todo: make this lazy.
	//todo: need a better implementation.

	var DataFrame = require('./dataframe');
	return new DataFrame({
			columnNames: ["__gen__"],
			rows: E.from(self.toValues())
				.select(function (value) {
					return [value];
				})
				.toArray(),
			index: self.getIndex(),
		})
		.select(function (row) {
			return selector(row.__gen__);
		});
};

/** 
 * Get X values from the head of the series.
 *
 * @param {int} values - Number of values to take.
 */
Series.prototype.head = function (values) {

	assert.isNumber(values, "Expected 'values' parameter to 'head' function to be a function.");

	var self = this;
	return self.take(values);
};

/** 
 * Get X values from the tail of the series.
 *
 * @param {int} values - Number of values to take.
 */
Series.prototype.tail = function (values) {

	assert.isNumber(values, "Expected 'values' parameter to 'tail' function to be a function.");

	var self = this;
	return self.skip(self.count() - values);
};

/**
 * Sum the values in a series.
 */
Series.prototype.sum = function () {

	var self = this;
	var self = this;
	return self.aggregate(
		function (prev, value) {
			return prev + value;
		}
	);
};

/**
 * Average the values in a series.
 */
Series.prototype.average = function () {

	var self = this;
	return self.sum() / self.count();
};

/**
 * Get the min value in the series.
 */
Series.prototype.min = function () {

	var self = this;
	return self.aggregate(
		function (prev, value) {
			return Math.min(prev, value);
		}
	);
};

/**
 * Get the max value in the series.
 */
Series.prototype.max = function () {

	var self = this;
	return self.aggregate(
		function (prev, value) {
			return Math.max(prev, value);
		}
	);
};

/**
 * Aggregate the values in the series.
 *
 * @param {object} [seed] - The seed value for producing the aggregation.
 * @param {function} selector - Function that takes the seed and then each value in the series and produces the aggregate value.
 */
Series.prototype.aggregate = function (seedOrSelector, selector) {

	var self = this;

	if (Object.isFunction(seedOrSelector) && !selector) {

		return E.from(self.skip(1).toValues()).aggregate(self.first(), seedOrSelector);
	}
	else {
		assert.isFunction(selector, "Expected 'selector' parameter to aggregate to be a function.");

		return E.from(self.toValues()).aggregate(seedOrSelector, selector);
	}
};

/**
 * Convert the series to a JavaScript object.
 *
 * @param {function} keySelector - Function that selects keys for the resulting object.
 * @param {valueSelector} keySelector - Function that selects values for the resulting object.
 */
Series.prototype.toObject = function (keySelector, valueSelector) {

	var self = this;

	assert.isFunction(keySelector, "Expected 'keySelector' parameter to toObject to be a function.");
	assert.isFunction(valueSelector, "Expected 'valueSelector' parameter to toObject to be a function.");

	return E.from(self.toValues()).toObject(keySelector, valueSelector);
};

module.exports = Series;