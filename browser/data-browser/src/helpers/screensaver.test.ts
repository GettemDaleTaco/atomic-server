import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCREENSAVER_CONFIG,
  formatBytes,
  formatUptime,
  parseScreensaverConfig,
} from './screensaver';

describe('screensaver helpers', () => {
  it('returns defaults for null or malformed JSON', () => {
    expect(parseScreensaverConfig(null)).toEqual(DEFAULT_SCREENSAVER_CONFIG);
    expect(parseScreensaverConfig('not-json')).toEqual(
      DEFAULT_SCREENSAVER_CONFIG,
    );
  });

  it('clamps invalid intervals and preserves valid overrides', () => {
    const parsed = parseScreensaverConfig(
      JSON.stringify({
        enabled: true,
        idleTimeoutSeconds: 2,
        refreshIntervalSeconds: 1,
        pixelShift: false,
        use24HourClock: true,
        syncWithDrive: false,
      }),
    );

    expect(parsed).toEqual({
      enabled: true,
      idleTimeoutSeconds: DEFAULT_SCREENSAVER_CONFIG.idleTimeoutSeconds,
      refreshIntervalSeconds:
        DEFAULT_SCREENSAVER_CONFIG.refreshIntervalSeconds,
      pixelShift: false,
      use24HourClock: true,
      syncWithDrive: false,
    });
  });

  it('formats bytes cleanly', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024 * 512)).toBe('512 MB');
  });

  it('formats uptime cleanly', () => {
    expect(formatUptime(42)).toBe('42s');
    expect(formatUptime(125)).toBe('2m 5s');
    expect(formatUptime(3665)).toBe('1h 1m');
    expect(formatUptime(90061)).toBe('1d 1h 1m');
  });
});
