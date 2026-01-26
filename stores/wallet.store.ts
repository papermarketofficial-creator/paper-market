import { create } from "zustand";

/**
 * Wallet Store - Manages user wallet state
 * Fetches balance and transaction history from backend API
 */

export interface Transaction {
    id: string;
    userId: string;
    walletId: string;
    type: "CREDIT" | "DEBIT" | "BLOCK" | "UNBLOCK" | "SETTLEMENT";
    amount: string;
    balanceBefore: string;
    balanceAfter: string;
    blockedBefore: string;
    blockedAfter: string;
    referenceType: string | null;
    referenceId: string | null;
    description: string | null;
    createdAt: Date;
}

export interface WalletState {
    // Balance state
    balance: number;
    blockedBalance: number;
    availableBalance: number;
    currency: string;
    lastReconciled: Date | null;

    // Transaction history
    transactions: Transaction[];
    transactionsPagination: {
        page: number;
        limit: number;
        total: number;
    };

    // Loading states
    isLoadingBalance: boolean;
    isLoadingTransactions: boolean;

    // Error states
    balanceError: string | null;
    transactionsError: string | null;

    // Actions
    fetchWallet: () => Promise<void>;
    fetchTransactions: (filters?: TransactionFilters) => Promise<void>;
    resetWallet: () => void;
}

export interface TransactionFilters {
    type?: "CREDIT" | "DEBIT" | "BLOCK" | "UNBLOCK" | "SETTLEMENT";
    referenceType?: "ORDER" | "TRADE" | "POSITION";
    startDate?: string;
    endDate?: string;
    limit?: number;
    page?: number;
}

export const useWalletStore = create<WalletState>((set, get) => ({
    // Initial state
    balance: 0,
    blockedBalance: 0,
    availableBalance: 0,
    currency: "INR",
    lastReconciled: null,
    transactions: [],
    transactionsPagination: {
        page: 1,
        limit: 20,
        total: 0,
    },
    isLoadingBalance: false,
    isLoadingTransactions: false,
    balanceError: null,
    transactionsError: null,

    // Fetch wallet balance
    fetchWallet: async () => {
        set({ isLoadingBalance: true, balanceError: null });

        try {
            const response = await fetch("/api/v1/wallet");

            if (!response.ok) {
                throw new Error(`Failed to fetch wallet: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.success && result.data) {
                set({
                    balance: result.data.balance,
                    blockedBalance: result.data.blockedBalance,
                    availableBalance: result.data.availableBalance,
                    currency: result.data.currency,
                    lastReconciled: result.data.lastReconciled ? new Date(result.data.lastReconciled) : null,
                    isLoadingBalance: false,
                });
            } else {
                throw new Error("Invalid response format");
            }
        } catch (error) {
            console.error("Failed to fetch wallet:", error);
            set({
                balanceError: error instanceof Error ? error.message : "Failed to fetch wallet",
                isLoadingBalance: false,
            });
        }
    },

    // Fetch transaction history
    fetchTransactions: async (filters?: TransactionFilters) => {
        set({ isLoadingTransactions: true, transactionsError: null });

        try {
            // Build query string
            const params = new URLSearchParams();
            if (filters?.type) params.append("type", filters.type);
            if (filters?.referenceType) params.append("referenceType", filters.referenceType);
            if (filters?.startDate) params.append("startDate", filters.startDate);
            if (filters?.endDate) params.append("endDate", filters.endDate);
            if (filters?.limit) params.append("limit", filters.limit.toString());
            if (filters?.page) params.append("page", filters.page.toString());

            const queryString = params.toString();
            const url = `/api/v1/wallet/transactions${queryString ? `?${queryString}` : ""}`;

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Failed to fetch transactions: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.success && result.data) {
                set({
                    transactions: result.data.transactions.map((t: any) => ({
                        ...t,
                        createdAt: new Date(t.createdAt),
                    })),
                    transactionsPagination: result.data.pagination,
                    isLoadingTransactions: false,
                });
            } else {
                throw new Error("Invalid response format");
            }
        } catch (error) {
            console.error("Failed to fetch transactions:", error);
            set({
                transactionsError: error instanceof Error ? error.message : "Failed to fetch transactions",
                isLoadingTransactions: false,
            });
        }
    },

    // Reset wallet state (on logout)
    resetWallet: () => {
        set({
            balance: 0,
            blockedBalance: 0,
            availableBalance: 0,
            currency: "INR",
            lastReconciled: null,
            transactions: [],
            transactionsPagination: {
                page: 1,
                limit: 20,
                total: 0,
            },
            isLoadingBalance: false,
            isLoadingTransactions: false,
            balanceError: null,
            transactionsError: null,
        });
    },
}));
