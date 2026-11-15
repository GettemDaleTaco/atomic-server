import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { paths } from '../routes/paths';
import { useScreensaverConfig } from '../helpers/useScreensaverConfig';

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'wheel',
] as const;

/**
 * Watches for user inactivity when the idle dashboard / screensaver is enabled
 * and navigates to `/app/screensaver`. Renders nothing.
 */
export function IdleScreensaverWatcher() {
  const { config } = useScreensaverConfig();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const timerRef = useRef<number | undefined>(undefined);

  const isOnScreensaver = pathname === paths.screensaver;

  useEffect(() => {
    if (!config.enabled || isOnScreensaver) {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }

      return;
    }

    const resetTimer = () => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }

      timerRef.current = window.setTimeout(() => {
        navigate({ to: paths.screensaver });
      }, config.idleTimeoutSeconds * 1000);
    };

    resetTimer();

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    return () => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }

      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [config.enabled, config.idleTimeoutSeconds, isOnScreensaver, navigate]);

  return null;
}
