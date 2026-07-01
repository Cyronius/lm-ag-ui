import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRunWatchdog } from '../runWatchdog';

// Unit coverage for the adaptive run watchdog: an idle timer that resets on
// every `kick()` plus a non-resetting absolute cap. Whichever fires first calls
// `onExpire(reason)` exactly once. Deterministic via fake timers.

const IDLE = 180_000; // 3 min
const MAX = 900_000;  // 15 min

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

describe('createRunWatchdog', () => {
    it('fires idle expiry when no kick lands within the idle window', () => {
        const onExpire = vi.fn();
        const wd = createRunWatchdog({ idleMs: IDLE, maxMs: MAX, onExpire });
        wd.start();

        vi.advanceTimersByTime(IDLE - 1);
        expect(onExpire).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(onExpire).toHaveBeenCalledTimes(1);
        expect(onExpire).toHaveBeenCalledWith('idle');
    });

    it('kick() resets the idle timer, keeping a progressing run alive', () => {
        const onExpire = vi.fn();
        const wd = createRunWatchdog({ idleMs: IDLE, maxMs: MAX, onExpire });
        wd.start();

        // Advance nearly to the idle deadline then kick, repeatedly.
        for (let i = 0; i < 4; i++) {
            vi.advanceTimersByTime(IDLE - 1);
            wd.kick();
        }
        expect(onExpire).not.toHaveBeenCalled();

        // Once the kicks stop, the next full idle window trips it.
        vi.advanceTimersByTime(IDLE);
        expect(onExpire).toHaveBeenCalledTimes(1);
        expect(onExpire).toHaveBeenCalledWith('idle');
    });

    it('absolute cap fires regardless of kicks and only once', () => {
        const onExpire = vi.fn();
        const wd = createRunWatchdog({ idleMs: IDLE, maxMs: MAX, onExpire });
        wd.start();

        // Kick often enough that the idle timer never expires, all the way to MAX.
        const step = IDLE - 1;
        for (let elapsed = 0; elapsed < MAX; elapsed += step) {
            vi.advanceTimersByTime(step);
            wd.kick();
        }
        // Cross the absolute deadline.
        vi.advanceTimersByTime(MAX);

        expect(onExpire).toHaveBeenCalledTimes(1);
        expect(onExpire).toHaveBeenCalledWith('max');
    });

    it('stop() disarms both timers', () => {
        const onExpire = vi.fn();
        const wd = createRunWatchdog({ idleMs: IDLE, maxMs: MAX, onExpire });
        wd.start();
        wd.stop();

        vi.advanceTimersByTime(MAX * 2);
        expect(onExpire).not.toHaveBeenCalled();
    });

    it('kick() before start() is a no-op', () => {
        const onExpire = vi.fn();
        const wd = createRunWatchdog({ idleMs: IDLE, maxMs: MAX, onExpire });

        wd.kick();
        vi.advanceTimersByTime(MAX * 2);
        expect(onExpire).not.toHaveBeenCalled();
    });
});
