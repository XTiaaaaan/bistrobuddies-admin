import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  Auth,
  User as FirebaseUser,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { FIREBASE_AUTH } from '../core/firebase/firebase';
import { ProfileSyncError } from '../core/auth/auth-errors';
import { User } from '../models/user.model';
import { UsersService } from './users.service';

export interface RegisterInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
}

/** Reports the current step of a long running auth action to the UI. */
export type AuthProgress = (message: string) => void;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly users = inject(UsersService);

  /** Firebase auth state. Emits once the saved session has been restored. */
  readonly user$: Observable<FirebaseUser | null> = new Observable(
    (subscriber) => {
      const unsubscribe = onAuthStateChanged(
        this.auth,
        (user) => subscriber.next(user),
        (error) => subscriber.error(error)
      );
      return () => unsubscribe();
    }
  );

  readonly isAuthenticated$: Observable<boolean> = this.user$.pipe(
    map((user) => user !== null)
  );

  readonly uid$: Observable<string | null> = this.user$.pipe(
    map((user) => user?.uid ?? null)
  );

  currentUser(): FirebaseUser | null {
    return this.auth.currentUser;
  }

  /**
   * Returns a short-lived Firebase ID token for the signed-in user, or null
   * when nobody is signed in. The token is sent as a Bearer token to protected
   * backend endpoints; it is never persisted by the app.
   */
  async getIdToken(): Promise<string | null> {
    const user = this.auth.currentUser;
    if (!user) {
      return null;
    }
    return user.getIdToken();
  }

  async register(
    input: RegisterInput,
    onProgress?: AuthProgress
  ): Promise<FirebaseUser> {
    onProgress?.('Creating your account...');
    const credential = await createUserWithEmailAndPassword(
      this.auth,
      input.email.trim(),
      input.password
    );
    await updateProfile(credential.user, { displayName: input.name.trim() });
    onProgress?.('Saving your profile...');
    await this.syncProfile(credential.user, {
      name: input.name,
      phone: input.phone,
    });
    return credential.user;
  }

  async login(
    email: string,
    password: string,
    onProgress?: AuthProgress
  ): Promise<FirebaseUser> {
    onProgress?.('Signing in...');
    const credential = await signInWithEmailAndPassword(
      this.auth,
      email.trim(),
      password
    );
    onProgress?.('Saving your profile...');
    await this.syncProfile(credential.user);
    return credential.user;
  }

  async loginWithGoogle(onProgress?: AuthProgress): Promise<FirebaseUser> {
    onProgress?.('Waiting for Google...');
    const credential = await signInWithPopup(
      this.auth,
      new GoogleAuthProvider()
    );
    onProgress?.('Saving your profile...');
    await this.syncProfile(credential.user);
    return credential.user;
  }

  logout(): Promise<void> {
    return signOut(this.auth);
  }

  sendPasswordReset(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email.trim());
  }

  private async syncProfile(
    user: FirebaseUser,
    overrides?: { name?: string; phone?: string }
  ): Promise<void> {
    try {
      await this.writeProfile(user, overrides);
    } catch (error) {
      throw new ProfileSyncError(error);
    }
  }

  private async writeProfile(
    user: FirebaseUser,
    overrides?: { name?: string; phone?: string }
  ): Promise<void> {
    const name = (
      overrides?.name ??
      user.displayName ??
      user.email?.split('@')[0] ??
      'Customer'
    ).trim();
    const email = user.email ?? '';
    const phone = overrides?.phone?.trim() ?? '';

    const existing = await this.users.getUser(user.uid);

    if (!existing) {
      await this.users.createUser({
        uid: user.uid,
        name,
        email,
        phone,
        role: 'customer',
      });
      return;
    }

    const patch: Partial<User> = { name, email };
    if (phone) {
      patch.phone = phone;
    }
    await this.users.updateUser(user.uid, patch);
  }
}
