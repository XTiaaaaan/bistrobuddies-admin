import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alertCircle,
  chatbubbleEllipses,
  checkmarkCircle,
  close,
  mail,
  refresh,
  send,
} from 'ionicons/icons';
import { formatDateTime } from '@shared/core/format/format';
import {
  ContactMessage,
  ContactMessageReplyResponse,
  ContactMessageStatusUpdate,
} from '@shared/models/contact-message.model';
import {
  CONTACT_MESSAGE_STATUS_OPTIONS,
  CONTACT_REPLY_MAX,
  ContactMessageStatusFilter,
  allowedStatusUpdates,
  contactMessageStatusColor,
  contactMessageStatusLabel,
  contactReplyError,
  messagePreview,
} from '../../core/messages/contact-message-status';
import { AdminApiError, AdminApiService } from '../../core/api/admin-api.service';

/** Page size sent to the backend; the server caps it at 100. */
const PAGE_SIZE = 25;

@Component({
  selector: 'admin-messages',
  templateUrl: './admin-messages.page.html',
  styleUrls: ['./admin-messages.page.scss'],
  standalone: true,
  imports: [
    IonBadge,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonModal,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToolbar,
  ],
})
export class AdminMessagesPage implements OnInit {
  readonly statusOptions = CONTACT_MESSAGE_STATUS_OPTIONS;
  readonly pageSize = PAGE_SIZE;

  readonly messages = signal<ContactMessage[]>([]);
  readonly loadStatus = signal<'loading' | 'ready' | 'error'>('loading');
  readonly refreshing = signal(false);
  readonly errorMessage = signal('');

  readonly statusFilter = signal<ContactMessageStatusFilter>('ALL');
  readonly page = signal(1);
  readonly total = signal(0);
  readonly totalPages = signal(1);

  readonly busyId = signal<string | null>(null);
  readonly selected = signal<ContactMessage | null>(null);

  readonly replyMax = CONTACT_REPLY_MAX;
  readonly replyDraft = signal('');
  readonly replyError = signal('');
  readonly sendingReply = signal(false);
  readonly replyCharacters = computed(
    () => this.replyDraft().trim().length
  );

  readonly canGoPrevious = computed(
    () => this.loadStatus() === 'ready' && this.page() > 1
  );
  readonly canGoNext = computed(
    () =>
      this.loadStatus() === 'ready' &&
      this.page() < this.totalPages() &&
      this.messages().length > 0
  );

  readonly selectedUpdates = computed(() =>
    allowedStatusUpdates(this.selected()?.status)
  );

  private readonly adminApi = inject(AdminApiService);
  private readonly toastCtrl = inject(ToastController);

  constructor() {
    addIcons({
      alertCircle,
      chatbubbleEllipses,
      checkmarkCircle,
      close,
      mail,
      refresh,
      send,
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  /** Fetches the current page from the backend admin API. */
  async load(options: { refreshing?: boolean } = {}): Promise<void> {
    const isRefresh = options.refreshing === true;
    if (isRefresh) {
      this.refreshing.set(true);
    } else {
      this.loadStatus.set('loading');
      this.errorMessage.set('');
    }

    try {
      const status = this.statusFilter();
      const response = await this.adminApi.listContactMessages({
        status: status === 'ALL' ? undefined : status,
        page: this.page(),
        pageSize: this.pageSize,
      });
      this.messages.set(response.messages);
      this.total.set(response.total);
      this.totalPages.set(Math.max(response.totalPages, 1));
      this.page.set(response.page);
      this.loadStatus.set('ready');
    } catch (error) {
      if (isRefresh && this.loadStatus() === 'ready') {
        // Keep the list already on screen; a failed refresh is a toast, not
        // a replacement of working data with an error state.
        await this.showError(this.describeError(error, 'refresh'));
      } else {
        this.errorMessage.set(this.describeError(error, 'list'));
        this.loadStatus.set('error');
      }
    } finally {
      this.refreshing.set(false);
    }
  }

  refresh(): void {
    if (this.refreshing()) {
      return;
    }
    void this.load({ refreshing: true });
  }

  /** Changing the filter always restarts from page 1. */
  async onStatusFilterChange(value: ContactMessageStatusFilter): Promise<void> {
    if (value === this.statusFilter()) {
      return;
    }
    this.statusFilter.set(value);
    this.page.set(1);
    await this.load();
  }

  async previousPage(): Promise<void> {
    if (!this.canGoPrevious()) {
      return;
    }
    this.page.set(this.page() - 1);
    await this.load();
  }

  async nextPage(): Promise<void> {
    if (!this.canGoNext()) {
      return;
    }
    this.page.set(this.page() + 1);
    await this.load();
  }

  openMessage(message: ContactMessage): void {
    this.selected.set(message);
  }

  /** Opens the detail panel with a fresh reply composer for this message. */
  openReply(message: ContactMessage): void {
    this.replyDraft.set('');
    this.replyError.set('');
    this.selected.set(message);
  }

  closeDetail(): void {
    this.selected.set(null);
    this.replyDraft.set('');
    this.replyError.set('');
  }

  cancelReply(): void {
    this.replyDraft.set('');
    this.replyError.set('');
  }

  /** Syncs the draft from the textarea and clears a resolved error. */
  onReplyInput(event: CustomEvent): void {
    const value = (event.detail as { value?: unknown })?.value ?? '';
    this.replyDraft.set(typeof value === 'string' ? value : '');
    if (this.replyError() && contactReplyError(this.replyDraft()) === null) {
      this.replyError.set('');
    }
  }

  /**
   * Sends the draft to the backend's reply endpoint. The composer only
   * reflects state the backend confirmed: on success the stored reply is
   * applied and the draft cleared; on failure the draft and any typed text
   * are preserved and the error is shown inline. A request in flight
   * blocks any duplicate submission.
   */
  async sendReply(): Promise<void> {
    const message = this.selected();
    if (!message || this.sendingReply()) {
      return;
    }

    const draft = this.replyDraft().trim();
    const issue = contactReplyError(draft);
    if (issue !== null) {
      this.replyError.set(issue);
      return;
    }

    this.sendingReply.set(true);
    this.replyError.set('');
    try {
      const result = await this.adminApi.replyToContactMessage(
        message.id,
        draft
      );
      this.applyConfirmedReply(result);
      this.replyDraft.set('');
      const toast = await this.toastCtrl.create({
        message: 'Reply sent to the customer.',
        duration: 2500,
        color: 'success',
      });
      await toast.present();
    } catch (error) {
      // The draft survives a failed request so the admin can retry.
      this.replyError.set(this.describeError(error, 'reply'));
    } finally {
      this.sendingReply.set(false);
    }
  }

  /**
   * Applies the backend-confirmed reply (and post-reply status) to the list
   * and the open detail panel. The reply comes from the server response —
   * nothing is invented locally.
   */
  private applyConfirmedReply(result: ContactMessageReplyResponse): void {
    const confirmedAt = result.reply.createdAt;
    this.messages.update((list) =>
      list.map((message) =>
        message.id === result.id
          ? {
              ...message,
              status: result.status,
              updatedAt: confirmedAt ?? message.updatedAt,
              replies: [...message.replies, result.reply],
            }
          : message
      )
    );
    const current = this.selected();
    if (current?.id === result.id) {
      this.selected.set({
        ...current,
        status: result.status,
        updatedAt: confirmedAt ?? current.updatedAt,
        replies: [...current.replies, result.reply],
      });
    }
  }

  isBusy(message: ContactMessage): boolean {
    return this.busyId() === message.id;
  }

  /**
   * Sends a workflow status change to the backend. The UI only reflects the
   * server-confirmed status from the PATCH response; a failure keeps the
   * current status and surfaces an error toast.
   */
  async updateStatus(
    message: ContactMessage,
    next: ContactMessageStatusUpdate
  ): Promise<void> {
    if (this.busyId() !== null) {
      return;
    }
    if (!allowedStatusUpdates(message.status).includes(next)) {
      await this.showError(
        `A ${contactMessageStatusLabel(
          message.status
        )} message cannot be marked as ${contactMessageStatusLabel(next)}.`
      );
      return;
    }

    this.busyId.set(message.id);
    try {
      const result = await this.adminApi.updateContactMessageStatus(
        message.id,
        next
      );
      this.applyConfirmedStatus(result.id, result.status);
      const toast = await this.toastCtrl.create({
        message: `Message marked as ${contactMessageStatusLabel(result.status)}.`,
        duration: 2500,
        color: 'success',
      });
      await toast.present();
    } catch (error) {
      await this.showError(this.describeError(error, 'update'));
    } finally {
      this.busyId.set(null);
    }
  }

  /** Applies the backend-confirmed status to the list and open detail. */
  private applyConfirmedStatus(id: string, status: ContactMessage['status']): void {
    this.messages.update((list) =>
      list.map((message) => (message.id === id ? { ...message, status } : message))
    );
    const current = this.selected();
    if (current?.id === id) {
      this.selected.set({ ...current, status });
    }
  }

  private async showError(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 5000,
      color: 'danger',
    });
    await toast.present();
  }

  /**
   * Maps API failures to clear, actionable copy — expired sessions and
   * access denials get their own wording instead of a generic server error.
   */
  private describeError(
    error: unknown,
    context: 'list' | 'refresh' | 'update' | 'reply'
  ): string {
    if (error instanceof AdminApiError) {
      if (error.status === 401) {
        return 'Your administrator session could not be verified. Please sign in again.';
      }
      if (error.status === 403) {
        return 'Access denied — administrator access is required to manage customer messages.';
      }
      if (error.status === 429) {
        return 'Too many requests. Please wait a moment and try again.';
      }
      return error.message;
    }
    switch (context) {
      case 'update':
        return 'Could not update the message status. Please try again.';
      case 'reply':
        return 'Could not send the reply. Please try again — your draft is kept.';
      case 'refresh':
        return 'Could not refresh the messages. Please try again.';
      default:
        return 'Could not load the messages. Please try again.';
    }
  }

  formatDate = formatDateTime;
  statusColor = contactMessageStatusColor;
  statusLabel = contactMessageStatusLabel;
  preview = messagePreview;

  mailto(email: string): string {
    return `mailto:${email}`;
  }
}
