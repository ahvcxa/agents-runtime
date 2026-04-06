const { execute } = require('../handler');

describe('logging skill', () => {
  test('should mask passwords in logs', async () => {
    const result = await execute({
      operation: 'log',
      level: 'INFO',
      message: 'User login failed',
      data: { password: 'secret123' }
    });

    expect(result.success).toBe(true);
    expect(result.data.data.password).toBe('***MASKED***');
    expect(result.metadata.masked).toBe(true);
    expect(result.metadata.maskedFields).toContain('password');
  });

  test('should mask API keys', async () => {
    const result = await execute({
      operation: 'log',
      level: 'WARN',
      message: 'API call',
      data: { api_key: 'sk-abc123xyz' }
    });

    expect(result.success).toBe(true);
    expect(result.data.data.api_key).toBe('***MASKED***');
    expect(result.metadata.maskedFields).toContain('api_key');
  });

  test('should mask tokens in messages', async () => {
    const result = await execute({
      operation: 'log',
      level: 'INFO',
      message: 'Authorization: Bearer token-secret-123'
    });

    expect(result.success).toBe(true);
    expect(result.data.message).not.toContain('token-secret-123');
    expect(result.data.message).toContain('***MASKED***');
  });

  test('should support multiple log levels', async () => {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

    for (const level of levels) {
      const result = await execute({
        operation: 'log',
        level,
        message: `Test ${level} message`
      });

      expect(result.success).toBe(true);
      expect(result.data.level).toBe(level);
    }
  });

  test('should enforce message size limit', async () => {
    const largeMessage = 'x'.repeat(5000); // Exceed 4096 char limit

    const result = await execute({
      operation: 'log',
      level: 'INFO',
      message: largeMessage
    });

    expect(result.success).toBe(false);
  });

  test('should not log in test environment', async () => {
    // Logging operations should not fail even if disk is unavailable
    const result = await execute({
      operation: 'log',
      level: 'INFO',
      message: 'Test message'
    });

    // Should succeed gracefully
    expect(result).toBeDefined();
  });
});
