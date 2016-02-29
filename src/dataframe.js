'use strict';

// 
// Base class for data frame classes.
//

var Series = require('./series');
var Index = require('./index');
var ArrayIterator = require('./iterators/array');
var MultiIterator = require('./iterators/multi');
var SkipIterator = require('./iterators/skip');
var SkipWhileIterator = require('./iterators/skip-while');
var BabyParse = require('babyparse');
var SelectIterator = require('../src/iterators/select');
var SelectManyIterator = require('../src/iterators/select-many');
var TakeIterator = require('../src/iterators/take');
var TakeWhileIterator = require('../src/iterators/take-while');
var WhereIterator = require('../src/iterators/where');
var ApplyIndexIterator = require('../src/iterators/apply-index');
var utils = require('./utils');
var extend = require('extend');

var assert = require('chai').assert; 
var E = require('linq');

var validateIterator = require('./iterators/validate');

//
// Help function to grab a column index from a 'column name or index' parameter.
//
var parseColumnNameOrIndex = function (dataFrame, columnNameOrIndex, failForNonExistantColumn) {

	if (Object.isString(columnNameOrIndex)) {
		var columnIndex = dataFrame.getColumnIndex(columnNameOrIndex);
		if (failForNonExistantColumn && columnIndex < 0) {
			throw new Error("Failed to find column with name '" + columnNameOrIndex + "'.");
		}
		return columnIndex;
	}
	else {	
		assert.isNumber(columnNameOrIndex, "Expected 'columnNameOrIndex' parameter e either a string or index that specifies an existing column.");

		return columnNameOrIndex;
	}
};

/**
 * Constructor for DataFrame.
 *
 * @param {object} config - Specifies content and configuration for the data frame.
 */
var DataFrame = function (config) {

	var self = this;
	var columnNames;
	var rows;
	var index;

	if (config) {
		assert.isObject(config, "Expected 'config' parameter to DataFrame constructor to be an object with options for initialisation.");

		if (config.index) {
			assert.isObject(config.index, "Expected 'index' member of 'config' parameter to DataFrame constructor to be an object.");

			index = config.index;
		}

		if (config.columnNames) {
			if (!Object.isFunction(config.columnNames)) {
				assert.isArray(config.columnNames, "Expected 'columnNames' member of 'config' parameter to DataFrame constructor to be an array of strings or a function that produces an array of strings.");

				config.columnNames.forEach(function (columnName) {
					assert.isString(columnName, "Expected 'columnNames' member of 'config' parameter to DataFrame constructor to be an array of strings or a function that produces an array of strings.");
				});
			}

			if (!config.rows) {
				throw new Error("Expected to find a 'rows' member of 'config' parameter to DataFrame constructor.");
			}

			columnNames = config.columnNames;

		 	if (Object.isFunction(config.rows)) {
				rows = config.rows;
			}
			else {
				assert.isArray(config.rows, "Expected 'rows' member of 'config' parameter to DataFrame constructor to be an array of rows.");

				if (config.debug) {
					config.rows.forEach(function (row) {
						assert.isArray(row, "Expected 'rows' member of 'config' parameter to DataFrame constructor to be an array of arrays, an array of objects or an iterator.");
					});
				}

		 		rows = function () {
					return new ArrayIterator(config.rows);
		 		};		 		
			}
		}
		else if (config.rows) {
			if (Object.isFunction(config.rows)) {

				var determineColumnNames = function () {
					var iterator = config.rows();
					if (!iterator.moveNext()) {
						return [];
					}

					return Object.keys(iterator.getCurrent());
				};				

				columnNames = determineColumnNames;

				rows = function () {
					var columnNames = determineColumnNames();

					return new SelectIterator(
						config.rows(),
						function (row) {
							return E.from(columnNames)
								.select(function (columnNames) {
									return row[columnNames];
								})
								.toArray();
						}
					);
				};
			}
			else {
				assert.isArray(config.rows, "Expected 'rows' member of 'config' parameter to DataFrame constructor to be an array of rows.");
				
				if (config.rows.length > 0) {
					if (Object.isObject(config.rows[0])) {

						if (config.debug) {
							config.rows.forEach(function (row) {
								assert.isObject(row, "Expect 'rows' member of 'config' parameter to DataFrame constructor to be array of objects or arrays, do not mix and match arrays and objects in 'rows'.");
							});							
						}

						// Derive column names from object fields.
						columnNames = function () {
							return E.from(config.rows)
								.selectMany(function (row) {
									return Object.keys(row);
								})
								.distinct()
								.toArray();
						};

						rows = function () {
							var columnNames = self.getColumnNames();
							return new SelectIterator(
								new ArrayIterator(config.rows),
								function (row) {
									return E.from(columnNames)
										.select(function (columnName) {
											return row[columnName];
										})
										.toArray();
								}
							);
						};
					}
					else {
						if (config.debug) {
							config.rows.forEach(function (row) {
								assert.isArray(row, "Expect 'rows' member of 'config' parameter to DataFrame constructor to be array of objects or arrays, do not mix and match arrays and objects in 'rows'.");
							});				
						}

						// Default column names.
						columnNames = E.range(0, config.rows[0].length)
							.select(function (columnIndex) {
								return columnIndex.toString();
							})
							.toArray();

						rows = function () {
							return new ArrayIterator(config.rows);
						};
					}
				}
			}
		}
	}

	if (!columnNames) {
		columnNames = [];
	}

	if (!rows) {
		rows = function () {
			return new ArrayIterator([]);
		};
	}

	assert.isFunction(rows);

	if (index) { //todo: phase this out.
		var oldRows = rows;
		rows = function () {
			return new ApplyIndexIterator(oldRows(), index.getIterator());
		};
	}

	self._columnNames = columnNames || [];
	self._iterable = rows;
};

/**
 * Get the index of the data frame.
 */
DataFrame.prototype.getIndex = function () {
	var self = this;
	return new Index(function () {		
		var iterator = self.getIterator();
		var i = -1;

		return {
			moveNext: function () {
				++i;
				return iterator.moveNext();
			},

			getCurrent: function () {
				return iterator.getCurrentIndex();
			},

			getCurrentIndex: function () {
				return i;
			},
		};
	});
};

/**
 * Get the names of the columns in the data frame.
 */
DataFrame.prototype.getColumnNames = function () {
	var self = this;
	if (self._newIterable) {
		return self._newIterable.getColumnNames();
	}
	if (Object.isFunction(self._columnNames)) { //fio:
		self._columnNames = self._columnNames(); // Lazy evaluate column names.
	}
	return self._columnNames;
};

/**
 * Get an iterator for the data-frame.
 */
DataFrame.prototype.getIterator = function () {
	var self = this;
	return self._iterable();
};

//
// Map a row of data to a JS object with column names as fields.
//
var mapRowByColumns = function (self, row) {

	return E.from(self.getColumnNames())
		.zip(row, function (columnName, columnValue) {
			return [columnName, columnValue];
		})
		.toObject(
			function (column) {
				return column[0];
			},
			function (column) {
				return column[1];
			}
		);
};

DataFrame.prototype._mapRowByColumns = function (row) { //fio:
	assert.isArray(row);

	var self = this;
	return mapRowByColumns(self, row);
};

/**
 * Gets a column index from a column name.
 *
 * @param {string} columnName - The name of the column to retrieve the column index for.
 *
 * @returns {Number} Returns the index of the named column or -1 if the requested column was not found.
 */
DataFrame.prototype.getColumnIndex = function (columnName) {
	assert.isString(columnName, "Expected 'columnName' parameter to getColumnIndex to be a non-empty string.");
	
	var self = this;	
	var columnNames = self.getColumnNames();
	
	for (var i = 0; i < columnNames.length; ++i) {
		if (columnName === columnNames[i]) {
			return i;
		}
	}	
	
	return -1;
};

/**
 * Skip a number of rows in the data frame.
 *
 * @param {int} numRows - Number of rows to skip.
 */
DataFrame.prototype.skip = function (numRows) {
	assert.isNumber(numRows, "Expected 'numRows' parameter to 'skip' function to be a number.");

	var self = this;
	return new DataFrame({
		columnNames: self.getColumnNames(),
		rows: function () {
			return new SkipIterator(self.getIterator(), numRows);
		},
		index: self.getIndex().skip(numRows),
	}); 	
};

/**
 * Skips rows in the data-frame while a condition is met.
 *
 * @param {function} predicate - Return true to indicate the condition met.
 */
DataFrame.prototype.skipWhile = function (predicate) {
	assert.isFunction(predicate, "Expected 'predicate' parameter to 'skipWhile' function to be a predicate function that returns true/false.");

	var self = this;
	return new DataFrame({
		columnNames: self.getColumnNames(),
		rows: function () {
			return new SkipWhileIterator(self.getIterator(), function (row) {
					return predicate(mapRowByColumns(self, row));
				});
		},
		index: new Index(function () {
			var multiIterator = new MultiIterator([self.getIndex().getIterator(), self.getIterator()]);
			return new SelectIterator(
					new SkipWhileIterator(
						multiIterator, 
						function (pair) {
							return predicate(mapRowByColumns(self, pair[1]));
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
 * Skips rows in the data-frame until a condition is met.
 *
 * @param {function} predicate - Return true to indicate the condition met.
 */
DataFrame.prototype.skipUntil = function (predicate) {
	assert.isFunction(predicate, "Expected 'predicate' parameter to 'skipUntil' function to be a predicate function that returns true/false.");

	var self = this;
	return self.skipWhile(function (value) { return !predicate(value); });
};

/**
 * Take a number of rows in the data frame.
 *
 * @param {int} numRows - Number of rows to take.
 */
DataFrame.prototype.take = function (numRows) {
	assert.isNumber(numRows, "Expected 'numRows' parameter to 'take' function to be a number.");

	var self = this;
	return new DataFrame({
		columnNames: self.getColumnNames(), //todo: this will bake column names! maybe this should always be a function.
		rows: function () {
			return new TakeIterator(self.getIterator(), numRows);
		},
		index: self.getIndex().take(numRows),
	}); 	
};

/**
 * Take rows from the data-frame while a condition is met.
 *
 * @param {function} predicate - Return true to indicate the condition met.
 */
DataFrame.prototype.takeWhile = function (predicate) {
	assert.isFunction(predicate, "Expected 'predicate' parameter to 'takeWhile' function to be a predicate function that returns true/false.");

	var self = this;
	return new DataFrame({
		columnNames: self.getColumnNames(),
		rows: function () {
			return new TakeWhileIterator(self.getIterator(), function (row) {
					return predicate(mapRowByColumns(self, row));
				});
		},
		index: new Index(function () {
			var multiIterator = new MultiIterator([self.getIndex().getIterator(), self.getIterator()]);
			return new SelectIterator(
					new TakeWhileIterator(
						multiIterator, 
						function (pair) {
							return predicate(mapRowByColumns(self, pair[1]));
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
 * Take rows from the data-frame until a condition is met.
 *
 * @param {function} predicate - Return true to indicate the condition met.
 */
DataFrame.prototype.takeUntil = function (predicate) {
	assert.isFunction(predicate, "Expected 'predicate' parameter to 'takeUntil' function to be a predicate function that returns true/false.");

	var self = this;
	return self.takeWhile(function (value) { return !predicate(value); });
};

/**
 * Filter a data frame by a predicate selector.
 *
 * @param {function} filterSelectorPredicate - Predicte function to filter rows of the data frame.
 */
DataFrame.prototype.where = function (filterSelectorPredicate) {
	assert.isFunction(filterSelectorPredicate, "Expected 'filterSelectorPredicate' parameter to 'where' function to be a function.");

	var self = this;
	return new DataFrame({
		columnNames: self.getColumnNames(),
		rows: function () {
			return new WhereIterator(self.getIterator(), function (row) {
					return filterSelectorPredicate(mapRowByColumns(self, row));
				});
		},
		index: new Index(function () {
			var multiIterator = new MultiIterator([self.getIndex().getIterator(), self.getIterator()]);

			return {
				moveNext: function () {
					for (;;) {
						if (!multiIterator.moveNext()) {
							return false;
						}

						var row = multiIterator.getCurrent()[1];
						if (filterSelectorPredicate(mapRowByColumns(self, row))) {
							return true;
						}
					}
				},

				getCurrent: function () {
					return multiIterator.getCurrent()[0];
				},

				getCurrentIndex: function () {
					return multiIterator.getCurrentIndex()[0];
				},
			};
		}),
	}); 	
};

/**
 * Generate a new data frame based on the results of the selector function.
 *
 * @param {function} selector - Selector function that transforms each row to a different data structure.
 */
DataFrame.prototype.select = function (selector) {
	assert.isFunction(selector, "Expected 'selector' parameter to 'select' function to be a function.");

	var self = this;

	var determineColumnNames = function () {
		// Peek at the first row to ` the column names.
		var iterator = self.getIterator();
		if (!iterator.moveNext()) {
			return []; // No contents, no columns.
		}
		return Object.keys(selector(mapRowByColumns(self, iterator.getCurrent())));
	};

	return new DataFrame({
		columnNames: determineColumnNames,
		rows: function () {
			var columnNames = determineColumnNames();

			return new SelectIterator(self.getIterator(), function (row) {
					var newValue = selector(mapRowByColumns(self, row));
					return E.from(columnNames)
						.select(function (columnName) {
							return newValue[columnName];
						})
						.toArray();
				});
		},
		index: self.getIndex(),
	}); 	
};

/**
 * Generate a new data frame based on the results of the selector function.
 *
 * @param {function} selector - Selector function that transforms each row to a different data structure.
 */
DataFrame.prototype.selectMany = function (selector) {
	assert.isFunction(selector, "Expected 'selector' parameter to 'selectMany' function to be a function.");

	var self = this;

	return new DataFrame({
		rows: function () {
			return new SelectManyIterator(self.getIterator(), function (row) {
					return selector(mapRowByColumns(self, row));
				})
		},
		index: new Index(function () {
			return new SelectIterator(
					new SelectManyIterator(
						new MultiIterator([self.getIndex().getIterator(), self.getIterator()]),
						function (pair) {
							var newValues = selector(pair[1]);
							return E.from(newValues)
								.select(function (value) {
									return [
										pair[0], // Index
										value
									];
								})
								.toArray();
						}
					),
					function (pair) {
						return pair[0]; // Index.
					}
			);
		}),
	}); 	
};

/**
 * Retreive a time-series from a column of the data-frame.
 *
 * @param {string|int} columnNameOrIndex - Name or index of the column to retreive.
 */
DataFrame.prototype.getSeries = function (columnNameOrIndex) {
	var self = this;

	var columnIndex = parseColumnNameOrIndex(self, columnNameOrIndex, true);

	return new Series({
		values: function () {
			return new SelectIterator(self.getIterator(), function (row) {
					return row[columnIndex];
				});
		},
		index: self.getIndex(),
	});
};

/**
 * Returns true if the column with the requested name exists in the data frame.
 *
 * @param {string} columnName - Name of the column to check.
 */
DataFrame.prototype.hasSeries = function (columnName) {

	assert.isString(columnName);

	var self = this;
	return self.getColumnIndex(columnName) >= 0;
};

/**
 * 
 * Verify the existance of a column and return it.
 * Throws an exception if the column doesn't exist.
 *
 * @param {string|int} columnNameOrIndex - Name or index of the column to retreive.
 */
DataFrame.prototype.expectSeries = function (columnNameOrIndex) {

	var self = this;
	parseColumnNameOrIndex(self, columnNameOrIndex, true);
	return self;
};

/** 
 * Retreive a collection of all columns.
 */
DataFrame.prototype.getColumns = function () {

	var self = this;

	return E.from(self.getColumnNames())
		.select(function (columnName) {
			return {
				name: columnName,
				series: self.getSeries(columnName),
			};
		})
		.toArray();
};

/**
 * Create a new data-frame from a subset of columns.
 *
 * @param {array} columnNames - Array of column names to include in the new data-frame.
 */
DataFrame.prototype.subset = function (columnNames) {

	var self = this;
	
	assert.isArray(columnNames, "Expected 'columnNames' parameter to 'subset' to be an array.");	
	
	return new DataFrame({
		columnNames: columnNames,
		rows: function () {
			var columnIndices = E.from(columnNames)
				.select(function (columnName) {
					return self.getColumnIndex(columnName);
				})
				.toArray();

			var iterator = self.getIterator();

			return {
				moveNext: function () {
					return iterator.moveNext();
				},

				getCurrent: function () {
					var currentValue = iterator.getCurrent();
					return E.from(columnIndices)
						.select(function (columnIndex) {
							return currentValue[columnIndex];					
						})
						.toArray();
				},

				getCurrentIndex: function () {
					return iterator.getCurrentIndex();
				},
			};
		},
		index: self.getIndex(),
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

	//todo: reconsider how this works wih lazy iterators.

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
			.zip(self.toValues(), function (index, values) {
				return [index].concat(values);
			})
			.toArray();	

		cachedSorted = E.from(batch)
			.aggregate(E.from(valuesWithIndex), function (unsorted, orderCmd) {
				return unsorted[orderCmd.sortMethod](function (row) {
					var columnMappedRow = mapRowByColumns(self, E.from(row).skip(1).toArray()); // Skip the generated index column.
					return orderCmd.sortSelector(columnMappedRow);
				}); 
			})
			.toArray();

		return cachedSorted;
	};

	return new DataFrame({
		columnNames: self.getColumnNames(),
		rows: function () {
			return new ArrayIterator(
					E.from(executeLazySort())
						.select(function (row) {
							return E.from(row).skip(1).toArray(); // Extract the values (minus the index) from the sorted data.					
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
// Order by values in a partcular column, either ascending or descending
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
// Process a column selector that might be a column name, column index or selector function.
// Returns a selector fucntion.
//
var processColumnSelector = function (self, columnNameOrIndexOrSelector, fnName) {
	assert.isObject(self);
	assert.isString(fnName);

	if (!Object.isFunction(columnNameOrIndexOrSelector)) {

		var columnName;

		if (Object.isNumber(columnNameOrIndexOrSelector)) {
			var columnNames = self.getColumnNames();
			assert(
				columnNameOrIndexOrSelector >= 0 && columnNameOrIndexOrSelector < columnNames.length, 
				"Bad column index specified for 'columnNameOrIndexOrSelector' parameter to 'orderBy', expected a column index >= 0 and < " + columnNames.length
			);
			
			columnName = columnNames[columnNameOrIndexOrSelector];
		}
		else {
			assert.isString(
				columnNameOrIndexOrSelector, 
				"Expected 'columnNameOrIndexOrSelector' parameter to '" + fnName + "' to be a column name, a column index or a selector function."
			);

			columnName = columnNameOrIndexOrSelector;
		}

		columnNameOrIndexOrSelector = function (row) {
				return row[columnName];
			};
	}

	return columnNameOrIndexOrSelector;
};


//
// Generates a thenBy function that is attached to already ordered data frames.
//
var orderThenBy = function (self, batch, nextSortMethod) {
	assert.isObject(self);
	assert.isArray(batch);
	assert(batch.length > 0);
	validateSortMethod(nextSortMethod);
	
	return function (columnNameOrIndexOrSelector) {

		var extendedBatch = batch.concat([
			{
				sortSelector: processColumnSelector(self, columnNameOrIndexOrSelector, 'thenBy'),
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
 * Sorts a data frame based on a single column (specified by name or index) or by selector (ascending). 
 * 
 * @param {string|index|function} columnNameOrIndexOrSelector - A column name, column index or selector function that indicates the value to sort by.
 */
DataFrame.prototype.orderBy = function (columnNameOrIndexOrSelector) {

	var self = this;
	return orderBy(self, 'orderBy', processColumnSelector(self, columnNameOrIndexOrSelector, 'orderBy'));
};

/**
 * Sorts a data frame based on a single column (specified by name or index) or by selector (descending). 
 * 
 * @param {string|index|function} columnNameOrIndexOrSelector - A column name, column index or selector function that indicates the value to sort by.
 */
DataFrame.prototype.orderByDescending = function (columnNameOrIndexOrSelector) {

	var self = this;
	return orderBy(self, 'orderByDescending', processColumnSelector(self, columnNameOrIndexOrSelector, 'orderByDescending'));
};

/**
 * Create a new data frame with the requested column or columns dropped.
 *
 * @param {string|array} columnOrColumns - Specifies the column name (a string) or columns (array of column names) to drop.
 */
DataFrame.prototype.dropColumn = function (columnOrColumns) {
	if (!Object.isArray(columnOrColumns)) {
		assert.isString(columnOrColumns, "'dropColumn' expected either a string or an array or strings.");

		columnOrColumns = [columnOrColumns]; // Convert to array for coding convenience.
	}

	var self = this;
	var columnIndices = E.from(columnOrColumns)
		.select(function (columnName, index)  {
			assert.isString(columnName, "Expected column names specifed in parameter 'columnOrColumns' to be string values. Index " + index + " is a " + typeof(columnName));
			return self.getColumnIndex(columnName);
		})
		.where(function (columnIndex) {
			return columnIndex >= 0;
		})
		.toArray();

	return new DataFrame({
		columnNames: E.from(self.getColumnNames())
			.where(function (columnName, columnIndex) {
				return columnIndices.indexOf(columnIndex) < 0;
			})
			.toArray(),
		rows: function () {
			var iterator = self.getIterator();
			return {
				moveNext: function () {
					return iterator.moveNext();
				},

				getCurrent: function () {
					var currentValue = iterator.getCurrent();
					return E.from(currentValue)
						.where(function (column, columnIndex) {
							return columnIndices.indexOf(columnIndex) < 0;
						})
						.toArray();
				},

				getCurrentIndex: function () {
					return iterator.getCurrentIndex();
				},
			};
		},
		index: self.getIndex(),
	});
};

/**
 * Create a new data frame with an additional column specified by the passed-in series.
 *
 * @param {string} columnName - The name of the column to add or replace.
 * @param {array|column} data - Array of data or column that contains data.
 */
DataFrame.prototype.setSeries = function (columnName, data) { //todo: should allow column name or index.
	assert.isString(columnName, "Expected 'columnName' parameter to 'setSeries' to be a string.");

	var self = this;

	if (Object.isFunction(data)) {
		data = E.from(self.toObjects())
			.select(data)
			.toArray();
	}
	else if (!Object.isArray(data)) {
		assert.isObject(data, "Expected 'data' parameter to 'setSeries' to be either an array or a series object.");
		assert.isFunction(data.reindex, "Expected 'data' parameter to 'setSeries' to have a 'reindex' function that allows the column to be reindexed.");

		data = data.reindex(self.getIndex()).toValues();
	}

	//todo: overview and improve the way this works.

	var columnIndex = self.getColumnIndex(columnName);
	if (columnIndex < 0) {		
		// Add new column.
		return new DataFrame({
			columnNames: self.getColumnNames().concat([columnName]),
			rows: function () {
				return new ArrayIterator(
					E.from(self.toValues())
						.select(function (row, rowIndex) {
							return row.concat([data[rowIndex]]);
						})
						.toArray()
				);
			},
			index: self.getIndex(),
		});
	}
	else {
		// Replace existing column.
		return new DataFrame({
			columnNames: E.from(self.getColumnNames())
				.select(function (thisColumnName, thisColumnIndex) {
					if (thisColumnIndex === columnIndex) {
						return columnName;
					}
					else { 
						return thisColumnName;
					}
				})
				.toArray(),
			rows: function () {
				return new ArrayIterator(
					E.from(self.toValues())
						.select(function (row, rowIndex) {
							return E.from(row)
								.select(function (column, thisColumnIndex) {
									if (thisColumnIndex === columnIndex) {
										return data[rowIndex];
									}
									else {
										return column;
									}
								})
								.toArray();
						})
						.toArray()
				);
			},
			index: self.getIndex(),
		});
	}
};

/**
 * Create a new data-frame from a slice of rows.
 *
 * @param {int|function} startIndexOrStartPredicate - Index where the slice starts or a predicate function that determines where the slice starts.
 * @param {int|function} endIndexOrEndPredicate - Marks the end of the slice, one row past the last row to include. Or a predicate function that determines when the slice has ended.
 * @param {function} [predicate] - Optional predicate to compare index against start/end index. Return true to start or stop the slice.
 */
DataFrame.prototype.slice = function (startIndexOrStartPredicate, endIndexOrEndPredicate, predicate) {

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

	return new DataFrame({
		columnNames: self.getColumnNames(),
		rows: function () {
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
 * Set a column as the index of the data frame.
 *
 * @param {string|int} columnNameOrIndex - Name or index of the column to set as the index.
 */
DataFrame.prototype.setIndex = function (columnNameOrIndex) {

	var self = this;
	return new DataFrame({
		columnNames: self.getColumnNames(),
		rows: function () {
			return self.getIterator();
		},
		index: new Index(function () {
			return self.getSeries(columnNameOrIndex).getIterator();
		}),
	});
};

/**
 * Reset the index of the data frame back to the default sequential integer index.
 */
DataFrame.prototype.resetIndex = function () {

	var self = this;
	return new DataFrame({
		columnNames: self.getColumnNames(),
		rows: function () {
			return self.getIterator();
		},
		index: new Index(function () { //todo: broad-cast index
			return new ArrayIterator(E.range(0, self.toValues().length).toArray());
		}),
	});
};

/** 
 * Format the data frame for display as a string.
 */
DataFrame.prototype.toString = function () {

	var self = this;
	var Table = require('easy-table');

	var index = self.getIndex().toValues();
	var header = ["__index__"].concat(self.getColumnNames());
	var rows = E.from(self.toValues())
		.select(function (row, rowIndex) { 
			return [index[rowIndex]].concat(row);
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
 * Parse a column with string values to a column with int values.
 *
 * @param {string|int} columnNameOrIndex - Specifies the column to parse.
 */
DataFrame.prototype.parseInts = function (columnNameOrIndex) {

	var self = this;
	return self.setSeries(columnNameOrIndex, self.getSeries(columnNameOrIndex).parseInts());
};

/**
 * Parse a column with string values to a column with float values.
 *
 * @param {string|int} columnNameOrIndex - Specifies the column to parse.
 */
DataFrame.prototype.parseFloats = function (columnNameOrIndex) {

	var self = this;
	return self.setSeries(columnNameOrIndex, self.getSeries(columnNameOrIndex).parseFloats());
};

/**
 * Parse a column with string values to a column with date values.
 *
 * @param {string|int} columnNameOrIndex - Specifies the column to parse.
 */
DataFrame.prototype.parseDates = function (columnNameOrIndex) {

	var self = this;
	return self.setSeries(columnNameOrIndex, self.getSeries(columnNameOrIndex).parseDates());
};

/**
 * Convert a column of values of different types to a column of string values.
 *
 * * @param {string|int} columnNameOrIndex - Specifies the column to convert.
 */
DataFrame.prototype.toStrings = function (columnNameOrIndex) {

	var self = this;
	return self.setSeries(columnNameOrIndex, self.getSeries(columnNameOrIndex).toString());
};

/**
 * Detect actual types and their frequencies contained within columns in the data frame.
 */
DataFrame.prototype.detectTypes = function () {

	var self = this;

	var dataFrames = E.from(self.getColumns())
		.select(function (column) {
			var series = column.series;
			var numValues = series.toValues().length;
			//todo: broad-cast column
			var newSeries = new Series({
				values: E.range(0, numValues)
					.select(function () { 
						return column.name; 
					})
					.toArray()
			});
			return column.series
				.detectTypes()
				.setSeries('Column', newSeries);
		})
		.toArray();
	var dataForge = require('../index');
	return dataForge.concat(dataFrames).resetIndex();
};

/**
 * Detect values and their frequencies contained within columns in the data frame.
 */
DataFrame.prototype.detectValues = function () {

	var self = this;

	var dataFrames = E.from(self.getColumns())
		.select(function (column) {
			var numValues = column.series.toValues().length;
			//todo: broad-cast column
			var newSeries = new Series({
				values: E.range(0, numValues)
					.select(function () { 
						return column.name 
					})
					.toArray()
			});
			return column.series.detectValues().setSeries('Column', newSeries);
		})
		.toArray();
	var dataForge = require('../index');
	return dataForge.concat(dataFrames).resetIndex();
};
/**
 * Produces a new data frame with all string values truncated to the requested maximum length.
 *
 * @param {int} maxLength - The maximum length of the string values after truncation.
 */
DataFrame.prototype.truncateStrings = function (maxLength) {
	assert.isNumber(maxLength, "Expected 'maxLength' parameter to 'truncateStrings' to be an integer.");

	var self = this;
	var truncatedValues = E.from(self.toValues()) //todo: make this function lazy.
		.select(function (row) {
			return E.from(row)
				.select(function (value) {
					if (Object.isString(value)) {
						if (value.length > maxLength) {
							return value.substring(0, maxLength);
						}
					}

					return value;
				})
				.toArray();
		})
		.toArray();

	return new DataFrame({
			columnNames: self.getColumnNames(),
			rows: truncatedValues,
			index: self.getIndex(),
		});
};

/**
 * Create a new data frame with columns reordered.
 * New column names create new columns (with undefined values), omitting existing column names causes those columns to be dropped.
 * 
 * @param {array} columnNames - The new order for columns. 
 */
DataFrame.prototype.remapColumns = function (columnNames) {

	assert.isArray(columnNames, "Expected parameter 'columnNames' to remapColumns to be an array with column names.");

	columnNames.forEach(function (columnName) {
		assert.isString(columnName, "Expected parameter 'columnNames' to remapColumns to be an array with column names.");
	});

	var self = this;

	return new DataFrame({
		columnNames: columnNames,
		rows: function () { //todo: make this properly lazy.
			return new ArrayIterator(
				E.from(self.toValues())
					.select(function (row) {
						return E.from(columnNames)
							.select(function (columnName) {
								var columnIndex = self.getColumnIndex(columnName);
								if (columnIndex >= 0) {
									return row[columnIndex];
								}
								else { 
									// Column doesn't exist.
									return undefined;
								}
							})
							.toArray();
					})
					.toArray()
			);
		},
		index: self.getIndex(),
	});
};

/**
 * Create a new data frame with different column names.
 *
 * @param {array} newColumnNames - Array of strings, with an element for each existing column that specifies the new name of that column.
 */
DataFrame.prototype.renameColumns = function (newColumnNames) {

	var self = this;

	var numExistingColumns = self.getColumnNames().length;

	assert.isArray(newColumnNames, "Expected parameter 'newColumnNames' to renameColumns to be an array with column names.");
	assert(newColumnNames.length === numExistingColumns, "Expected 'newColumnNames' array to have an element for each existing column. There are " + numExistingColumns + "existing columns.");

	newColumnNames.forEach(function (newColumnName) {
		assert.isString(newColumnName, "Expected new column name to be a string, intead got " + typeof(newColumnName));
	});

	return new DataFrame({
		columnNames: newColumnNames,
		rows: function () {
			return self.getIterator();
		},
		index: self.getIndex(),
	});
};

/*
 * Create a new data frame with a single column renamed.
 * 
 * @param {string|int} columnNameOrIndex - Specifies the column to rename.
 * @param {string} newColumnName - The new name for the specified column.
 */
DataFrame.prototype.renameColumn = function (columnNameOrIndex, newColumnName) {

	var self = this;
	var columnIndex = parseColumnNameOrIndex(self, columnNameOrIndex, false);

	assert.isString(newColumnName, "Expected 'newColumnName' parameter to 'renameColumn' to be a string.");

	var newColumnNames = self.getColumnNames().slice(0); // Clone array.
	newColumnNames[columnIndex] = newColumnName;

	return new DataFrame({
		columnNames: newColumnNames,
		rows: function () {
			return self.getIterator();
		},
		index: self.getIndex(),
	});
};

/**
 * Bake the data frame to an array of rows.
 */
DataFrame.prototype.toValues = function () {

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
 * Bake the data frame to an array of JavaScript objects.
 */
DataFrame.prototype.toObjects = function () {

	var self = this;

	var iterator = self.getIterator();
	validateIterator(iterator);

	var objects = [];

	while (iterator.moveNext()) {
		objects.push(mapRowByColumns(self, iterator.getCurrent()));
	}

	return objects;
};

/**
 * Serialize the data frame to JSON.
 */
DataFrame.prototype.toJSON = function () {
	var self = this;
	return JSON.stringify(self.toObjects(), null, 4);
};

/**
 * Serialize the data frame to CSV.
 */
DataFrame.prototype.toCSV = function () {

	var self = this;
	var data = [self.getColumnNames()].concat(self.toValues());
	return BabyParse.unparse(data);

	/*Old csv stringify.
	var header = self.getColumnNames().join(',');
	var rows = E.from(self.toValues())
			.select(function (row) {
				return row.join(',');
			})
			.select(function (col) { // Strip newlines... these don't work in CSV files.
				if (Object.isString(col)) { //todo: not necessar if all columns are converted to strings.
					return col.replace(/\r\n/g, ' ').replace(/\n/g, ' ');
				}
				else {
					return col;
				}
			})					
			.toArray();
	return [header].concat(rows).join('\r\n');	
	*/
};

/**
 * Retreive the data as pairs of [index, objects].
 */
DataFrame.prototype.toPairs = function () {

	var self = this;

	var iterator = self.getIterator();
	validateIterator(iterator);

	var pairs = [];

	while (iterator.moveNext()) {
		pairs.push([iterator.getCurrentIndex(), mapRowByColumns(self, iterator.getCurrent())]);		
	}

	return pairs;
};

/**
 * Forces lazy evaluation to complete and 'bakes' the data frame into memory.
 */
DataFrame.prototype.bake = function () {

	var self = this;
	return new DataFrame({
			columnNames: self.getColumnNames(),
			rows: self.toValues(),
			index: self.getIndex().bake(),
		});
};

/**
 * Count the number of rows in the data frame.
 */
DataFrame.prototype.count = function () {

	var self = this;

	var total = 0;

	var iterator = self.getIterator();

	while (iterator.moveNext()) {
		++total;
	}

	return total;
};

/**
 * Transform a column. This is equivalent to extracting a column, calling 'select' on it,
 * then plugging it back in as the same column.
 *
 * @param {string} columnName - Name of the column to transform.
 * @param {function} selector - Selector function that transforms each row to a different data structure.
 * 
 */
DataFrame.prototype.transformColumn = function (columnNameOrColumnNames, selector) { //todo: this should support 'column name or index'.

	var self = this; //todo: make this lazy.

	if (Object.isObject(columnNameOrColumnNames)) {
		var columnNames = Object.keys(columnNameOrColumnNames)
		return E.from(columnNames)
			.aggregate(self, function (prevDataFrame, columnName) {
				var columnSelector = columnNameOrColumnNames[columnName];
				return prevDataFrame.transformColumn(columnName, columnSelector);
			});
	}
	else {
		assert.isString(columnNameOrColumnNames, "Expected 'columnNameOrColumnNames' parameter to 'transformColumn' to be a string or object.");
		assert.isFunction(selector, "Expected 'selector' parameter to 'transformColumn' to be a function.");

		var columnName = columnNameOrColumnNames;
		if (!self.hasSeries(columnName)) {
			return self;
		}

		var transformedSeries = self.getSeries(columnName).select(selector);
		return self.setSeries(columnName, transformedSeries);
	}
};

/**
 * Move a window over the data-frame (batch by batch), invoke a selector for each window that builds a new series.
 *
 * @param {integer} period - The number of rows in the window.
 * @param {function} selector - The selector function invoked per row that builds the output series.
 *
 * The selector has the following parameters: 
 *
 *		window - Data-frame that represents the rolling window.
 *		windowIndex - The 0-based index of the window.
 */
DataFrame.prototype.window = function (period, selector) {

	assert.isNumber(period, "Expected 'period' parameter to 'window' to be a number.");
	assert.isFunction(selector, "Expected 'selector' parameter to 'window' to be a function.");

	var self = this;

	//todo: make this properly lazy

	var index = self.getIndex().toValues();
	var values = self.toValues();

	if (values.length == 0) {
		return new Series();
	}

	var numWindows = Math.ceil(values.length/period);
	if (numWindows == 0) {
		return new Series();
	}
	
	//todo: make this properly lazy

	var newIndexAndValues = E.range(0, numWindows)
		.select(function (windowIndex) {
			var _window = new DataFrame({
					columnNames: self.getColumnNames(),
					rows: function () {
						return new TakeIterator(new SkipIterator(self.getIterator(), windowIndex*period), period);
					},
					index: new Index(function () {
						return new TakeIterator(new SkipIterator(self.getIndex().getIterator(), windowIndex*period), period);
					}),
				});
			return selector(_window, windowIndex);			
		})
		.toArray();

	var newIndex = E.from(newIndexAndValues)
		.select(function (indexAndValue) {
			return indexAndValue[0];
		})
		.toArray();
	var newValues = E.from(newIndexAndValues)
		.select(function (indexAndValue) {
			return indexAndValue[1];
		})
		.toArray();

	return new Series({
			values: newValues,
			index: new Index(newIndex)
		});
};

/** 
 * Move a window over the data-frame (row by row), invoke a selector for each window that builds a new series.
 *
 * @param {integer} period - The number of rows in the window.
 * @param {function} selector - The selector function invoked per row that builds the output series.
 *
 * The selector has the following parameters: 
 *
 *		window - Data-frame that represents the rolling window.
 *		windowIndex - The 0-based index of the window.
 */
DataFrame.prototype.rollingWindow = function (period, selector) {

	assert.isNumber(period, "Expected 'period' parameter to 'rollingWindow' to be a number.");
	assert.isFunction(selector, "Expected 'selector' parameter to 'rollingWindow' to be a function.");

	var self = this;

	//todo: make this properly lazy

	var index = self.getIndex().toValues();
	var values = self.toObjects();

	if (values.length == 0) {
		return new DataFrame();
	}

	var newIndexAndValues = E.range(0, values.length-period+1)
		.select(function (windowIndex) {
			var _window = new DataFrame({
					columnNames: self.getColumnNames(),
					rows: function () {
						return new TakeIterator(new SkipIterator(self.getIterator(), windowIndex), period);
					},
					index: new Index(function () {
						return new TakeIterator(new SkipIterator(self.getIndex().getIterator(), windowIndex), period);
					}),
				});
			return selector(_window, windowIndex);			
		})
		.toArray();

	var newIndex = E.from(newIndexAndValues)
		.select(function (indexAndValue) {
			return indexAndValue[0];
		})
		.toArray();
	var newValues = E.from(newIndexAndValues)
		.select(function (indexAndValue) {
			return indexAndValue[1];
		})
		.toArray();

	return new Series({
			values: newValues,
			index: new Index(newIndex)
		});
};

/**
 * Get the first row of the data frame.
 */
DataFrame.prototype.first = function () {

	var self = this;

	var iterator = self.getIterator();

	if (!iterator.moveNext()) {
		throw new Error("No rows in data-frame.");
	}

	return mapRowByColumns(self, iterator.getCurrent());
};

/**
 * Get the last row of the data frame.
 */
DataFrame.prototype.last = function () {

	var self = this;

	var iterator = self.getIterator();

	if (!iterator.moveNext()) {
		throw new Error("No rows in data-frame.");
	}

	var last = iterator.getCurrent();

	while (iterator.moveNext()) {
		last = iterator.getCurrent();
	}

	return mapRowByColumns(self, last);
};

/** 
 * Reverse the data-frame.
 */
DataFrame.prototype.reverse = function () {

	var self = this;

	return new DataFrame({
			rows: E.from(self.toObjects()).reverse().toArray(),
			index: self.getIndex().reverse()
		});
};

/** 
 * Generate new columns based on existing rows.
 *
 * @param {function} selector - Selector function that transforms each row to a new set of columns.
 */
DataFrame.prototype.generateColumns = function (selector) {

	assert.isFunction(selector, "Expected 'selector' parameter to 'generateColumns' function to be a function.");

	var self = this;

	//todo: make this lazy.
	//todo: this should merge on index.
	//todo: need to be able to override columns on 1 data frame with columns from another.

	var newColumns = self.select(selector);
	return E.from(newColumns.getColumnNames())
		.aggregate(self, function (prevDataFrame, newColumnName) {
			return prevDataFrame.setSeries(newColumnName, newColumns.getSeries(newColumnName));
		});
};

/** 
 * Deflate a data-frame to a series.
 *
 * @param {function} selector - Selector function that transforms each row to a new sequence of values.
 */
DataFrame.prototype.deflate = function (selector) {

	assert.isFunction(selector, "Expected 'selector' parameter to 'deflate' function to be a function.");

	var self = this;

	//todo: make this lazy.
	
	var newValues = E.from(self.toObjects())
		.select(selector)
		.toArray();

	return new Series({ values: newValues, index: self.getIndex() });
};

/** 
 * Inflate a named column in the data-frame to 1 or more new columns.
 *
 * @param {string|int} columnNameOrIndex - Name or index of the column to retreive.
 * @param {function} [selector] - Selector function that transforms each value in the column to new columns.
 */
DataFrame.prototype.inflateColumn = function (columnNameOrIndex, selector) {

	var self = this;
	var dataForge = require('../index');
	return self.zip(self.getSeries(columnNameOrIndex).inflate(selector),
		function (row1, row2) {
			return extend({}, row1, row2); //todo: this be should zip's default operation.
		}
	);
};

/** 
 * Get X rows from the head of the data frame.
 *
 * @param {int} numRows - Number of rows to take.
 */
DataFrame.prototype.head = function (numRows) {

	assert.isNumber(numRows, "Expected 'numRows' parameter to 'head' function to be a function.");

	var self = this;
	return self.take(numRows);
};

/** 
 * Get X rows from the tail of the data frame.
 *
 * @param {int} numRows - Number of rows to take.
 */
DataFrame.prototype.tail = function (numRows) {

	assert.isNumber(numRows, "Expected 'numRows' parameter to 'tail' function to be a function.");

	var self = this;
	return self.skip(self.count() - numRows);
};

/**
 * Aggregate the rows of the data-frame.
 *
 * @param {object} [seed] - The seed value for producing the aggregation.
 * @param {function} selector - Function that takes the seed and then each row in the data-frame and produces the aggregate value.
 */
DataFrame.prototype.aggregate = function (seedOrSelector, selector) {

	var self = this;

	if (Object.isFunction(seedOrSelector) && !selector) {
		return E.from(self.toObjects()).aggregate(seedOrSelector);		
	}
	else if (selector) {
		assert.isFunction(selector, "Expected 'selector' parameter to aggregate to be a function.");
		return E.from(self.toObjects()).aggregate(seedOrSelector, selector);
	}
	else {
		assert.isObject(seedOrSelector, "Expected 'seed' parameter to aggregate to be an object.");

		return E.from(Object.keys(seedOrSelector))
			.select(function (columnName) {
				var columnSelector = seedOrSelector[columnName];
				assert.isFunction(columnSelector, "Expected column/selector pairs in 'seed' parameter to aggregate.");
				return [columnName, self.getSeries(columnName).aggregate(columnSelector)];
			})
			.toObject(
				function (pair) {
					return pair[0];
				},
				function (pair) {
					return pair[1];					
				}
			);
	}
};

/**
 * Convert the data-frame to a JavaScript object.
 *
 * @param {function} keySelector - Function that selects keys for the resulting object.
 * @param {valueSelector} keySelector - Function that selects values for the resulting object.
 */
DataFrame.prototype.toObject = function (keySelector, valueSelector) {

	var self = this;

	assert.isFunction(keySelector, "Expected 'keySelector' parameter to toObject to be a function.");
	assert.isFunction(valueSelector, "Expected 'valueSelector' parameter to toObject to be a function.");

	return E.from(self.toObjects()).toObject(keySelector, valueSelector);
};

/**
 * Zip together multiple data-frames to produce a new data-frame.
 *
 * @param {...object} dataFrames - Each data-frame that is to be zipped.
 * @param {function} selector - Selector function that produces a new data-frame based on the inputs.
 */
DataFrame.prototype.zip = function () {

	var dataFrames = E.from(arguments)
		.takeWhile(function (arg) {
			return arg && !Object.isFunction(arg);
		})
		.toArray();

	assert(dataFrames.length >= 0, "Expected 1 or more 'data-frame' parameters to the zip function.");

	dataFrames = [this].concat(dataFrames);

	var selector = E.from(arguments)
		.skipWhile(function (arg) {
			return arg && !Object.isFunction(arg);
		})
		.firstOrDefault();

	assert.isFunction(selector, "Expect 'selector' parameter to zip to be a function.");

	var dataForge = require('../index.js');
	return dataForge.zipDataFrames(dataFrames, function (rows) {
			return selector.apply(undefined, rows);
		});
};

/**
 * Bring the name column to the front, making it the first column in the data-frame.
 *
 * @param {string} columnName - The name of the column to bring to the front.
 */
DataFrame.prototype.bringToFront = function (columnName) {

	assert.isString(columnName, "Expect 'columnName' parameter to bringToFront function to be a string.");

	var self = this;

	var columnIndex = self.getColumnIndex(columnName);
	if (columnIndex < 0) {
		throw new Error("Failed to find column with name '" + columnName + "'.");
	}

	var reorderedColumnNames = [columnName].concat(utils.dropElement(self.getColumnNames(), columnIndex));
	return self.remapColumns(reorderedColumnNames);
};

/**
 * Bring the name column to the back, making it the last column in the data-frame.
 *
 * @param {string} columnName - The name of the column to bring to the back.
 */
DataFrame.prototype.bringToBack = function (columnName) {

	assert.isString(columnName, "Expect 'columnName' parameter to bringToBack function to be a string.");

	var self = this;

	var columnIndex = self.getColumnIndex(columnName);
	if (columnIndex < 0) {
		throw new Error("Failed to find column with name '" + columnName + "'.");
	}

	var reorderedColumnNames = utils.dropElement(self.getColumnNames(), columnIndex).concat([columnName]);
	return self.remapColumns(reorderedColumnNames);
};

module.exports = DataFrame;