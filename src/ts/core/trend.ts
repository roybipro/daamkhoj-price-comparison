/* Geometry for the 12-week trend chart. Returns coordinates, never markup, so the same
   numbers can be reused by a server renderer or a test without touching the DOM. */

import type { Offer } from '../types.js';

export const TREND_WEEKS = 12;
const PAD = { left: 56, right: 14, top: 14, bottom: 24 };
const MAX_SERIES = 6;

export interface TrendPoint { x: number; y: number; week: number; value: number }
export interface TrendSeries {
  offerId: string;
  shop: string;
  seller: string;
  accent: string;
  points: TrendPoint[];
  lowest: TrendPoint;
  current: number;
}
export interface TrendChart {
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  series: TrendSeries[];
  hidden: number;
  ticks: { y: number; value: number }[];
  average: { y: number; value: number } | null;
  weekXs: number[];
  floor: number;
  ceiling: number;
}

/** Four or five labels on a 250 px chart; a step derived from the spread keeps them on
    round taka figures instead of printing ৳813 next to ৳1,041. */
function niceStep(span: number): number {
  const raw = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const multiplier = [1, 2, 2.5, 5, 10].find(factor => raw <= magnitude * factor) ?? 10;
  return Math.max(1, magnitude * multiplier);
}

export function buildTrend(offers: readonly Offer[], average: number, width = 900, height = 250): TrendChart | null {
  const usable = offers.filter(offer => offer.history.length === TREND_WEEKS).slice(0, MAX_SERIES);
  if (!usable.length) return null;

  const all = usable.flatMap(offer => offer.history);
  const rawLow = Math.min(...all, average || Infinity);
  const rawHigh = Math.max(...all, average || -Infinity);
  const spread = rawHigh - rawLow || 1;
  const step = niceStep(spread * 1.12);
  const floor = Math.max(0, Math.floor((rawLow - spread * 0.06) / step) * step);
  const ceiling = Math.ceil((rawHigh + spread * 0.06) / step) * step;

  const plot = {
    left: PAD.left,
    right: width - PAD.right,
    top: PAD.top,
    bottom: height - PAD.bottom
  };
  const innerW = plot.right - plot.left;
  const innerH = plot.bottom - plot.top;
  const yAt = (value: number): number =>
    plot.bottom - ((value - floor) / (ceiling - floor || 1)) * innerH;

  const weekXs = Array.from({ length: TREND_WEEKS }, (_, week) =>
    plot.left + (week / (TREND_WEEKS - 1)) * innerW);

  const series = usable.map(offer => {
    const points = offer.history.map((value, week) => ({ x: weekXs[week], y: yAt(value), week, value }));
    const lowest = points.reduce((best, point) => (point.value < best.value ? point : best), points[0]);
    return {
      offerId: offer.id,
      shop: offer.store.name,
      seller: offer.seller,
      accent: offer.store.accent,
      points,
      lowest,
      current: offer.history[points.length - 1]
    };
  });

  const ticks: { y: number; value: number }[] = [];
  for (let value = floor; value <= ceiling; value += step) {
    ticks.push({ value, y: yAt(value) });
  }

  return {
    width,
    height,
    plot,
    series,
    hidden: offers.length - usable.length,
    ticks,
    average: average > 0 ? { value: average, y: yAt(average) } : null,
    weekXs,
    floor,
    ceiling
  };
}

/** "Week 4" of a 12-week series runs back from today, so label it by how long ago it was. */
export const weekLabel = (week: number): string => {
  const ago = TREND_WEEKS - 1 - week;
  if (ago === 0) return 'now';
  return `${ago}w`;
};
