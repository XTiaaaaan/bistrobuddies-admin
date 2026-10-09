/**
 * Shared display formatting helpers.
 *
 * Currency is PHP only (see `../bistrobuddies-backend/docs/API_CONTRACT.md`
 * §1); the ₱ symbol is hard-coded with `en-PH` digit grouping, matching both
 * BistroBuddies apps.
 */

export function formatPhp(amount: number | null | undefined): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return '—';
  }
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Accepts Firestore `Timestamp`s as well as the ISO strings / epoch
 * milliseconds some historic documents carry, and returns `null` when the
 * value cannot be interpreted.
 */
export function toDate(
  value: { toDate?: () => Date } | string | number | null | undefined
): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'object') {
    if (typeof value.toDate !== 'function') {
      return null;
    }
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(
  value: { toDate?: () => Date } | string | number | null | undefined
): string {
  const date = toDate(value);
  if (!date) {
    return '—';
  }
  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Short, human readable order reference (`#a1b2c3d4`). */
export function shortId(id: string): string {
  if (!id) {
    return '—';
  }
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}
