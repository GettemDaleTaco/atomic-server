import { StoreEvents, useStore } from '@tomic/react';
import { useEffect, useState } from 'react';
import { useSettings } from '../helpers/AppSettings';
import { fetchPersonalDriveSubject } from '../helpers/personalDrive';

/**
 * Resolves the signed-in agent's personal (private) home drive.
 * Uses `initialDrive` optimistically while fetching authoritative value from the server.
 * Re-resolves when the Agent resource is updated (invite persist writes
 * `personalDrive` after the first `setAgent`).
 */
export function usePersonalDrive(): {
  personalDrive: string | undefined;
  loading: boolean;
} {
  const store = useStore();
  const { agent } = useSettings();
  const [personalDrive, setPersonalDrive] = useState<string | undefined>(
    () => agent?.initialDrive,
  );
  const [loading, setLoading] = useState(!!agent);

  useEffect(() => {
    if (!agent) {
      setPersonalDrive(undefined);
      setLoading(false);

      return;
    }

    let cancelled = false;
    setLoading(true);
    setPersonalDrive(agent.initialDrive);

    const apply = (resolved: string | undefined) => {
      if (!cancelled) {
        setPersonalDrive(resolved);
        setLoading(false);
      }
    };

    void fetchPersonalDriveSubject(store, agent).then(apply);

    const unsub = store.on(StoreEvents.ResourceUpdated, resource => {
      if (resource.subject !== agent.subject) {
        return;
      }

      void fetchPersonalDriveSubject(store, agent).then(apply);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [store, agent]);

  return { personalDrive, loading };
}
