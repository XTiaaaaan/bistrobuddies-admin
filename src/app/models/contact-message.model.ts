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

/**
 * A reply stored on a contact message, as returned by the backend
 * (`{ id, senderRole, reply, createdAt }` — sender role and timestamp are
 * decided by the backend; only the Admin SDK writes replies).
 */
export interface ContactMessageReply {
  id: string;
  senderRole: 'ADMIN' | 'CUSTOMER';
  reply: string;
  /** ISO-8601 string from the backend serializer, or null when missing. */
  createdAt: string | null;
}

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
  /** Stored admin replies, oldest first (empty until one was sent). */
  replies: ContactMessageReply[];
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

/** Response of `POST /api/admin/contact-messages/:id/replies`. */
export interface ContactMessageReplyResponse {
  id: string;
  /** Workflow status of the message after the reply was stored. */
  status: ContactMessageStatus;
  reply: ContactMessageReply;
}
