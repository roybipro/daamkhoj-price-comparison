import { clamp } from './format.js';

function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* Deterministic 12-week series derived from the listing id, so the demo chart is
   identical on every reload and for every visitor. */
export function priceHistory(seed: string, price: number): number[] {
  let state = seedFrom(seed);
  const next = (): number => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state ^= state + Math.imul(state ^ (state >>> 13), 3266489909);
    return ((state >>> 0) % 1000) / 1000;
  };

  const points: number[] = [];
  let value = price * (1 + (next() - 0.35) * 0.09);
  for (let week = 0; week < 12; week++) {
    value = clamp(value + (next() - 0.5) * price * 0.045, price * 0.9, price * 1.12);
    points.push(Math.round(value));
  }
  points[points.length - 1] = price;
  return points;
}
