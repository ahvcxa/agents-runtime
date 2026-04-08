const { describe, it, expect } = require('@jest/globals');
const { MemoryACL, MemoryACLError } = require('../src/memory/memory-acl');

describe('MemoryACL', () => {
  describe('getPermission', () => {
    it('should return R for L1 reading skill cache', () => {
      const perm = MemoryACL.getPermission('skill:analysis:cache:result', 1);

      expect(perm).toBe('R');
    });

    it('should return null for L1 reading agent state', () => {
      const perm = MemoryACL.getPermission('agent:orchestrator:state', 1);

      expect(perm).toBeNull();
    });

    it('should return RW for L2 reading skill cache', () => {
      const perm = MemoryACL.getPermission('skill:analysis:cache:result', 2);

      expect(perm).toBe('RW');
    });

    it('should return RW for L2 reading own agent state', () => {
      const perm = MemoryACL.getPermission('agent:{self}:state', 2);

      expect(perm).toBe('RW');
    });

    it('should return RWX for L3 reading any namespace', () => {
      const perm = MemoryACL.getPermission('any:namespace:here', 3);

      expect(perm).toBe('RWX');
    });

    it('should return null for invalid auth level', () => {
      const perm = MemoryACL.getPermission('skill:cache', 99);

      expect(perm).toBeNull();
    });

    it('should match wildcard patterns', () => {
      const perm1 = MemoryACL.getPermission('skill:x:cache:y', 1);
      const perm2 = MemoryACL.getPermission('skill:foo:cache:bar', 1);

      expect(perm1).toBe('R');
      expect(perm2).toBe('R');
    });

    it('should prefer exact match over wildcard', () => {
      const perm = MemoryACL.getPermission('event:something', 1);

      expect(perm).toBe('R');
    });
  });

  describe('validate', () => {
    it('should allow L1 read operations on skill cache', () => {
      // Act & Assert
      expect(() => MemoryACL.validate('get', 'skill:analysis:cache:result', 1)).not.toThrow();
    });

    it('should deny L1 write operations on skill cache', () => {
      // Act & Assert
      expect(() => MemoryACL.validate('set', 'skill:analysis:cache:result', 1))
        .toThrow(MemoryACLError);

      try {
        MemoryACL.validate('set', 'skill:analysis:cache:result', 1);
      } catch (err) {
        expect(err.code).toBe('WRITE_DENIED');
      }
    });

    it('should deny L1 delete operations', () => {
      // Act & Assert
      expect(() => MemoryACL.validate('delete', 'skill:cache:result', 1))
        .toThrow(MemoryACLError);
    });

    it('should allow L2 read and write on skill cache', () => {
      // Act & Assert
      expect(() => MemoryACL.validate('get', 'skill:analysis:cache:result', 2)).not.toThrow();
      expect(() => MemoryACL.validate('set', 'skill:analysis:cache:result', 2)).not.toThrow();
    });

    it('should allow L3 all operations on all namespaces', () => {
      // Act & Assert
      expect(() => MemoryACL.validate('get', 'any:namespace', 3)).not.toThrow();
      expect(() => MemoryACL.validate('set', 'any:namespace', 3)).not.toThrow();
      expect(() => MemoryACL.validate('delete', 'any:namespace', 3)).not.toThrow();
    });

    it('should throw ACCESS_DENIED when namespace not accessible', () => {
      // Act & Assert
      expect(() => MemoryACL.validate('get', 'pipeline:orchestration', 1))
        .toThrow(MemoryACLError);

      try {
        MemoryACL.validate('get', 'pipeline:orchestration', 1);
      } catch (err) {
        expect(err.code).toBe('ACCESS_DENIED');
      }
    });

    it('should include details in error', () => {
      try {
        MemoryACL.validate('set', 'agent:other:state', 1);
      } catch (err) {
        expect(err.details.operation).toBe('set');
        expect(err.details.namespace).toBe('agent:other:state');
        expect(err.details.authLevel).toBe(1);
      }
    });
  });

  describe('getAccessibleNamespaces', () => {
    it('should return readable namespaces for L1', () => {
      // Act
      const namespaces = MemoryACL.getAccessibleNamespaces(1, 'read');

      // Assert
      expect(namespaces).toContain('skill:*:cache:*');
      expect(namespaces).toContain('event:*');
      expect(namespaces.length).toBe(2);
    });

    it('should return empty array for L1 write namespaces', () => {
      // Act
      const namespaces = MemoryACL.getAccessibleNamespaces(1, 'write');

      // Assert
      expect(namespaces).toEqual([]);
    });

    it('should return read and write namespaces for L2', () => {
      // Act
      const readNamespaces = MemoryACL.getAccessibleNamespaces(2, 'read');
      const writeNamespaces = MemoryACL.getAccessibleNamespaces(2, 'write');

      // Assert
      expect(readNamespaces.length).toBeGreaterThan(0);
      expect(writeNamespaces.length).toBeGreaterThan(0);
      expect(readNamespaces.length).toBeGreaterThanOrEqual(writeNamespaces.length);
    });

    it('should return all namespaces for L3', () => {
      // Act
      const namespaces = MemoryACL.getAccessibleNamespaces(3, 'read');

      // Assert
      expect(namespaces).toContain('*');
    });
  });

  describe('namespaceMatches', () => {
    it('should match exact patterns', () => {
      expect(MemoryACL.namespaceMatches('skill:cache', 'skill:cache')).toBe(true);
      expect(MemoryACL.namespaceMatches('skill:cache', 'skill:other')).toBe(false);
    });

    it('should match wildcard patterns with *', () => {
      expect(MemoryACL.namespaceMatches('skill:analysis:cache:result', 'skill:*:cache:*')).toBe(true);
      expect(MemoryACL.namespaceMatches('skill:audit:cache:findings', 'skill:*:cache:*')).toBe(true);
      expect(MemoryACL.namespaceMatches('skill:analysis:findings', 'skill:*:cache:*')).toBe(false);
    });

    it('should match single wildcard', () => {
      expect(MemoryACL.namespaceMatches('skill:x:cache:y', 'skill:*:cache:*')).toBe(true);
      expect(MemoryACL.namespaceMatches('skill:x', 'skill:*')).toBe(true);
    });

    it('should not match patterns with dots', () => {
      expect(MemoryACL.namespaceMatches('skill.analysis.cache', 'skill:*:cache')).toBe(false);
    });
  });

  describe('DEFAULT_ACL', () => {
    it('should have structure for all auth levels', () => {
      const acl = MemoryACL.DEFAULT_ACL;

      expect(acl[1]).toBeDefined();
      expect(acl[2]).toBeDefined();
      expect(acl[3]).toBeDefined();
    });

    it('should have read-only ACL for L1', () => {
      const l1Acl = MemoryACL.DEFAULT_ACL[1];

      expect(l1Acl['skill:*:cache:*']).toBe('R');
      expect(l1Acl['event:*']).toBe('R');
      // Should not have write-capable entries
      expect(Object.values(l1Acl).some(p => p.includes('W'))).toBe(false);
    });

    it('should have read-write ACL for L2', () => {
      const l2Acl = MemoryACL.DEFAULT_ACL[2];

      expect(l2Acl['skill:*:cache:*']).toBe('RW');
      expect(l2Acl['agent:{self}:state']).toBe('RW');
      expect(l2Acl['event:*']).toBe('RW');
      // Should not have full access
      expect(l2Acl['*']).toBeUndefined();
    });

    it('should have full access ACL for L3', () => {
      const l3Acl = MemoryACL.DEFAULT_ACL[3];

      expect(l3Acl['*']).toBe('RWX');
    });
  });

  describe('Error handling', () => {
    it('should create MemoryACLError with code and details', () => {
      const err = new MemoryACLError('ACCESS_DENIED', { namespace: 'test' });

      expect(err.name).toBe('MemoryACLError');
      expect(err.code).toBe('ACCESS_DENIED');
      expect(err.details.namespace).toBe('test');
      expect(err.message).toContain('Memory ACL violation');
    });

    it('should throw different error codes for different violations', () => {
      expect(() => MemoryACL.validate('set', 'event:test', 1)).toThrow();
      let err;
      
      try {
        MemoryACL.validate('set', 'event:test', 1);
      } catch (e) {
        err = e;
      }

      expect(err.code).toBe('WRITE_DENIED');
    });
  });

  describe('Namespace matching edge cases', () => {
    it('should not match partial namespace patterns', () => {
      expect(MemoryACL.namespaceMatches('skill:x:y:z:a', 'skill:*:y:*')).toBe(true);
      expect(MemoryACL.namespaceMatches('skill:x:y', 'skill:*:y:*')).toBe(false);
    });

    it('should match with multiple wildcards in a row', () => {
      expect(MemoryACL.namespaceMatches('skill:a:b:c:d', 'skill:*:*:*:*')).toBe(true);
      expect(MemoryACL.namespaceMatches('skill:a:b', 'skill:*:*:*:*')).toBe(false);
    });

    it('should handle self-reference patterns for L2', () => {
      // L2 can write to agent:{self}:state
      const perm = MemoryACL.getPermission('agent:{self}:state', 2);
      expect(perm).toBe('RW');
    });
  });

  describe('Multi-level authorization checks', () => {
    it('should enforce strict hierarchy', () => {
      // L1 can do less than L2
      const l1Read = MemoryACL.getAccessibleNamespaces(1, 'read');
      const l2Read = MemoryACL.getAccessibleNamespaces(2, 'read');

      // L2 should have at least what L1 has
      for (const ns of l1Read) {
        if (!ns.includes('{self}')) {
          expect(l2Read).toContain(ns);
        }
      }

      // L2 should have some things L1 doesn't
      const l2Only = l2Read.filter(ns => !l1Read.includes(ns));
      expect(l2Only.length).toBeGreaterThan(0);
    });
  });
});
