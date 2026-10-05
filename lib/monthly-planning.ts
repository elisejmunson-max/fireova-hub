/** Owner-scoped editorial planning. Dates here never create publishing schedules. */
export const MAX_PRIORITIES = 20;
export const MAX_PRIORITY_LENGTH = 1000;
export const MAX_MONTHLY_ENTRIES = 200;
export type MonthlyPriority = { id: string; text: string };
export type MonthlyFeatures = { month: string; revision: number; priorities: MonthlyPriority[] };
export type MonthlyEntry = { id: string; date: string; title: string; status: 'Draft' | 'Waiting' | 'Revised' | 'Approved' | 'Scheduled' | 'Published'; draftId?: string; postId?: string };
export type MonthlyPlan = { month: string; features: MonthlyFeatures; entries: MonthlyEntry[]; truncated: boolean };
export function validMonth(value: unknown): value is string {
  return typeof value === 'string' && /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value);
}
export function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
export const monthTitle = (month: string) => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`));
export function monthCells(month: string) {
  const start = new Date(`${month}-01T12:00:00Z`), offset = (start.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const date = new Date(start); date.setUTCDate(index - offset + 1);
    return { date: date.toISOString().slice(0, 10), day: date.getUTCDate(), current: index >= offset && index < offset + count };
  });
}
export function validPriorities(value: unknown): value is MonthlyPriority[] {
  if (!Array.isArray(value) || value.length > MAX_PRIORITIES) return false;
  const ids = new Set<string>();
  return value.every((item) => {
    if (!item || typeof item !== 'object' || Object.keys(item).sort().join(',') !== 'id,text' ||
        typeof item.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id) ||
        ids.has(item.id) || typeof item.text !== 'string' || !item.text.trim() || item.text.length > MAX_PRIORITY_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(item.text)) return false;
    ids.add(item.id); return true;
  });
}
export function validFeatureWrite(value: unknown): value is MonthlyFeatures {
  if (!value || typeof value !== 'object') return false;
  const item = value as MonthlyFeatures;
  return Object.keys(item).sort().join(',') === 'month,priorities,revision' && validMonth(item.month) && Number.isInteger(item.revision) && item.revision >= 0 && item.revision < 2147483647 && validPriorities(item.priorities);
}
export function shortPostTitle(purpose: unknown, caption: unknown) {
  const heading = typeof purpose === 'string' && purpose.trim() && purpose.toLowerCase() !== 'manual draft'
    ? purpose.trim() : typeof caption === 'string' ? caption.split(/\n|[.!?](?:\s|$)/)[0].trim() : '';
  return heading ? heading.slice(0, 80) : 'Post';
}
export function parseMonthlyPlan(value: unknown, month: string): MonthlyPlan | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as MonthlyPlan;
  if (data.month !== month || data.features?.month !== month || !Number.isInteger(data.features?.revision) || data.features.revision < 0 || !validPriorities(data.features?.priorities) || !Array.isArray(data.entries) || data.entries.length > MAX_MONTHLY_ENTRIES || typeof data.truncated !== 'boolean') return null;
  if (!data.entries.every(entry => typeof entry.id === 'string' && typeof entry.date === 'string' && entry.date.startsWith(`${month}-`) && monthCells(month).some(cell => cell.current && cell.date === entry.date) && typeof entry.title === 'string' && ['Draft','Waiting','Revised','Approved','Scheduled','Published'].includes(entry.status))) return null;
  return data;
}
