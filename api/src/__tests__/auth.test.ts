import { describe, it, expect } from 'vitest';
import { formatDisplayName } from '../shared/auth.js';

describe('formatDisplayName', () => {
  it('should format "Scott Kurtzeborn" as "Scott K."', () => {
    expect(formatDisplayName('Scott Kurtzeborn')).toBe('Scott K.');
  });

  it('should format "John Michael Smith" as "John S."', () => {
    expect(formatDisplayName('John Michael Smith')).toBe('John S.');
  });

  it('should return single name as-is', () => {
    expect(formatDisplayName('Madonna')).toBe('Madonna');
  });

  it('should handle empty string', () => {
    expect(formatDisplayName('')).toBe('');
  });

  it('should handle extra whitespace', () => {
    expect(formatDisplayName('  Jane   Doe  ')).toBe('Jane D.');
  });
});
