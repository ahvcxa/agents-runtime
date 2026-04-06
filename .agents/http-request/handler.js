const https = require('https');
const http = require('http');
const { URL } = require('url');
const zlib = require('zlib');

/**
 * Mask sensitive headers in logs
 * @param {Object} headers - HTTP headers
 * @returns {Object} Headers with masked sensitive values
 */
function maskSensitiveHeaders(headers) {
  const masked = { ...headers };
  const sensitiveHeaders = ['authorization', 'x-api-key', 'x-auth-token', 'cookie'];
  
  for (const header of sensitiveHeaders) {
    if (masked[header]) {
      masked[header] = '***MASKED***';
    }
  }
  
  return masked;
}

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} initialDelay - Initial delay in ms
 * @param {number} multiplier - Backoff multiplier
 * @returns {number} Delay in milliseconds
 */
function calculateBackoffDelay(attempt, initialDelay, multiplier) {
  return initialDelay * Math.pow(multiplier, attempt);
}

/**
 * Check if error is retryable
 * @param {number} statusCode - HTTP status code
 * @param {string} errorCode - Error code
 * @returns {boolean} true if request should be retried
 */
function isRetryable(statusCode, errorCode) {
  // Retryable HTTP status codes
  const retryableStatuses = [408, 429, 500, 502, 503, 504];
  
  // Retryable error codes
  const retryableErrors = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH'];
  
  return retryableStatuses.includes(statusCode) || retryableErrors.includes(errorCode);
}

/**
 * Make HTTP/HTTPS request with retry logic
 * @param {Object} input - Input parameters (validated against manifest schema)
 * @param {Object} context - Runtime context (optional)
 * @returns {Promise<Object>} Standard response object
 */
async function execute(input, context = {}) {
  const startTime = Date.now();
  
  try {
    // Extract and validate parameters
    const {
      method,
      url,
      headers = {},
      body = null,
      timeout = 30000,
      retry = { maxAttempts: 3, initialDelay: 1000, backoffMultiplier: 2 },
      allowRedirects = true,
      validateStatus = true
    } = input;

    // Validate URL format
    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (err) {
      return {
        success: false,
        data: null,
        error: {
          code: 'INVALID_URL',
          message: `Invalid URL format: ${err.message}`
        },
        metadata: {
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      };
    }

    // Check protocol
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return {
        success: false,
        data: null,
        error: {
          code: 'UNSUPPORTED_PROTOCOL',
          message: `Unsupported protocol: ${urlObj.protocol}. Only http and https are supported.`
        },
        metadata: {
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      };
    }

    // Prepare request options
    const protocol = urlObj.protocol === 'https:' ? https : http;
    const requestHeaders = {
      'User-Agent': 'agents-runtime/1.0',
      ...headers
    };

    // Add Content-Length for body requests
    let bodyString = null;
    if (body) {
      if (typeof body === 'object') {
        bodyString = JSON.stringify(body);
        requestHeaders['Content-Type'] = 'application/json';
      } else {
        bodyString = String(body);
      }
      requestHeaders['Content-Length'] = Buffer.byteLength(bodyString);
    }

    // Retry configuration
    const maxAttempts = retry?.maxAttempts || 3;
    const initialDelay = retry?.initialDelay || 1000;
    const backoffMultiplier = retry?.backoffMultiplier || 2;

    let lastError = null;
    let lastStatusCode = null;
    let retries = 0;

    // Retry loop
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await makeRequest(
          protocol,
          urlObj,
          method,
          requestHeaders,
          bodyString,
          timeout,
          allowRedirects,
          startTime
        );

        // Check if response indicates error
        if (validateStatus && response.status >= 400) {
          lastStatusCode = response.status;
          
          // Check if retryable
          if (isRetryable(response.status, null) && attempt < maxAttempts - 1) {
            const delay = calculateBackoffDelay(attempt, initialDelay, backoffMultiplier);
            await new Promise(r => setTimeout(r, delay));
            retries++;
            continue;
          }

          return {
            success: false,
            data: response,
            error: {
              code: 'HTTP_ERROR',
              message: `HTTP ${response.status}: ${response.statusText}`,
              details: {
                status: response.status,
                statusText: response.statusText
              }
            },
            metadata: {
              executionTime: Date.now() - startTime,
              timestamp: new Date().toISOString(),
              retries
            }
          };
        }

        return {
          success: true,
          data: response,
          error: null,
          metadata: {
            executionTime: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            retries
          }
        };
      } catch (err) {
        lastError = err;

        // Check if retryable
        if (isRetryable(lastStatusCode, err.code) && attempt < maxAttempts - 1) {
          const delay = calculateBackoffDelay(attempt, initialDelay, backoffMultiplier);
          await new Promise(r => setTimeout(r, delay));
          retries++;
          continue;
        }

        throw err;
      }
    }

    // All retries exhausted
    if (lastError) {
      throw lastError;
    }

  } catch (err) {
    const executionTime = Date.now() - startTime;
    
    // Map common errors to error codes
    let errorCode = 'NETWORK_ERROR';
    let errorMessage = err.message;

    if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
      errorCode = 'NETWORK_TIMEOUT';
      errorMessage = `Request timed out after ${input.timeout || 30000}ms`;
    } else if (err.code === 'ECONNREFUSED') {
      errorCode = 'NETWORK_ERROR';
      errorMessage = 'Connection refused (server unreachable)';
    } else if (err.code === 'ENOTFOUND') {
      errorCode = 'NETWORK_ERROR';
      errorMessage = 'DNS lookup failed';
    } else if (err.message.includes('certificate') || err.code === 'CERT_HAS_EXPIRED') {
      errorCode = 'SSL_ERROR';
      errorMessage = 'SSL certificate verification failed';
    }

    return {
      success: false,
      data: null,
      error: {
        code: errorCode,
        message: errorMessage,
        details: {
          errorCode: err.code,
          nodeError: err.message
        }
      },
      metadata: {
        executionTime: executionTime,
        timestamp: new Date().toISOString()
      }
    };
  }
}

/**
 * Perform actual HTTP request
 * @private
 */
function makeRequest(protocol, urlObj, method, headers, body, timeout, allowRedirects, startTime, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers,
      timeout
    };

    const request = protocol.request(options, (response) => {
      let data = '';
      const chunks = [];
      let size = 0;

      // Handle compression
      let stream = response;
      if (response.headers['content-encoding'] === 'gzip') {
        stream = response.pipe(zlib.createGunzip());
      } else if (response.headers['content-encoding'] === 'deflate') {
        stream = response.pipe(zlib.createInflate());
      }

      stream.on('data', (chunk) => {
        chunks.push(chunk);
        size += chunk.length;

        // Check size limit (50MB)
        if (size > 50 * 1024 * 1024) {
          request.abort();
          reject(new Error('Response body exceeds 50MB limit'));
        }
      });

      stream.on('end', () => {
        data = Buffer.concat(chunks).toString('utf-8');

        // Handle redirects
        if (allowRedirects && [301, 302, 303, 307, 308].includes(response.statusCode)) {
          if (redirectCount >= 5) {
            return reject(new Error('Redirect limit exceeded (max 5)'));
          }

          const location = response.headers.location;
          if (!location) {
            return reject(new Error('Redirect location not found'));
          }

          try {
            const redirectUrl = new URL(location, urlObj.href);
            const redirectProtocol = redirectUrl.protocol === 'https:' ? require('https') : require('http');
            
            return makeRequest(
              redirectProtocol,
              redirectUrl,
              method === 'POST' || method === 'PUT' ? 'GET' : method,
              headers,
              null,
              timeout,
              allowRedirects,
              startTime,
              redirectCount + 1
            ).then(resolve).catch(reject);
          } catch (err) {
            reject(err);
          }
          return;
        }

        // Parse response body
        let parsedBody = data;
        if (response.headers['content-type']?.includes('application/json')) {
          try {
            parsedBody = JSON.parse(data);
          } catch (err) {
            return reject(new Error('Invalid JSON in response'));
          }
        }

        resolve({
          status: response.statusCode,
          statusText: response.statusMessage || '',
          headers: response.headers,
          body: parsedBody,
          size: size
        });
      });

      stream.on('error', reject);
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.abort();
      reject(new Error(`Request timed out after ${timeout}ms`));
    });

    if (body) {
      request.write(body);
    }

    request.end();
  });
}

module.exports = { execute };
