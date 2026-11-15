import { useCallback, useEffect, useState } from 'react';
import {
  core,
  dataBrowser,
  useCollection,
  useResource,
  useStore,
  useString,
} from '@tomic/react';
import { useSettings } from './AppSettings';
import {
  loadScreensaverConfig,
  parseScreensaverConfig,
  saveScreensaverConfig,
  subscribeScreensaverConfig,
  syncToAndroidDreamBridge,
  type ScreensaverConfig,
} from './screensaver';

const SCREENSAVER_CONFIG_SHORTNAME = 'atomic-screensaver-config';

/**
 * Reads & persists the idle dashboard / Fire TV screensaver configuration.
 *
 * Local state lives in `localStorage` so it is available immediately (and even
 * before sign-in). When `syncWithDrive` is enabled and a Drive is active,
 * changes are also written to a `Document` resource (`shortname:
 * atomic-screensaver-config`) inside the Drive so paired devices — including
 * Fire TV running `AtomicDreamService` — stay in sync over WebSocket / Iroh.
 */
export function useScreensaverConfig(): {
  config: ScreensaverConfig;
  updateConfig: (patch: Partial<ScreensaverConfig>) => void;
  syncedSubject: string | undefined;
} {
  const { drive, baseURL, agent } = useSettings();
  const store = useStore();
  const [config, setConfig] = useState<ScreensaverConfig>(() =>
    loadScreensaverConfig(),
  );

  // Keep local state in sync across tabs & components.
  useEffect(() => {
    return subscribeScreensaverConfig(setConfig);
  }, []);

  // Forward server URL, drive, and config to Fire OS DreamService bridge.
  useEffect(() => {
    syncToAndroidDreamBridge(baseURL, drive, config);
  }, [baseURL, drive, config]);

  // Look up the Drive-synced config resource (if any).
  const { collection, ready } = useCollection(
    {
      property: core.properties.shortname,
      value: SCREENSAVER_CONFIG_SHORTNAME,
    },
    { pageSize: 5 },
  );

  const syncedSubject =
    ready && collection.totalMembers > 0 ? collection.members[0] : undefined;
  const syncedResource = useResource(syncedSubject);
  const [remoteJson] = useString(syncedResource, core.properties.description);

  // Adopt incoming Drive-synced config changes (e.g. edited on another device).
  useEffect(() => {
    if (!config.syncWithDrive || !remoteJson) return;

    const remote = parseScreensaverConfig(remoteJson);
    const localJson = JSON.stringify(config);
    const normalizedRemote = JSON.stringify(remote);

    if (localJson !== normalizedRemote) {
      saveScreensaverConfig(remote);
    }
  }, [remoteJson, config]);

  const updateConfig = useCallback(
    (patch: Partial<ScreensaverConfig>) => {
      const next: ScreensaverConfig = { ...config, ...patch };
      saveScreensaverConfig(next);
      syncToAndroidDreamBridge(baseURL, drive, next);

      if (!next.syncWithDrive || !drive || !agent) {
        return;
      }

      void (async () => {
        try {
          if (syncedSubject) {
            const res = await store.getResource(syncedSubject);
            await res.set(core.properties.description, JSON.stringify(next));
            await res.save();
          } else {
            const created = await store.newResource({
              parent: drive,
              isA: dataBrowser.classes.document,
              propVals: {
                [core.properties.shortname]: SCREENSAVER_CONFIG_SHORTNAME,
                [core.properties.name]: 'Fire TV Screensaver Config',
                [core.properties.description]: JSON.stringify(next),
              },
            });
            await created.save();
          }
        } catch {
          // Read-only drive or offline — localStorage + Android bridge still updated.
        }
      })();
    },
    [config, baseURL, drive, agent, syncedSubject, store],
  );

  return { config, updateConfig, syncedSubject };
}
