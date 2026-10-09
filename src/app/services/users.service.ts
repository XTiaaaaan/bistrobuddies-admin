import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  DocumentReference,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { FIREBASE_FIRESTORE } from '../core/firebase/firebase';
import { docData$ } from '../core/firebase/firestore.helpers';
import { User, UserInput } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly db = inject(FIREBASE_FIRESTORE);

  private userRef(uid: string): DocumentReference {
    return doc(this.db, 'users', uid);
  }

  getUser(uid: string): Promise<User | null> {
    return getDoc(this.userRef(uid)).then((snapshot) =>
      snapshot.exists() ? (snapshot.data() as User) : null
    );
  }

  watchUser(uid: string): Observable<User | null> {
    return docData$<User>(this.userRef(uid));
  }

  createUser(input: UserInput): Promise<void> {
    return setDoc(this.userRef(input.uid), {
      ...input,
      role: input.role ?? 'customer',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  updateUser(uid: string, patch: Partial<User>): Promise<void> {
    return updateDoc(this.userRef(uid), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  }
}
