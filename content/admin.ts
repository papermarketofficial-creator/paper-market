import { User } from '@/types/user.types';

export const mockUsers: User[] = [
  { id: '1', email: 'john@example.com', balance: 1000000, totalPnL: 15420, isAdmin: true },
  { id: '2', email: 'jane@example.com', balance: 950000, totalPnL: -50000, isAdmin: false },
  { id: '3', email: 'bob@example.com', balance: 1125000, totalPnL: 125000, isAdmin: false },
  { id: '4', email: 'alice@example.com', balance: 875000, totalPnL: -125000, isAdmin: false },
  { id: '5', email: 'charlie@example.com', balance: 1050000, totalPnL: 50000, isAdmin: false },
];