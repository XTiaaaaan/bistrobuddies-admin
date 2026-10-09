import { Observable } from 'rxjs';
import {
  DocumentData,
  DocumentReference,
  Query,
  onSnapshot,
} from 'firebase/firestore';

export function docData$<T>(ref: DocumentReference<DocumentData>): Observable<T | null> {
  return new Observable<T | null>((subscriber) => {
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => subscriber.next((snapshot.data() as T | undefined) ?? null),
      (error) => subscriber.error(error)
    );
    return unsubscribe;
  });
}

export function collectionData$<T>(
  queryRef: Query<DocumentData>
): Observable<T[]> {
  return new Observable<T[]>((subscriber) => {
    const unsubscribe = onSnapshot(
      queryRef,
      (snapshot) =>
        subscriber.next(snapshot.docs.map((snap) => snap.data() as T)),
      (error) => subscriber.error(error)
    );
    return unsubscribe;
  });
}
