import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { styled } from 'styled-components';
import {
  FaArrowLeft,
  FaClock,
  FaDatabase,
  FaMicrochip,
  FaNetworkWired,
  FaServer,
  FaTv,
} from 'react-icons/fa6';
import { appRoute } from './RootRoutes';
import { pathNames } from './paths';
import { useSettings } from '../helpers/AppSettings';
import {
  fetchSystemAnalytics,
  formatBytes,
  formatUptime,
  wakeAndroidDream,
  type SystemAnalyticsData,
} from '../helpers/screensaver';
import { useScreensaverConfig } from '../helpers/useScreensaverConfig';

export const ScreensaverRoute = createRoute({
  path: pathNames.screensaver,
  component: () => <ScreensaverPage />,
  getParentRoute: () => appRoute,
});

const PIXEL_OFFSETS = [
  { x: 0, y: 0 },
  { x: 6, y: 4 },
  { x: -5, y: 6 },
  { x: -6, y: -4 },
  { x: 4, y: -6 },
];

export function ScreensaverPage(): JSX.Element {
  const navigate = useNavigate();
  const { baseURL, drive, agent } = useSettings();
  const { config } = useScreensaverConfig();

  const searchParams = useMemo(
    () =>
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams(),
    [],
  );

  const isDreamMode = searchParams.get('dream') === '1';
  const effectiveDrive = searchParams.get('drive') || drive;

  const [now, setNow] = useState(() => new Date());
  const [analytics, setAnalytics] = useState<SystemAnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shiftIndex, setShiftIndex] = useState(0);

  // Live clock tick (1s).
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(id);
  }, []);

  // Subtle OLED / TV burn-in pixel shift every 60s.
  useEffect(() => {
    if (!config.pixelShift) {
      setShiftIndex(0);

      return;
    }

    const id = window.setInterval(() => {
      setShiftIndex(prev => (prev + 1) % PIXEL_OFFSETS.length);
    }, 60_000);

    return () => window.clearInterval(id);
  }, [config.pixelShift]);

  // Poll /system-analytics on configured refresh interval.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await fetchSystemAnalytics(
          baseURL,
          effectiveDrive || undefined,
          agent,
        );

        if (!cancelled) {
          setAnalytics(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Unable to reach server',
          );
        }
      }
    };

    void load();
    const intervalMs = Math.max(2, config.refreshIntervalSeconds) * 1000;
    const id = window.setInterval(() => void load(), intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [baseURL, effectiveDrive, agent, config.refreshIntervalSeconds]);

  const exitScreensaver = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate({ to: '/' });
    }
  }, [navigate]);

  // Wake on any user interaction (mousemove, mousedown, keydown, touchstart,
  // wheel) when not hosted inside Fire OS DreamService. A short grace period
  // prevents the click/keystroke that opened the route from immediately waking.
  useEffect(() => {
    if (isDreamMode) return;

    let armed = false;
    const armTimer = window.setTimeout(() => {
      armed = true;
    }, 500);

    const onWake = () => {
      if (!armed) return;
      exitScreensaver();
    };

    const events = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'wheel',
    ] as const;

    for (const event of events) {
      window.addEventListener(event, onWake, { passive: true });
    }

    return () => {
      window.clearTimeout(armTimer);
      for (const event of events) {
        window.removeEventListener(event, onWake);
      }
    };
  }, [isDreamMode, exitScreensaver]);

  // Remote / Drive-synced wake signal: if wakeRequestedAt advances while the
  // screensaver is open, wake the Fire OS DreamService or exit the route.
  const initialWakeRef = useRef(config.wakeRequestedAt ?? 0);
  useEffect(() => {
    const requested = config.wakeRequestedAt ?? 0;
    if (requested > initialWakeRef.current) {
      initialWakeRef.current = requested;
      if (isDreamMode) {
        wakeAndroidDream();
      } else {
        exitScreensaver();
      }
    }
  }, [config.wakeRequestedAt, isDreamMode, exitScreensaver]);

  const shift = PIXEL_OFFSETS[shiftIndex];
  const timeString = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !config.use24HourClock,
  });
  const dateString = now.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const memTotal = analytics?.host.memoryTotalBytes ?? null;
  const memUsed = analytics?.host.memoryUsedBytes ?? null;
  const memPercent =
    memTotal && memUsed ? Math.round((memUsed / memTotal) * 100) : null;

  return (
    <Backdrop data-testid='screensaver-dashboard'>
      <Stage
        style={{
          transform: `translate3d(${shift.x}px, ${shift.y}px, 0)`,
        }}
      >
        <TopBar>
          <ClockBlock>
            <TimeText>{timeString}</TimeText>
            <DateText>{dateString}</DateText>
          </ClockBlock>

          <StatusCluster>
            <StatusPill $ok={!error}>
              <FaTv />
              <span>{isDreamMode ? 'Fire OS DreamService' : 'Idle Dash'}</span>
            </StatusPill>
            {!isDreamMode && (
              <ExitButton type='button' onClick={exitScreensaver}>
                <FaArrowLeft />
                <span>Exit</span>
              </ExitButton>
            )}
          </StatusCluster>
        </TopBar>

        {error && (
          <ErrorBanner>
            Waiting for Atomic Server ({baseURL}): {error}
          </ErrorBanner>
        )}

        <Grid>
          <DashCard>
            <CardHeader>
              <FaServer />
              <span>Server & Uptime</span>
            </CardHeader>
            <BigMetric>{formatUptime(analytics?.uptimeSeconds)}</BigMetric>
            <SubRow>
              <span>Version</span>
              <strong>{analytics?.version ?? '—'}</strong>
            </SubRow>
            <SubRow>
              <span>Active WebSockets</span>
              <strong>{analytics?.metrics.wsConnectionsActive ?? '—'}</strong>
            </SubRow>
          </DashCard>

          <DashCard>
            <CardHeader>
              <FaMicrochip />
              <span>Host CPU & Memory</span>
            </CardHeader>
            <BigMetric>
              {analytics?.host.loadAvg1m != null
                ? `${analytics.host.loadAvg1m.toFixed(2)} load`
                : '—'}
            </BigMetric>
            <SubRow>
              <span>Load (5m / 15m)</span>
              <strong>
                {analytics?.host.loadAvg5m != null &&
                analytics?.host.loadAvg15m != null
                  ? `${analytics.host.loadAvg5m.toFixed(2)} / ${analytics.host.loadAvg15m.toFixed(2)}`
                  : '—'}
              </strong>
            </SubRow>
            <SubRow>
              <span>Memory</span>
              <strong>
                {memPercent != null
                  ? `${memPercent}% (${formatBytes(memUsed)} / ${formatBytes(memTotal)})`
                  : '—'}
              </strong>
            </SubRow>
            {memPercent != null && (
              <ProgressTrack>
                <ProgressFill style={{ width: `${Math.min(100, memPercent)}%` }} />
              </ProgressTrack>
            )}
          </DashCard>

          <DashCard>
            <CardHeader>
              <FaClock />
              <span>Activity Counters</span>
            </CardHeader>
            <BigMetric>
              {analytics?.metrics.commitsApplied.toLocaleString() ?? '—'} commits
            </BigMetric>
            <SubRow>
              <span>HTTP Resource Fetches</span>
              <strong>
                {analytics?.metrics.resourcesFetchedHttp.toLocaleString() ?? '—'}
              </strong>
            </SubRow>
            <SubRow>
              <span>Search Queries</span>
              <strong>
                {analytics?.metrics.searchQueries.toLocaleString() ?? '—'}
              </strong>
            </SubRow>
          </DashCard>

          <DashCard>
            <CardHeader>
              <FaDatabase />
              <span>Drive Storage</span>
            </CardHeader>
            <BigMetric>
              {analytics?.driveUsage
                ? `${analytics.driveUsage.resourceCount.toLocaleString()} resources`
                : 'No drive selected'}
            </BigMetric>
            <SubRow>
              <span>Loro CRDT Snapshots</span>
              <strong>
                {formatBytes(analytics?.driveUsage?.loroBytes)}
              </strong>
            </SubRow>
            <SubRow>
              <span>Blob Storage</span>
              <strong>
                {formatBytes(analytics?.driveUsage?.blobBytes)}
              </strong>
            </SubRow>
          </DashCard>

          <WideCard>
            <CardHeader>
              <FaNetworkWired />
              <span>
                Fire TV & Iroh P2P Sync ({analytics?.livePeerCount ?? 0} live /{' '}
                {analytics?.knownPeerCount ?? 0} known)
              </span>
            </CardHeader>
            {analytics && analytics.peers.length > 0 ? (
              <PeerList>
                {analytics.peers.map(peer => (
                  <PeerChip key={peer.nodeId} $live={peer.live}>
                    <Dot $live={peer.live} />
                    <span>{peer.deviceName ?? peer.nodeId.slice(0, 24)}</span>
                  </PeerChip>
                ))}
              </PeerList>
            ) : (
              <MutedText>
                {analytics?.nodeId
                  ? `Node ${analytics.nodeId.slice(0, 28)}… ready for peer sync`
                  : 'P2P transport inactive on this node'}
              </MutedText>
            )}
          </WideCard>
        </Grid>
      </Stage>
    </Backdrop>
  );
}

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: radial-gradient(circle at 20% 20%, #131b2e 0%, #0b0e14 70%);
  color: #e6edf3;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(1.5rem, 4vw, 4rem);
  overflow: auto;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
    sans-serif;
`;

const Stage = styled.div`
  width: min(1200px, 100%);
  display: flex;
  flex-direction: column;
  gap: 2rem;
  transition: transform 1.2s ease-in-out;
`;

const TopBar = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 1.5rem;
`;

const ClockBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const TimeText = styled.div`
  font-size: clamp(3rem, 7vw, 5.5rem);
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.02em;
`;

const DateText = styled.div`
  font-size: clamp(1rem, 2vw, 1.4rem);
  color: #8b949e;
`;

const StatusCluster = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const StatusPill = styled.div<{ $ok: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.9rem;
  border-radius: 999px;
  font-size: 0.9rem;
  background: ${p =>
    p.$ok ? 'rgba(46, 160, 67, 0.16)' : 'rgba(248, 81, 73, 0.18)'};
  color: ${p => (p.$ok ? '#56d364' : '#ff7b72')};
  border: 1px solid
    ${p => (p.$ok ? 'rgba(46, 160, 67, 0.35)' : 'rgba(248, 81, 73, 0.35)')};
`;

const ExitButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 0.9rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #e6edf3;
  cursor: pointer;
  font-size: 0.9rem;
  &:hover,
  &:focus-visible {
    background: rgba(255, 255, 255, 0.16);
  }
`;

const ErrorBanner = styled.div`
  padding: 0.75rem 1rem;
  border-radius: 10px;
  background: rgba(248, 81, 73, 0.14);
  border: 1px solid rgba(248, 81, 73, 0.35);
  color: #ffa198;
  font-size: 0.95rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.25rem;
`;

const DashCard = styled.section`
  background: rgba(22, 27, 34, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 16px;
  padding: 1.25rem 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
`;

const WideCard = styled(DashCard)`
  grid-column: 1 / -1;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: #8b949e;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const BigMetric = styled.div`
  font-size: 1.75rem;
  font-weight: 600;
  color: #f0f6fc;
  margin-bottom: 0.25rem;
`;

const SubRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.92rem;
  color: #8b949e;
  strong {
    color: #e6edf3;
    font-weight: 500;
  }
`;

const ProgressTrack = styled.div`
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
  margin-top: 0.25rem;
`;

const ProgressFill = styled.div`
  height: 100%;
  background: linear-gradient(90deg, #388bfd, #56d364);
  border-radius: 999px;
  transition: width 0.4s ease;
`;

const PeerList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
`;

const PeerChip = styled.div<{ $live: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid
    ${p => (p.$live ? 'rgba(86, 211, 100, 0.35)' : 'rgba(255, 255, 255, 0.1)')};
  font-size: 0.9rem;
`;

const Dot = styled.span<{ $live: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${p => (p.$live ? '#56d364' : '#6e7681')};
`;

const MutedText = styled.div`
  color: #8b949e;
  font-size: 0.95rem;
`;
