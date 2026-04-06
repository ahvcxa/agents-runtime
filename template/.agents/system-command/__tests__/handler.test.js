const { execute, ALLOWED_COMMANDS } = require('../handler');

describe('system-command skill', () => {
  test('should reject commands not in whitelist', async () => {
    const result = await execute({
      command: 'rm',
      args: ['-rf', '/']
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('COMMAND_NOT_ALLOWED');
  });

  test('should reject dangerous command patterns', async () => {
    const result = await execute({
      command: 'sudo',
      args: ['rm', '-rf', '/']
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('COMMAND_NOT_ALLOWED');
  });

  test('should require args as array', async () => {
    const result = await execute({
      command: 'node',
      args: 'not-an-array'
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_ARGS');
  });

  test('should enforce args size limit', async () => {
    const largeArgs = ['.repeat(5000)].join('')]; // Exceed 32KB

    const result = await execute({
      command: 'echo',
      args: largeArgs
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('ARGS_TOO_LARGE');
  });

  test('should execute allowed command', async () => {
    const result = await execute({
      command: 'echo',
      args: ['Hello, World!']
    });

    expect(result.success).toBe(true);
    expect(result.data.stdout).toContain('Hello');
    expect(result.data.exitCode).toBe(0);
  });

  test('should capture stderr separately', async () => {
    const result = await execute({
      command: 'node',
      args: ['-e', 'console.error("Error message")']
    });

    expect(result.data.stderr).toBeDefined();
  });

  test('should have whitelist defined', () => {
    expect(ALLOWED_COMMANDS).toBeDefined();
    expect(ALLOWED_COMMANDS.node).toBeDefined();
    expect(ALLOWED_COMMANDS.npm).toBeDefined();
  });
});
