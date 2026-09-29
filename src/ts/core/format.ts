/* Formatting primitives shared by the core and UI layers. */

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const money = (amount: number): string => '৳' + Math.round(amount).toLocaleString('en-US');

export const normalise = (text: string): string => text.toLowerCase().normalize('NFKD').trim();

const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
};

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, char => ENTITIES[char]);
}
