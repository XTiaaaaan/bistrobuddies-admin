const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password should be at least 6 characters.',
  'auth/too-many-requests':
    'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed':
    'Network error. Please check your connection and try again.',
  'auth/popup-blocked':
    'The sign-in pop-up was blocked. Please allow pop-ups for this site.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
  'auth/cancelled-popup-request': 'Google sign-in was cancelled.',
  'auth/operation-not-allowed':
    'This sign-in method is not enabled. Please contact support.',
  'auth/unauthorized-domain':
    'This domain is not authorized for sign-in in the Firebase console.',
  'permission-denied':
    'Your account is signed in, but some data could not be saved. Please try again later.',
};

export class ProfileSyncError extends Error {
  constructor(readonly reason: unknown) {
    super('Failed to create or update the Firestore user profile.');
    this.name = 'ProfileSyncError';
  }
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof ProfileSyncError) {
    console.error('User profile sync failed', error.reason);
    return 'Your account exists, but your profile could not be saved. Please log in again and retry.';
  }

  const message = AUTH_ERROR_MESSAGES[errorCode(error)];
  if (message) {
    return message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}
