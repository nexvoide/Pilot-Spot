import { describe, expect, it } from 'vitest';
import { clusterZones } from './zone-clusters';
import type { PivotZone } from './zone-scanner';

function zone(price: number, lower: number, upper: number, broken: boolean, kind: PivotZone['kind'] = 'support'): PivotZone {
  return { kind, price, lower, upper, broken };
}

describe('zone clusters', () => {
  it('groups nearby intersecting active and broken areas, keeping separate areas distinct', () => {
    const groups = clusterZones([
      zone(0.8639, 0.861, 0.8668, true),
      zone(0.8595, 0.857, 0.862, true),
      zone(0.8578, 0.855, 0.860, true),
      zone(0.8575, 0.8542, 0.8608, false),
      zone(0.8404, 0.838, 0.843, true),
      zone(0.8805, 0.854, 0.89, true, 'resistance'),
    ]);
    const support = groups.filter((group) => group.kind === 'support');
    expect(support).toHaveLength(2);
    expect(support[1].zones.map((item) => item.price).sort()).toEqual([0.8575, 0.8578, 0.8595, 0.8639]);
    expect(support[1].zones.filter((item) => item.broken)).toHaveLength(3);
    expect(groups.filter((group) => group.kind === 'resistance')).toHaveLength(1);
  });
  it('does not collapse a long chain of overlapping broken supports into one area', () => {
    const groups = clusterZones([
      zone(0.8197, 0.810, 0.831, true),
      zone(0.8262, 0.810, 0.841, true),
      zone(0.8368, 0.825, 0.849, true),
      zone(0.8412, 0.829, 0.853, true),
      zone(0.8420, 0.830, 0.854, true),
      zone(0.8654, 0.852, 0.878, true),
    ]);
    expect(groups.map((group) => group.zones.map((item) => item.price))).toEqual([
      [0.8197, 0.8262], [0.8368, 0.8412, 0.8420], [0.8654],
    ]);
  });

});
