export type RouteStop = {
  id: string;
  title: string;
  status: string;
  scheduled_time?: string | null;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
};
export type Point = { latitude: number; longitude: number };
export function hasPoint(p: {
  latitude?: number | null;
  longitude?: number | null;
}): p is Point {
  return (
    typeof p.latitude === "number" &&
    Number.isFinite(p.latitude) &&
    Math.abs(p.latitude) <= 90 &&
    typeof p.longitude === "number" &&
    Number.isFinite(p.longitude) &&
    Math.abs(p.longitude) <= 180
  );
}
export function distanceKm(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad,
    dLon = (b.longitude - a.longitude) * rad;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}
export function suggestRoute<T extends RouteStop>(
  stops: T[],
  origin?: Point,
): T[] {
  const open = stops.filter((s) =>
    ["scheduled", "in-progress", "quoted"].includes(s.status),
  );
  const timed = open
    .filter((s) => s.scheduled_time)
    .sort(
      (a, b) =>
        a.scheduled_time!.localeCompare(b.scheduled_time!) ||
        a.id.localeCompare(b.id),
    );
  const flexible = open.filter((s) => !s.scheduled_time && hasPoint(s));
  const result = [...timed];
  let point: Point | undefined =
    timed.length && hasPoint(timed[timed.length - 1])
      ? (timed[timed.length - 1] as Point)
      : origin;
  while (flexible.length) {
    const candidates = point
      ? flexible
          .map((s, i) => ({ i, d: distanceKm(point!, s as Point) }))
          .sort((a, b) => a.d - b.d || a.i - b.i)
      : [{ i: 0 }];
    const [next] = flexible.splice(candidates[0].i, 1);
    result.push(next);
    point = next as Point;
  }
  return [...result, ...open.filter((s) => !s.scheduled_time && !hasPoint(s))];
}
export function navigationLink(stop: RouteStop) {
  const destination = hasPoint(stop)
    ? `${stop.latitude},${stop.longitude}`
    : stop.address;
  return destination
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
    : null;
}
