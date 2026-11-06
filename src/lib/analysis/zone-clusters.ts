import type { PivotZone } from './zone-scanner.js';

export interface ZoneCluster {
  kind: PivotZone['kind'];
  lower: number;
  upper: number;
  zones: PivotZone[];
}

/** Group overlapping areas only when their centers span no more than 1%. */
export function clusterZones(zones: PivotZone[]): ZoneCluster[] {
  const result: ZoneCluster[] = [];
  for (const kind of ['support', 'resistance'] as const) {
    const sorted = zones.filter((zone) => zone.kind === kind)
      .slice().sort((a, b) => a.price - b.price || a.lower - b.lower);
    let current: ZoneCluster | undefined;
    let lowestCenter = 0;
    for (const zone of sorted) {
      if (current && zone.lower <= current.upper && zone.upper >= current.lower &&
          zone.price <= lowestCenter * 1.01) {
        current.lower = Math.min(current.lower, zone.lower);
        current.upper = Math.max(current.upper, zone.upper);
        current.zones.push(zone);
      } else {
        current = { kind, lower: zone.lower, upper: zone.upper, zones: [zone] };
        lowestCenter = zone.price;
        result.push(current);
      }
    }
  }
  return result;
}
