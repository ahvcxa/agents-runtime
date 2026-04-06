const { execute } = require('../handler');
const path = require('path');

describe('file-operations skill', () => {
  test('should reject path traversal attempts', async () => {
    const result = await execute({
      operation: 'read',
      path: '../../etc/passwd'
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toContain('PATH');
  });

  test('should reject absolute paths', async () => {
    const result = await execute({
      operation: 'read',
      path: '/etc/passwd'
    });

    expect(result.success).toBe(false);
  });

  test('should block .env files', async () => {
    const result = await execute({
      operation: 'read',
      path: '.env'
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('BLOCKED_FILE');
  });

  test('should enforce file size limits', async () => {
    const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB
    
    const result = await execute({
      operation: 'write',
      path: 'large-file.txt',
      content: largeContent
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('FILE_TOO_LARGE');
  });

  test('should support write operation', async () => {
    const result = await execute({
      operation: 'write',
      path: 'test-file.txt',
      content: 'Hello, World!'
    });

    expect(result.success).toBe(true);
    expect(result.data.size).toBe(13);
  });

  test('should check file existence', async () => {
    const result = await execute({
      operation: 'exists',
      path: 'non-existent-file.txt'
    });

    expect(result.success).toBe(true);
    expect(result.data.exists).toBe(false);
  });
});
