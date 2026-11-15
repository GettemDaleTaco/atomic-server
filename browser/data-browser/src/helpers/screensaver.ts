import { signRequest, type Agent } from '@tomic/react';

export interface ScreensaverConfig {
  enabled: boolean;
  idleTimeoutSeconds: number;
  refreshIntervalSeconds: number;
  pixelShift: boolean;
  use24HourClock: boolean;
  syncWithDrive: boolean;
}

export const DEFAULT_SCREENSAVER_CONFIG: ScreensaverConfig = {
  enabled: false,
  idleTimeoutSeconds: 300,
  refreshIntervalSeconds: 5,
  pixelShift: true,
  use24HourClock: false,
  syncWithDrive: true,
};

export const SCREENSAVER_CONFIG_STORAGE_KEY = 'atomic.screensaver.config';
const SCREENSAVER_CONFIG_EVENT = 'atomic-screensaver-config-changed';

export interface HostSystemStats {
  loadAvg1m: number | null;
  loadAvg5m: number | null;
  loadAvg15m: number | null;
  memoryTotalBytes: number | null;
  memoryAvailableBytes: number | null;
  memoryUsedBytes: number | null;
}

export interface MetricsSnapshot {
  commitsApplied: number;
  resourcesFetchedHttp: number;
  searchQueries: number;
  drivesCreated: number;
  wsConnectionsActive: number;
}

export interface PeerAnalytics {
  nodeId: string;
  deviceName: string | null;
  live: boolean;
}

export interface DriveAnalytics {
  subject: string;
  name: string | null;
  resourceCount: number;
  blobBytes: number;
  loroBytes: number;
}

export interface SystemAnalyticsData {
  version: string;
  nodeId: string | null;
  uptimeSeconds: number;
  timestampMs: number;
  metrics: MetricsSnapshot;
  host: HostSystemStats;
  peers: PeerAnalytics[];
  livePeerCount: number;
  knownPeerCount: number;
  driveUsage: DriveAnalytics | null;
}

declare global {
  interface Window {
    AtomicDreamBridge?: {
      syncConfig: (serverUrl: string, drive: string, configJson: string) => void;
    };
  }
}

export function parseScreensaverConfig(raw: string | null): ScreensaverConfig {
  if (!raw) return DEFAULT_SCREENSAVER_CONFIG;

  try {
    const parsed = JSON.parse(raw) as Partial<ScreensaverConfig>;

    return {
      enabled:
        typeof parsed.enabled === 'boolean'
          ? parsed.enabled
          : DEFAULT_SCREENSAVER_CONFIG.enabled,
      idleTimeoutSeconds:
        typeof parsed.idleTimeoutSeconds === 'number' &&
        parsed.idleTimeoutSeconds >= 10
          ? parsed.idleTimeoutSeconds
          : DEFAULT_SCREENSAVER_CONFIG.idleTimeoutSeconds,
      refreshIntervalSeconds:
        typeof parsed.refreshIntervalSeconds === 'number' &&
        parsed.refreshIntervalSeconds >= 2
          ? parsed.refreshIntervalSeconds
          : DEFAULT_SCREENSAVER_CONFIG.refreshIntervalSeconds,
      pixelShift:
        typeof parsed.pixelShift === 'boolean'
          ? parsed.pixelShift
          : DEFAULT_SCREENSAVER_CONFIG.pixelShift,
      use24HourClock:
        typeof parsed.use24HourClock === 'boolean'
          ? parsed.use24HourClock
          : DEFAULT_SCREENSAVER_CONFIG.use24HourClock,
      syncWithDrive:
        typeof parsed.syncWithDrive === 'boolean'
          ? parsed.syncWithDrive
          : DEFAULT_SCREENSAVER_CONFIG.syncWithDrive,
    };
  } catch {
    return DEFAULT_SCREENSAVER_CONFIG;
  }
}

export function loadScreensaverConfig(): ScreensaverConfig {
  if (typeof window === 'undefined') return DEFAULT_SCREENSAVER_CONFIG;

  return parseScreensaverConfig(
    window.localStorage.getItem(SCREENSAVER_CONFIG_STORAGE_KEY),
  );
}

export function saveScreensaverConfig(config: ScreensaverConfig): void {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(
    SCREENSAVER_CONFIG_STORAGE_KEY,
    JSON.stringify(config),
  );
  window.dispatchEvent(
    new CustomEvent<ScreensaverConfig>(SCREENSAVER_CONFIG_EVENT, {
      detail: config,
    }),
  );
}

export function subscribeScreensaverConfig(
  onChange: (config: ScreensaverConfig) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const onCustom = (ev: Event) => {
    const detail = (ev as CustomEvent<ScreensaverConfig>).detail;
    onChange(detail ?? loadScreensaverConfig());
  };

  const onStorage = (ev: StorageEvent) => {
    if (ev.key === SCREENSAVER_CONFIG_STORAGE_KEY) {
      onChange(parseScreensaverConfig(ev.newValue));
    }
  };

  window.addEventListener(SCREENSAVER_CONFIG_EVENT, onCustom);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(SCREENSAVER_CONFIG_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Forward server URL, active drive, and screensaver config to the Fire OS /
 * Android TV DreamService via the `@JavascriptInterface` bridge when running
 * inside the Tauri Android shell.
 */
export function syncToAndroidDreamBridge(
  serverUrl: string,
  drive: string,
  config: ScreensaverConfig,
): void {
  if (typeof window === 'undefined') return;

  try {
    window.AtomicDreamBridge?.syncConfig(
      serverUrl,
      drive,
      JSON.stringify(config),
    );
  } catch {
    // Non-Android / browser environment — no-op.
  }
}

export async function fetchSystemAnalytics(
  serverUrl: string,
  drive?: string,
  agent?: Agent,
): Promise<SystemAnalyticsData> {
  const url = new URL('/system-analytics', serverUrl);

  if (drive) {
    url.searchParams.set('subject', drive);
  }

  const target = url.toString();
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (agent) {
    const authHeaders = await signRequest(target, agent, headers);
    Object.assign(headers, authHeaders);
  }

  const res = await fetch(target, { headers });

  if (!res.ok) {
    throw new Error(`System analytics request failed (${res.status})`);
  }

  return (await res.json()) as SystemAnalyticsData;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exp;

  return `${value >= 100 || exp === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exp]}`;
}

export function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';

  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;

  return `${secs}s`;
}
