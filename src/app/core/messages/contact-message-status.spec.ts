import {
  CONTACT_MESSAGE_STATUS_OPTIONS,
  allowedStatusUpdates,
  contactMessageStatusColor,
  contactMessageStatusLabel,
  isContactMessageStatus,
  messagePreview,
} from './contact-message-status';

describe('contact-message-status', () => {
  it('offers the status filter choices mapped to backend values', () => {
    expect(CONTACT_MESSAGE_STATUS_OPTIONS.map((option) => option.value)).toEqual(
      ['ALL', 'NEW', 'READ', 'RESOLVED']
    );
  });

  it('recognises only the three backend statuses', () => {
    expect(isContactMessageStatus('NEW')).toBe(true);
    expect(isContactMessageStatus('READ')).toBe(true);
    expect(isContactMessageStatus('RESOLVED')).toBe(true);
    expect(isContactMessageStatus('NEW-ish')).toBe(false);
    expect(isContactMessageStatus(null)).toBe(false);
  });

  it('allows NEW to move to READ or RESOLVED, READ to RESOLVED only', () => {
    expect(allowedStatusUpdates('NEW')).toEqual(['READ', 'RESOLVED']);
    expect(allowedStatusUpdates('READ')).toEqual(['RESOLVED']);
  });

  it('offers no update from RESOLVED or an unknown status', () => {
    expect(allowedStatusUpdates('RESOLVED')).toEqual([]);
    expect(allowedStatusUpdates('SOMETHING_ELSE')).toEqual([]);
    expect(allowedStatusUpdates(undefined)).toEqual([]);
  });

  it('labels and colors statuses for badges', () => {
    expect(contactMessageStatusLabel('NEW')).toBe('New');
    expect(contactMessageStatusLabel('RESOLVED')).toBe('Resolved');
    expect(contactMessageStatusLabel('odd')).toBe('odd');
    expect(contactMessageStatusColor('NEW')).toBe('warning');
    expect(contactMessageStatusColor('READ')).toBe('primary');
    expect(contactMessageStatusColor('RESOLVED')).toBe('success');
    expect(contactMessageStatusColor('unknown')).toBe('medium');
  });

  it('truncates long previews and collapses whitespace', () => {
    expect(messagePreview('Short message')).toBe('Short message');
    expect(messagePreview('line one\nline two')).toBe('line one line two');

    const long = 'a'.repeat(200);
    const preview = messagePreview(long, 20);
    expect(preview).toHaveLength(20);
    expect(preview.endsWith('…')).toBe(true);
  });
});
