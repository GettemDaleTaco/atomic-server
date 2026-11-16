import * as React from 'react';
import { useMemo, useState } from 'react';
import { styled } from 'styled-components';
import { Main } from '../components/Main';
import { ContainerWide } from '../components/Containers';
import { Button } from '../components/Button';

type TrafficRecord = {
  timestamp: string;
  src: string;
  dst: string;
  protocol: string;
  bytes: number;
  packets: number;
  duration: number;
  interface?: string;
  vpn_tunnel?: string;
};

type Profile = {
  appName: string;
  iconUrl: string;
  networkScope: string;
};

type ParseResult = {
  records: TrafficRecord[];
  error?: string;
};

type PairEntry = {
  pair: string;
  bytes: number;
};

const PROFILE_KEY = 'traffic-flow-profile';
const SAMPLE_DATA: TrafficRecord[] = [
  {
    timestamp: '2026-11-16T03:00:00Z',
    src: 'laptop.local',
    dst: 'vpn-gateway.local',
    protocol: 'udp',
    bytes: 1240000,
    packets: 920,
    duration: 45,
    interface: 'wlan0',
    vpn_tunnel: 'work-vpn',
  },
  {
    timestamp: '2026-11-16T03:01:00Z',
    src: 'vpn-gateway.local',
    dst: 'api.internal',
    protocol: 'tcp',
    bytes: 430000,
    packets: 410,
    duration: 30,
    interface: 'tun0',
    vpn_tunnel: 'work-vpn',
  },
  {
    timestamp: '2026-11-16T03:02:00Z',
    src: 'phone.local',
    dst: 'vpn-gateway.local',
    protocol: 'udp',
    bytes: 760000,
    packets: 530,
    duration: 40,
    interface: 'wlan0',
    vpn_tunnel: 'private-vpn',
  },
];

const DEFAULT_PROFILE: Profile = {
  appName: 'NexusTexas',
  iconUrl: '',
  networkScope: 'Home + VPN',
};

function safeParseRecords(input: string): ParseResult {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { records: [] };
  }

  try {
    const parsed = JSON.parse(trimmed);

    if (!Array.isArray(parsed)) {
      return { records: [], error: 'Input must be a JSON array of records.' };
    }

    const records = parsed.map((entry, index): TrafficRecord => {
      if (typeof entry !== 'object' || entry === null) {
        throw new Error(`Row ${index + 1} must be an object.`);
      }

      const {
        timestamp,
        src,
        dst,
        protocol,
        bytes,
        packets,
        duration,
        interface: networkInterface,
        vpn_tunnel,
      } = entry as Record<string, unknown>;

      const valid =
        typeof timestamp === 'string' &&
        typeof src === 'string' &&
        typeof dst === 'string' &&
        typeof protocol === 'string' &&
        typeof bytes === 'number' &&
        Number.isFinite(bytes) &&
        typeof packets === 'number' &&
        Number.isFinite(packets) &&
        typeof duration === 'number' &&
        Number.isFinite(duration);

      if (!valid) {
        throw new Error(
          `Row ${
            index + 1
          } is invalid. Required fields: timestamp, src, dst, protocol, bytes, packets, duration.`,
        );
      }

      return {
        timestamp,
        src,
        dst,
        protocol,
        bytes,
        packets,
        duration,
        interface:
          typeof networkInterface === 'string' ? networkInterface : undefined,
        vpn_tunnel: typeof vpn_tunnel === 'string' ? vpn_tunnel : undefined,
      };
    });

    return { records };
  } catch (error) {
    const err = error as Error;

    return { records: [], error: err.message };
  }
}

function sumByEndpoint(
  records: TrafficRecord[],
  side: 'src' | 'dst',
): Array<[string, number]> {
  const totals = new Map<string, number>();

  records.forEach(record => {
    const endpoint = record[side];
    const current = totals.get(endpoint) ?? 0;
    totals.set(endpoint, current + record.bytes);
  });

  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

function aggregatePairs(records: TrafficRecord[]): PairEntry[] {
  const totals = new Map<string, number>();

  records.forEach(record => {
    const pair = `${record.src} → ${record.dst}`;
    const current = totals.get(pair) ?? 0;
    totals.set(pair, current + record.bytes);
  });

  return [...totals.entries()]
    .map(([pair, bytes]) => ({ pair, bytes }))
    .sort((a, b) => b.bytes - a.bytes);
}

function totalValue(
  records: TrafficRecord[],
  key: 'bytes' | 'packets',
): number {
  return records.reduce((total, record) => total + record[key], 0);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(0)}s`;
  }

  return `${(seconds / 60).toFixed(1)}m`;
}

function loadProfile(): Profile {
  const stored = localStorage.getItem(PROFILE_KEY);

  if (!stored) {
    return DEFAULT_PROFILE;
  }

  try {
    const parsed = JSON.parse(stored) as Profile;

    return {
      appName:
        typeof parsed.appName === 'string'
          ? parsed.appName
          : DEFAULT_PROFILE.appName,
      iconUrl:
        typeof parsed.iconUrl === 'string'
          ? parsed.iconUrl
          : DEFAULT_PROFILE.iconUrl,
      networkScope:
        typeof parsed.networkScope === 'string'
          ? parsed.networkScope
          : DEFAULT_PROFILE.networkScope,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function TrafficFlowRoute(): JSX.Element {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [input, setInput] = useState<string>(
    JSON.stringify(SAMPLE_DATA, null, 2),
  );
  const parseResult = useMemo(() => safeParseRecords(input), [input]);
  const records = parseResult.records;

  const topSources = useMemo(
    () => sumByEndpoint(records, 'src').slice(0, 5),
    [records],
  );
  const topDestinations = useMemo(
    () => sumByEndpoint(records, 'dst').slice(0, 5),
    [records],
  );
  const topFlows = useMemo(
    () => aggregatePairs(records).slice(0, 8),
    [records],
  );
  const totalBytes = useMemo(() => totalValue(records, 'bytes'), [records]);
  const totalPackets = useMemo(() => totalValue(records, 'packets'), [records]);
  const totalDuration = useMemo(
    () => records.reduce((total, record) => total + record.duration, 0),
    [records],
  );

  const handleProfileChange = (key: keyof Profile, value: string) => {
    const nextProfile = {
      ...profile,
      [key]: value,
    };

    setProfile(nextProfile);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
  };

  return (
    <Main>
      <ContainerWide>
        <Header>
          {profile.iconUrl ? (
            <Icon src={profile.iconUrl} alt='App icon' />
          ) : (
            <IconPlaceholder>Icon</IconPlaceholder>
          )}
          <div>
            <h1>{profile.appName}</h1>
            <p>
              Private network scope: <strong>{profile.networkScope}</strong>
            </p>
          </div>
        </Header>
        <Card>
          <h2>Personalization</h2>
          <Grid>
            <Field>
              <Label>App Name</Label>
              <Input
                value={profile.appName}
                onChange={event =>
                  handleProfileChange('appName', event.target.value)
                }
              />
            </Field>
            <Field>
              <Label>Icon URL</Label>
              <Input
                value={profile.iconUrl}
                placeholder='https://...'
                onChange={event =>
                  handleProfileChange('iconUrl', event.target.value)
                }
              />
            </Field>
            <Field>
              <Label>Network Scope</Label>
              <Input
                value={profile.networkScope}
                onChange={event =>
                  handleProfileChange('networkScope', event.target.value)
                }
              />
            </Field>
          </Grid>
        </Card>
        <Card>
          <Row>
            <h2>Flow Input (local only)</h2>
            <Button
              onClick={() => setInput(JSON.stringify(SAMPLE_DATA, null, 2))}
              title='Load sample records'
            >
              Load Sample
            </Button>
          </Row>
          <p>
            Provide a JSON array of records containing: timestamp, src, dst,
            protocol, bytes, packets, duration, interface, vpn_tunnel.
          </p>
          <TextArea
            spellCheck={false}
            value={input}
            onChange={event => setInput(event.target.value)}
          />
          {parseResult.error && <ErrorText>{parseResult.error}</ErrorText>}
        </Card>
        <Grid>
          <Card>
            <h2>Overview</h2>
            <MetricList>
              <li>Records: {records.length}</li>
              <li>Total traffic: {formatBytes(totalBytes)}</li>
              <li>Total packets: {totalPackets.toLocaleString()}</li>
              <li>Total duration: {formatDuration(totalDuration)}</li>
            </MetricList>
          </Card>
          <Card>
            <h2>Top Source Nodes</h2>
            <MetricList>
              {topSources.map(([node, bytes]) => (
                <li key={node}>
                  {node}: {formatBytes(bytes)}
                </li>
              ))}
            </MetricList>
          </Card>
          <Card>
            <h2>Top Destination Nodes</h2>
            <MetricList>
              {topDestinations.map(([node, bytes]) => (
                <li key={node}>
                  {node}: {formatBytes(bytes)}
                </li>
              ))}
            </MetricList>
          </Card>
        </Grid>
        <Card>
          <h2>Traffic Flow Map (edge ranking)</h2>
          <TableWrapper>
            <Table>
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Traffic</th>
                </tr>
              </thead>
              <tbody>
                {topFlows.map(flow => (
                  <tr key={flow.pair}>
                    <td>{flow.pair}</td>
                    <td>{formatBytes(flow.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrapper>
        </Card>
      </ContainerWide>
    </Main>
  );
}

const Header = styled.section`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
`;

const Card = styled.section`
  border: 1px solid ${props => props.theme.colors.bg2};
  border-radius: ${props => props.theme.radius};
  padding: 1rem;
  margin-bottom: 1rem;
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`;

const Label = styled.span`
  font-weight: 600;
`;

const Input = styled.input`
  border: 1px solid ${props => props.theme.colors.bg2};
  background: ${props => props.theme.colors.bg};
  border-radius: ${props => props.theme.radius};
  color: ${props => props.theme.colors.main};
  padding: 0.5rem 0.75rem;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 12rem;
  border: 1px solid ${props => props.theme.colors.bg2};
  background: ${props => props.theme.colors.bg};
  border-radius: ${props => props.theme.radius};
  color: ${props => props.theme.colors.main};
  padding: 0.75rem;
  font-family: monospace;
  font-size: 0.9rem;
`;

const ErrorText = styled.p`
  color: ${props => props.theme.colors.red};
  margin-bottom: 0;
`;

const MetricList = styled.ul`
  margin: 0;
`;

const TableWrapper = styled.div`
  overflow: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    text-align: left;
    padding: 0.5rem;
    border-bottom: 1px solid ${props => props.theme.colors.bg2};
  }
`;

const Icon = styled.img`
  width: 3rem;
  height: 3rem;
  border-radius: 0.75rem;
  object-fit: cover;
  border: 1px solid ${props => props.theme.colors.bg2};
`;

const IconPlaceholder = styled.div`
  width: 3rem;
  height: 3rem;
  border-radius: 0.75rem;
  border: 1px dashed ${props => props.theme.colors.bg2};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
`;
