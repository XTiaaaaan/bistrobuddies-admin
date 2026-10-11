/**
 * Customer "Contact Us" messages as returned by the backend admin API
 * (`GET /api/admin/contact-messages`, see the backend's
 * `docs/API_CONTRACT.md` §4). Messages are stored by the backend only —
 * clients have no Firestore access to this collection, and the list payload
 * never includes the sender's `userId`.
 */
export type ContactMessageStatus = 'NEW' | 'READ' | 'RESOLVED';

/**
 * Statuses the backend accepts on `PATCH /api/admin/contact-messages/:id/status`.
 * `NEW` is the server-assigned initial status and can never be re-applied.
 */
export type ContactMessageStatusUpdate = Exclude<ContactMessageStatus, 'NEW'>;

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: ContactMessageStatus;
  /** ISO-8601 string from the backend serializer, or null when missing. */
  createdAt: string | null;
  updatedAt: string | null;
}

/** Paginated list response, newest messages first. */
export interface ContactMessageListResponse {
  messages: ContactMessage[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ContactMessageStatusUpdateResponse {
  id: string;
  status: ContactMessageStatusUpdate;
}
