import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CollectionReference,
  DocumentData,
  DocumentReference,
  collection,
  doc,
  getDoc,
  orderBy,
  query,
} from 'firebase/firestore';
import { FIREBASE_FIRESTORE } from '../core/firebase/firebase';
import { collectionData$, docData$ } from '../core/firebase/firestore.helpers';
import { Product } from '../models/product.model';

/**
 * Read-only Firestore access to products (storefront browsing).
 *
 * Product creation, updates and deletion are admin operations that go through
 * the BistroBuddies backend API, which verifies administrator privileges
 * server-side. Firestore security rules remain in place as defense in depth.
 */
@Injectable({ providedIn: 'root' })
export class ProductsService {
  private readonly db = inject(FIREBASE_FIRESTORE);

  private productsRef(): CollectionReference<DocumentData> {
    return collection(this.db, 'products');
  }

  private productRef(productId: string): DocumentReference {
    return doc(this.db, 'products', productId);
  }

  watchProducts(): Observable<Product[]> {
    const productsQuery = query(
      this.productsRef(),
      orderBy('createdAt', 'desc')
    );
    return collectionData$<Product>(productsQuery);
  }

  getProduct(productId: string): Promise<Product | null> {
    return getDoc(this.productRef(productId)).then((snapshot) =>
      snapshot.exists() ? (snapshot.data() as Product) : null
    );
  }

  watchProduct(productId: string): Observable<Product | null> {
    return docData$<Product>(this.productRef(productId));
  }
}
