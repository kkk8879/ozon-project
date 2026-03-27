export function getTotalPages(totalItems: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function paginateItems<T>(
  items: T[],
  currentPage: number,
  pageSize: number,
) {
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  return items.slice(start, end);
}

export function normalizeCurrentPage(currentPage: number, totalPages: number) {
  if (currentPage < 1) return 1;
  if (currentPage > totalPages) return totalPages;
  return currentPage;
}