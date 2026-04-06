const Ajv = require('ajv');

const MAX_DATA_SIZE = 50 * 1024 * 1024; // 50MB

const ajv = new Ajv();

/**
 * Safe JSON parse with error handling
 */
function safeJsonParse(str, maxSize = MAX_DATA_SIZE) {
  if (typeof str !== 'string') {
    throw new Error('Input must be a string');
  }
  
  if (str.length > maxSize) {
    throw new Error(`JSON exceeds size limit (${str.length} > ${maxSize} bytes)`);
  }
  
  try {
    return JSON.parse(str);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err.message}`);
  }
}

/**
 * Safe JSON stringify with circular reference detection
 */
function safeJsonStringify(obj, options = {}) {
  const { replacer, space = 2, maxSize = MAX_DATA_SIZE } = options;
  const seen = new WeakSet();
  
  const customReplacer = (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return replacer ? replacer(key, value) : value;
  };
  
  try {
    const result = JSON.stringify(obj, customReplacer, space);
    
    if (result.length > maxSize) {
      throw new Error(`Stringified output exceeds size limit (${result.length} > ${maxSize} bytes)`);
    }
    
    return result;
  } catch (err) {
    throw new Error(`Stringify failed: ${err.message}`);
  }
}

/**
 * Transform object based on rules
 */
function transform(data, rules) {
  if (!rules || typeof rules !== 'object') {
    throw new Error('Rules must be an object');
  }
  
  // Simple key mapping transformation
  if (rules.mapping && typeof rules.mapping === 'object') {
    const result = {};
    
    for (const [sourceKey, targetKey] of Object.entries(rules.mapping)) {
      if (sourceKey in data) {
        result[targetKey] = data[sourceKey];
      }
    }
    
    return result;
  }
  
  // Exclude keys
  if (rules.exclude && Array.isArray(rules.exclude)) {
    const result = { ...data };
    for (const key of rules.exclude) {
      delete result[key];
    }
    return result;
  }
  
  // Include only specified keys
  if (rules.include && Array.isArray(rules.include)) {
    const result = {};
    for (const key of rules.include) {
      if (key in data) {
        result[key] = data[key];
      }
    }
    return result;
  }
  
  throw new Error('Rules must include mapping, exclude, or include');
}

/**
 * Filter array based on predicate
 */
function filter(data, rules) {
  if (!Array.isArray(data)) {
    throw new Error('Data must be an array for filter operation');
  }
  
  if (!rules || !rules.predicate) {
    throw new Error('Predicate function required for filter');
  }
  
  // Safe predicate evaluation (no eval, only simple comparisons)
  const predicateStr = rules.predicate;
  
  // Whitelist safe predicate patterns
  if (!isValidPredicate(predicateStr)) {
    throw new Error('Predicate contains unsafe patterns');
  }
  
  // Execute predicate safely
  return data.filter((item, index) => {
    try {
      // Use Function constructor with explicit parameters (safer than eval)
      const predicateFn = new Function('x', 'index', `return ${predicateStr}`);
      return predicateFn(item, index);
    } catch (err) {
      throw new Error(`Predicate error: ${err.message}`);
    }
  });
}

/**
 * Validate predicate for safety
 */
function isValidPredicate(predicate) {
  // Block dangerous patterns
  const dangerous = ['import', 'require', 'eval', 'Function', 'process', 'child_process'];
  
  const lowerPred = predicate.toLowerCase();
  for (const pattern of dangerous) {
    if (lowerPred.includes(pattern)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Merge multiple objects (deep merge)
 */
function merge(objects) {
  if (!Array.isArray(objects)) {
    throw new Error('Objects must be an array');
  }
  
  const result = {};
  
  for (const obj of objects) {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      deepMerge(result, obj);
    }
  }
  
  return result;
}

/**
 * Deep merge helper
 */
function deepMerge(target, source) {
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        target[key] = target[key] || {};
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
}

/**
 * Validate data against schema
 */
function validate(data, schema) {
  if (!schema || typeof schema !== 'object') {
    throw new Error('Schema must be a valid object');
  }
  
  try {
    const validate = ajv.compile(schema);
    const valid = validate(data);
    
    return {
      valid: valid,
      errors: valid ? [] : validate.errors
    };
  } catch (err) {
    throw new Error(`Schema validation failed: ${err.message}`);
  }
}

/**
 * Extract nested value using path
 */
function extract(data, rules) {
  if (!rules || !rules.path) {
    throw new Error('Path required for extract operation');
  }
  
  const pathParts = rules.path.split('.');
  let current = data;
  
  for (const part of pathParts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return null;
    }
  }
  
  return current;
}

/**
 * Execute data transformation
 * @param {Object} input - Input parameters
 * @param {Object} context - Runtime context (optional)
 * @returns {Promise<Object>} Standard response object
 */
async function execute(input, context = {}) {
  const startTime = Date.now();

  try {
    const {
      operation,
      data,
      rules,
      schema,
      options = {}
    } = input;

    let result;
    const inputSize = calculateSize(data);

    switch (operation) {
      case 'parse':
        result = safeJsonParse(data, options.maxSize);
        break;

      case 'stringify':
        result = safeJsonStringify(data, options);
        break;

      case 'transform':
        result = transform(data, rules);
        break;

      case 'filter':
        result = filter(data, rules);
        break;

      case 'merge':
        result = merge(data);
        break;

      case 'validate':
        result = validate(data, schema);
        break;

      case 'extract':
        result = extract(data, rules);
        break;

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    const outputSize = calculateSize(result);

    return {
      success: true,
      data: result,
      error: null,
      metadata: {
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        inputSize,
        outputSize,
        operation
      }
    };
  } catch (err) {
    let errorCode = 'TRANSFORM_FAILED';
    let errorMessage = err.message;

    if (err.message.includes('JSON')) {
      errorCode = 'INVALID_JSON';
    } else if (err.message.includes('size limit')) {
      errorCode = 'SIZE_LIMIT_EXCEEDED';
    } else if (err.message.includes('Schema')) {
      errorCode = 'SCHEMA_ERROR';
    } else if (err.message.includes('Predicate')) {
      errorCode = 'PREDICATE_ERROR';
    } else if (err.message.includes('unsafe')) {
      errorCode = 'UNSAFE_OPERATION';
    }

    return {
      success: false,
      data: null,
      error: {
        code: errorCode,
        message: errorMessage
      },
      metadata: {
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        operation: input.operation
      }
    };
  }
}

/**
 * Calculate approximate size of data
 */
function calculateSize(data) {
  try {
    const json = JSON.stringify(data);
    return Buffer.byteLength(json);
  } catch {
    return 0;
  }
}

module.exports = { execute };
