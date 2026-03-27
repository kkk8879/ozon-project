import { StoreItem } from '../types/store';

export function filterStores(params: {
  stores: StoreItem[];
  searchKeyword: string;
  selectedStatus: string;
}) {
  const { stores, searchKeyword, selectedStatus } = params;

  let result = stores;

  if (selectedStatus === 'active') {
    result = result.filter((store) => store.isActive);
  }

  if (selectedStatus === 'inactive') {
    result = result.filter((store) => !store.isActive);
  }

  const keyword = searchKeyword.trim().toLowerCase();

  if (!keyword) return result;

  return result.filter((store) => {
    return (
      store.name.toLowerCase().includes(keyword) ||
      store.clientId.toLowerCase().includes(keyword) ||
      String(store.id).includes(keyword)
    );
  });
}

export function paginateStores(
  stores: StoreItem[],
  currentPage: number,
  pageSize: number,
) {
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  return stores.slice(start, end);
}

export function getStoreStats(stores: StoreItem[]) {
  const total = stores.length;
  const active = stores.filter((store) => store.isActive).length;
  const inactive = stores.filter((store) => !store.isActive).length;

  return {
    total,
    active,
    inactive,
  };
}

export function exportStoresToCsv(stores: StoreItem[]) {
  const headers = [
    '店铺ID',
    '店铺名称',
    'Client ID',
    'API Key',
    '状态',
    '创建时间',
    '更新时间',
  ];

  const rows = stores.map((store) => [
    store.id,
    store.name,
    store.clientId,
    store.apiKey,
    store.isActive ? '启用' : '停用',
    new Date(store.createdAt).toLocaleString(),
    new Date(store.updatedAt).toLocaleString(),
  ]);

  const csvContent = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '');
          const escaped = value.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(','),
    )
    .join('\n');

  return '\uFEFF' + csvContent;
}

export function downloadCsvFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
