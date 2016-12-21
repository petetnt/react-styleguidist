'use strict';

const fs = require('fs');
const path = require('path');
const isDirectory = require('is-directory');
const castArray = require('lodash/castArray');
const isBoolean = require('lodash/isBoolean');
const isFunction = require('lodash/isFunction');
const isPlainObject = require('lodash/isPlainObject');
const isString = require('lodash/isString');
const isFinite = require('lodash/isFinite');
const map = require('lodash/map');
const listify = require('listify');
const leven = require('leven');
const StyleguidistError = require('./error');

const typeCheckers = {
	number: isFinite,
	string: isString,
	boolean: isBoolean,
	array: Array.isArray,
	function: isFunction,
	object: isPlainObject,
	'file path': isString,
	'existing file path': isString,
	'directory path': isString,
	'existing directory path': isString,
};

const typesList = types => listify(types, { finalWord: 'or' });
const shouldBeFile = types => types.some(type => type.includes('file'));
const shouldBeDirectory = types => types.some(type => type.includes('directory'));
const shouldExist = types => types.some(type => type.includes('existing'));

/**
 * Validates and normalizes config.
 *
 * @param {object} config
 * @param {object} schema
 * @param {string} rootDir
 * @return {object}
 */
module.exports = function sanitizeConfig(config, schema, rootDir) {
	// Check for unknown fields
	map(config, (value, key) => {
		if (!schema[key]) {
			// Try to guess
			const possibleOptions = Object.keys(schema);
			const suggestion = possibleOptions.reduce((suggestion, option) => {
				const steps = leven(option, key);
				if (steps < 2) {
					return option;
				}
				return suggestion;
			}, null);

			throw new StyleguidistError(
				`Unknown config option "${key}".` +
				(suggestion ? ` Did you mean "${suggestion}"?` : '')
			);
		}
	});

	// Check all fields
	const safeConfig = {};
	map(schema, (props, key) => {
		let value = config[key];

		// Custom processing
		if (props.process) {
			value = props.process(value, config);
		}

		if (value === undefined) {
			// Default value
			value = props.default;

			// Check if the field is required
			const isRequired = isFunction(props.required)
				? props.required(config)
				: props.required
			;
			if (isRequired) {
				const message = isString(isRequired)
					? isRequired
					: `"${key}" config option is required.`;
				throw new StyleguidistError(message);
			}
		}

		if (value !== undefined && props.type) {
			const types = castArray(props.type);

			// Check type
			const hasRightType = types.some(type => {
				if (!typeCheckers[type]) {
					throw Error(`Wrong type "${type}" specified for "${key}" in schema.`);
				}
				return typeCheckers[type](value);
			});
			if (!hasRightType) {
				throw new StyleguidistError(
					`"${key}" config option should be ${typesList(types)}, received ${typeof value}.`
				);
			}

			// Absolutize paths
			if (isString(value) && (shouldBeFile(types) || shouldBeDirectory(types))) {
				value = path.resolve(rootDir, value);

				// Check for existence
				if (shouldExist(types)) {
					if (shouldBeFile(types) && !fs.existsSync(value)) {
						throw new StyleguidistError(
							`A file specified in "${key}" config option does not exist:\n${value}`
						);
					}
					if (shouldBeDirectory(types) && !isDirectory.sync(value)) {
						throw new StyleguidistError(
							`A directory specified in "${key}" config option does not exist:\n${value}`
						);
					}
				}
			}
		}

		safeConfig[key] = value;
	});

	return safeConfig;
};