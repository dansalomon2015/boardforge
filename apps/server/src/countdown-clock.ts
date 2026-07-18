export type CountdownClock = {
  now: () => number;
  schedule: (callback: () => void, delayMs: number) => () => void;
};

export const systemCountdownClock: CountdownClock = {
  now: () => Date.now(),
  schedule(callback, delayMs) {
    const handle = setTimeout(callback, delayMs);
    handle.unref();
    return () => clearTimeout(handle);
  },
};
