import { describe, it, expect } from 'vitest';
import { validateSessionId } from '../shared/helpers.js';

describe('validateSessionId', () => {
  it('should accept valid 4-char alphanumeric codes', () => {
    expect(validateSessionId('ABCD')).toBe('ABCD');
    expect(validateSessionId('1234')).toBe('1234');
    expect(validateSessionId('A1B2')).toBe('A1B2');
  });

  it('should uppercase lowercase input', () => {
    expect(validateSessionId('abcd')).toBe('ABCD');
    expect(validateSessionId('aBcD')).toBe('ABCD');
  });

  it('should reject invalid codes', () => {
    expect(validateSessionId('')).toBe(null);
    expect(validateSessionId('ABC')).toBe(null);
    expect(validateSessionId('ABCDE')).toBe(null);
    expect(validateSessionId('AB-D')).toBe(null);
    expect(validateSessionId(undefined)).toBe(null);
  });
});
