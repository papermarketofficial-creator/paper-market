import { QueryClient, keepPreviousData } from '@tanstack/react-query';

// ═══════════════════════════════════════════════════════════
// 🔧 QUERY CLIENT CONFIGURATION
// ═══════════════════════════════════════════════════════════
// Singleton QueryClient with optimal defaults for trading app

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // ✅ Data is fresh for 30 seconds (no refetch during this time)
      staleTime: 30 * 1000,
      
      // ✅ Keep unused data in cache for 5 minutes
      gcTime: 5 * 60 * 1000, // Previously called 'cacheTime' in v4
      
      // ✅ Refetch when user returns to tab (catches updates from other tabs)
      refetchOnWindowFocus: true,
      
      // ✅ Refetch when network reconnects
      refetchOnReconnect: true,
      
      // ✅ Refetch when component mounts if data is stale
      refetchOnMount: true,
      
      // ❌ Don't retry failed requests automatically (trading data should fail fast)
      retry: false,
      
      // ✅ Show stale data while refetching (instant UI)
      placeholderData: keepPreviousData,
    },
    mutations: {
      // ❌ Don't retry mutations (add/remove should be explicit)
      retry: false,
    },
  },
});
