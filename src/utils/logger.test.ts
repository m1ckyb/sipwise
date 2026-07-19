import { describe, it, expect, vi } from 'vitest';
import { logger } from './logger';

describe('Logger Utility Tests', () => {
  it('should format info log payloads correctly', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('Test info message', { userId: '123' });
    expect(consoleSpy).toHaveBeenCalled();
    const logArg = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(logArg);
    expect(parsed.message).toBe('Test info message');
    expect(parsed.level).toBe('info');
    expect(parsed.context?.userId).toBe('123');
    consoleSpy.mockRestore();
  });

  it('should format error log payloads correctly', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('Test error message', { code: 500 });
    expect(consoleSpy).toHaveBeenCalled();
    const logArg = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(logArg);
    expect(parsed.message).toBe('Test error message');
    expect(parsed.level).toBe('error');
    expect(parsed.context?.code).toBe(500);
    consoleSpy.mockRestore();
  });
});
