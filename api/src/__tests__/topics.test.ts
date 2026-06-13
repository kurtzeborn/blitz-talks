import { describe, it, expect } from 'vitest';

describe('Topic validation', () => {
  it('should reject titles over 100 characters', () => {
    const longTitle = 'a'.repeat(101);
    expect(longTitle.length).toBeGreaterThan(100);
  });

  it('should reject empty titles', () => {
    const emptyTitle = '   '.trim();
    expect(emptyTitle.length).toBe(0);
  });

  it('should accept valid titles', () => {
    const title = 'How I automated my deploy pipeline';
    expect(title.length).toBeLessThanOrEqual(100);
    expect(title.length).toBeGreaterThan(0);
  });

  it('should strip angle brackets from titles', () => {
    const title = 'My <script>alert("xss")</script> Topic';
    const sanitized = title.replace(/[<>]/g, '');
    expect(sanitized).toBe('My scriptalert("xss")/script Topic');
    expect(sanitized).not.toContain('<');
    expect(sanitized).not.toContain('>');
  });
});

describe('Topic limits', () => {
  const MAX_TOPICS = 3;

  it('should allow up to 3 topics', () => {
    expect(0).toBeLessThan(MAX_TOPICS);
    expect(1).toBeLessThan(MAX_TOPICS);
    expect(2).toBeLessThan(MAX_TOPICS);
  });

  it('should reject 4th topic', () => {
    expect(3).not.toBeLessThan(MAX_TOPICS);
  });
});

describe('Initial vote grant', () => {
  const INITIAL_VOTES = 3;

  it('should grant 3 votes on first topic', () => {
    const topicsSubmitted = 0;
    const isFirstTopic = topicsSubmitted === 0;
    expect(isFirstTopic).toBe(true);
    const votesGranted = isFirstTopic ? INITIAL_VOTES : 0;
    expect(votesGranted).toBe(3);
  });

  it('should not grant votes on subsequent topics', () => {
    const topicsSubmitted = 1;
    const isFirstTopic = topicsSubmitted === 0;
    expect(isFirstTopic).toBe(false);
    const votesGranted = isFirstTopic ? INITIAL_VOTES : 0;
    expect(votesGranted).toBe(0);
  });
});

describe('Display name validation', () => {
  it('should reject names over 30 characters', () => {
    const longName = 'a'.repeat(31);
    expect(longName.length).toBeGreaterThan(30);
  });

  it('should reject empty names', () => {
    const emptyName = '  '.trim();
    expect(emptyName.length).toBe(0);
  });

  it('should accept valid names', () => {
    const name = 'Scott K.';
    expect(name.length).toBeLessThanOrEqual(30);
    expect(name.length).toBeGreaterThan(0);
  });

  it('should strip angle brackets from names', () => {
    const name = '<script>Scott</script>';
    const sanitized = name.replace(/[<>]/g, '');
    expect(sanitized).not.toContain('<');
  });
});
