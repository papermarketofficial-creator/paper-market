import { useQuery } from "@tanstack/react-query";
import type { DashboardOverviewResponse } from "@/types/dashboard.types";

async function fetchDashboardOverview() {
  const response = await fetch("/api/v1/dashboard/overview", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch dashboard overview (${response.status})`);
  }

  const json = (await response.json()) as DashboardOverviewResponse;
  if (!json?.success || !json?.data) {
    throw new Error("Invalid dashboard overview payload");
  }

  return json.data;
}

export function useDashboardOverview() {
  return useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: fetchDashboardOverview,
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}
