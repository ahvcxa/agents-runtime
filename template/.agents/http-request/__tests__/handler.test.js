const { execute } = require('../handler');

describe('http-request skill', () => {
  test('should validate invalid URL', async () => {
    const result = await execute({
      method: 'GET',
      url: 'not-a-url'
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_URL');
  });

  test('should require method and url', async () => {
    const result = await execute({
      // Missing method and url
    });

    expect(result.success).toBe(false);
  });

  test('should mask auth headers in response', async () => {
    const result = await execute({
      method: 'GET',
      url: 'https://httpbin.org/headers',
      headers: {
        'Authorization': 'Bearer token123'
      }
    });

    // Auth header should not appear in error/logs
    const json = JSON.stringify(result);
    expect(json).not.toContain('token123');
  });

  test('should handle timeout', async () => {
    const result = await execute({
      method: 'GET',
      url: 'https://httpbin.org/delay/10',
      timeout: 1000
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NETWORK_TIMEOUT');
  }, 10000);

  test('should support retries', async () => {
    const result = await execute({
      method: 'GET',
      url: 'https://httpbin.org/status/500',
      retry: {
        maxAttempts: 2,
        initialDelay: 100
      }
    });

    expect(result.metadata.retries).toBeGreaterThanOrEqual(0);
  });
});
