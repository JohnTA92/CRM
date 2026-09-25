// Injectable browser dependencies allow lifecycle tests without real GPS or uploads.
export function foregroundLocation(deps: {
  visible: () => boolean;
  watch: (
    success: (p: GeolocationPosition) => void,
    error: (e: GeolocationPositionError) => void,
  ) => number;
  clear: (id: number) => void;
  send: (point: {
    latitude: number;
    longitude: number;
    accuracy: number;
  }) => Promise<void>;
  onError: (message: string) => void;
  now?: () => number;
}) {
  let id: number | undefined,
    stopped = false,
    sending = false,
    last = -Infinity;
  const now = deps.now ?? Date.now;
  return {
    start() {
      if (stopped || !deps.visible()) return;
      id = deps.watch(
        async (p) => {
          if (
            stopped ||
            !deps.visible() ||
            sending ||
            now() - last < 15000 ||
            now() - p.timestamp > 30000
          )
            return;
          sending = true;
          last = now();
          try {
            await deps.send({
              latitude: p.coords.latitude,
              longitude: p.coords.longitude,
              accuracy: p.coords.accuracy,
            });
          } catch (e) {
            if (!stopped)
              deps.onError(
                e instanceof Error
                  ? e.message
                  : "Location could not be shared.",
              );
          } finally {
            sending = false;
          }
        },
        (e) => {
          if (!stopped)
            deps.onError(
              e.code === 1
                ? "Location permission was denied. You can still use your jobs and route."
                : e.message,
            );
        },
      );
    },
    stop() {
      stopped = true;
      if (id !== undefined) deps.clear(id);
    },
  };
}
