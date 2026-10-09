import type { Timestamp } from 'firebase/firestore';

export type ProductSize = 'small' | 'medium' | 'large';

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  imageUrl: string;
  cloudinaryPublicId: string;
  smallPrice: number;
  mediumPrice: number;
  largePrice: number;
  sugarOptions: string[];
  available: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;
