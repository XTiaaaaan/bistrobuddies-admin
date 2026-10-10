import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CollectionReference,
  DocumentData,
  collection,
} from 'firebase/firestore';
import { FIREBASE_FIRESTORE } from '../core/firebase/firebase';
import { collectionDataWithId$ } from '../core/firebase/firestore.helpers';
import { Order } from '../models/order.model';

/**
 * Read-only Firestore access to the `orders` collection.
 *
 * Reading orders from the browser is allowed for administrators by
 * `firestore.rules` (`orders` → `allow read: … || isAdmin()`), and
 * `../bistrobuddies-backend/docs/API_CONTRACT.md` §6 explicitly documents
 * Firestore reads as the order-list source until `GET /api/admin/orders`
 * exists. There is **no write here**: order status changes go through
 * `POST /api/admin/orders/:id/status` (see `AdminApiService`) and payment
 * status is backend-owned.
 */
@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly db = inject(FIREBASE_FIRESTORE);

  private ordersRef(): CollectionReference<DocumentData> {
    return collection(this.db, 'orders');
  }

  /**
   * Live list of all orders. Sorting (newest first) happens in the page so
   * documents without a `createdAt` value are not silently dropped by a
   * Firestore `orderBy`.
   */
  watchOrders(): Observable<Order[]> {
    return collectionDataWithId$<Order>(this.ordersRef());
  }
}
