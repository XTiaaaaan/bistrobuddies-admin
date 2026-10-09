import { ProfileSyncError, authErrorMessage } from './auth-errors';

describe('authErrorMessage', () => {
  it('should explain a failed profile save', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const message = authErrorMessage(
      new ProfileSyncError({ code: 'permission-denied' })
    );

    expect(message).toContain('profile could not be saved');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('should map Firestore permission errors', () => {
    expect(authErrorMessage({ code: 'permission-denied' })).toContain(
      'could not be saved'
    );
  });

  it('should map known Firebase auth error codes', () => {
    expect(authErrorMessage({ code: 'auth/invalid-email' })).toContain(
      'valid email'
    );
    expect(authErrorMessage({ code: 'auth/email-already-in-use' })).toContain(
      'already exists'
    );
    expect(authErrorMessage({ code: 'auth/invalid-credential' })).toContain(
      'Incorrect email or password'
    );
  });

  it('should fall back to the error message', () => {
    expect(authErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('should fall back to a generic message', () => {
    expect(authErrorMessage('unknown')).toBe(
      'Something went wrong. Please try again.'
    );
  });
});
