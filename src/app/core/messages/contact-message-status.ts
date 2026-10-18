/**
 * Contact-message workflow vocabulary shared by the Customer Messages UI.
 *
 * The update graph mirrors the backend contract: messages start as `NEW`,
 * may move to `READ` or `RESOLVED`, and `RESOLVED` is final. The backend
 * still validates every request — `NEW` is rejected on the status endpoint.
 */
import {
  ContactMessageStatus,
  ContactMessageStatusUpdate,
} from '@shared/models/contact-message.model';

export const CONTACT_MESSAGE_STATUSES: readonly ContactMessageStatus[] = [
  'NEW',
  'READ',
  'RESOLVED',
];

/** Status filter choices offered on the messages page. */
export type ContactMessageStatusFilter = 'ALL' | ContactMessageStatus;

export interface ContactMessageStatusOption {
  value: ContactMessageStatusFilter;
  label: string;
}

export const CONTACT_MESSAGE_STATUS_OPTIONS: readonly ContactMessageStatusOption[] =
  [
    { value: 'ALL', label: 'All Messages' },
    { value: 'NEW', label: 'New' },
    { value: 'READ', label: 'Read' },
    { value: 'RESOLVED', label: 'Resolved' },
  ];

export function isContactMessageStatus(
  value: unknown
): value is ContactMessageStatus {
  return (
    typeof value === 'string' &&
    (CONTACT_MESSAGE_STATUSES as readonly string[]).includes(value)
  );
}

/** Human readable label for a message status. */
export function contactMessageStatusLabel(status: unknown): string {
  if (!isContactMessageStatus(status)) {
    return typeof status === 'string' && status ? status : 'UNKNOWN';
  }
  return status.charAt(0) + status.slice(1).toLowerCase();
}

/** Badge color for a message status (Ionic color names). */
export function contactMessageStatusColor(status: unknown): string {
  switch (status) {
    case 'NEW':
      return 'warning';
    case 'READ':
      return 'primary';
    case 'RESOLVED':
      return 'success';
    default:
      return 'medium';
  }
}

/**
 * Status updates the backend will accept from `current`. Unknown or final
 * statuses yield an empty list, so the UI offers no update at all.
 */
export function allowedStatusUpdates(
  current: unknown
): ContactMessageStatusUpdate[] {
  switch (current) {
    case 'NEW':
      return ['READ', 'RESOLVED'];
    case 'READ':
      return ['RESOLVED'];
    default:
      return [];
  }
}

/** Single-line table preview; the full text lives in the detail view. */
export function messagePreview(message: string, maxLength = 120): string {
  const text = message.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(maxLength - 1, 1))}…`;
}

/**
 * Maximum accepted reply length — mirrors the backend's
 * `CONTACT_REPLY_MAX`, which stays authoritative.
 */
export const CONTACT_REPLY_MAX = 5000;

/**
 * `null` when the reply text is usable, otherwise the message to show.
 * Judged after trimming, so whitespace-only input is rejected exactly like
 * the backend rejects it; the server still validates every request.
 */
export function contactReplyError(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return 'Reply text is required.';
  }
  if (value.length > CONTACT_REPLY_MAX) {
    return `Reply must be ${CONTACT_REPLY_MAX} characters or fewer.`;
  }
  return null;
}
