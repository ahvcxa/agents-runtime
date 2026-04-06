const { execute } = require('../handler');

describe('data-transform skill', () => {
  test('should safely parse JSON', async () => {
    const result = await execute({
      operation: 'parse',
      data: '{"name": "John", "age": 30}'
    });

    expect(result.success).toBe(true);
    expect(result.data.name).toBe('John');
    expect(result.data.age).toBe(30);
  });

  test('should reject invalid JSON', async () => {
    const result = await execute({
      operation: 'parse',
      data: '{invalid json}'
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_JSON');
  });

  test('should detect circular references', async () => {
    const obj = { a: 1 };
    obj.self = obj; // Circular reference

    const result = await execute({
      operation: 'stringify',
      data: obj
    });

    expect(result.success).toBe(true);
    expect(result.data).toContain('[Circular]');
  });

  test('should transform objects', async () => {
    const result = await execute({
      operation: 'transform',
      data: { firstName: 'John', lastName: 'Doe' },
      rules: {
        include: ['firstName']
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe('John');
    expect(result.data.lastName).toBeUndefined();
  });

  test('should filter arrays', async () => {
    const result = await execute({
      operation: 'filter',
      data: [1, 2, 3, 4, 5],
      rules: {
        predicate: 'x > 2'
      }
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([3, 4, 5]);
  });

  test('should merge objects', async () => {
    const result = await execute({
      operation: 'merge',
      data: [
        { a: 1 },
        { b: 2 },
        { a: 10 }  // Override
      ]
    });

    expect(result.success).toBe(true);
    expect(result.data.a).toBe(10);
    expect(result.data.b).toBe(2);
  });

  test('should enforce size limits', async () => {
    const largeJson = JSON.stringify({ data: 'x'.repeat(51 * 1024 * 1024) });

    const result = await execute({
      operation: 'parse',
      data: largeJson
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('SIZE_LIMIT_EXCEEDED');
  });
});
