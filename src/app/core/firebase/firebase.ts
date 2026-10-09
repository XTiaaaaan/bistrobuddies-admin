import { InjectionToken } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';

export const FIREBASE_APP = new InjectionToken<FirebaseApp>(
  'bistrobuddies.firebase.app'
);
export const FIREBASE_AUTH = new InjectionToken<Auth>(
  'bistrobuddies.firebase.auth'
);
export const FIREBASE_FIRESTORE = new InjectionToken<Firestore>(
  'bistrobuddies.firebase.firestore'
);

function createFirebaseApp(): FirebaseApp {
  return initializeApp(environment.firebase);
}

function createAuth(app: FirebaseApp): Auth {
  return getAuth(app);
}

function createFirestore(app: FirebaseApp): Firestore {
  return getFirestore(app);
}

export const firebaseProviders = [
  { provide: FIREBASE_APP, useFactory: createFirebaseApp },
  { provide: FIREBASE_AUTH, useFactory: createAuth, deps: [FIREBASE_APP] },
  {
    provide: FIREBASE_FIRESTORE,
    useFactory: createFirestore,
    deps: [FIREBASE_APP],
  },
];
