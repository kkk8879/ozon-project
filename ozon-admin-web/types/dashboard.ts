export type DashboardSummary = {
  totalStores: number;
  activeStores: number;
  inactiveStores: number;
  latestUpdatedStore: {
    id: number;
    name: string;
    updatedAt: string;
  } | null;
};