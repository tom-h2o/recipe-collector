import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * A countdown for cook mode.
 *
 * Deliberately driven by a wall-clock deadline rather than by decrementing a
 * counter each tick. Browsers throttle timers in background tabs — often to once
 * a minute — so a counting-down interval loses real time whenever the phone
 * locks or the cook switches apps, which is exactly when a kitchen timer is
 * being relied on. Storing the end time means the display is simply recomputed
 * from `Date.now()` and is correct however long the tab was asleep.
 */
export interface CookTimer {
  /** Seconds left, floored at zero. */
  remaining: number;
  /** What the timer was started with, for the progress ring. */
  total: number;
  isRunning: boolean;
  isDone: boolean;
  /** True once started and not yet cleared, running or paused. */
  isActive: boolean;
  start: (seconds: number) => void;
  pause: () => void;
  resume: () => void;
  clear: () => void;
  /** Silences the alarm and clears the finished timer. */
  dismiss: () => void;
}

/** A short double beep, synthesised so no audio asset has to ship or load. */
function playAlarm(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const now = ctx.currentTime;

    for (const offset of [0, 0.45]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      // Ramped rather than switched, so it does not click.
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.4);
    }
    window.setTimeout(() => void ctx.close().catch(() => {}), 1200);
  } catch {
    // Audio is a nicety; a blocked or unavailable AudioContext must never stop
    // the visual alarm from showing.
  }
}

function vibrate(): void {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    // Unsupported on desktop and iOS Safari; ignored on purpose.
  }
}

export function useCookTimer(): CookTimer {
  const [total, setTotal] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isActive, setIsActive] = useState(false);

  /** Absolute ms timestamp the countdown ends at; null while paused or idle. */
  const endsAt = useRef<number | null>(null);
  const alarmed = useRef(false);

  useEffect(() => {
    if (!isRunning) return;

    const tick = () => {
      if (endsAt.current === null) return;
      const left = Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !alarmed.current) {
        alarmed.current = true;
        setIsRunning(false);
        playAlarm();
        vibrate();
      }
    };

    tick();
    const id = window.setInterval(tick, 250);
    // Recomputed on wake as well: a throttled interval may not have fired while
    // the tab was hidden, and the cook returning to the app should see the truth.
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isRunning]);

  const start = useCallback((seconds: number) => {
    if (seconds <= 0) return;
    alarmed.current = false;
    endsAt.current = Date.now() + seconds * 1000;
    setTotal(seconds);
    setRemaining(seconds);
    setIsActive(true);
    setIsRunning(true);
  }, []);

  const pause = useCallback(() => {
    if (endsAt.current === null) return;
    setRemaining(Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000)));
    endsAt.current = null;
    setIsRunning(false);
  }, []);

  const resume = useCallback(() => {
    setRemaining((left) => {
      if (left <= 0) return left;
      endsAt.current = Date.now() + left * 1000;
      setIsRunning(true);
      return left;
    });
  }, []);

  const clear = useCallback(() => {
    endsAt.current = null;
    alarmed.current = false;
    setIsRunning(false);
    setIsActive(false);
    setRemaining(0);
    setTotal(0);
  }, []);

  return {
    remaining,
    total,
    isRunning,
    isDone: isActive && remaining === 0,
    isActive,
    start,
    pause,
    resume,
    clear,
    dismiss: clear,
  };
}
