import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'customer' | 'admin';

export interface User {
  uid: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  role: UserRole;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type UserInput = Pick<User, 'uid' | 'name' | 'email'> &
  Partial<Pick<User, 'phone' | 'address' | 'role'>>;
