import { OrderItem } from '../types/order';

function normalizeStatus(status: string) {
  return (status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

const ORDER_STATUS_LABEL_MAP: Record<string, string> = {
  pending: '待处理',
  paid: '已付款',
  ready_to_ship: '待发货',
  shipped: '已发货',
  delivered: '已完成',
  cancelled: '已取消',
  awaiting_packaging: '待打包',
  acceptance_in_progress: '验收入库中',
  awaiting_deliver: '待揽收',
  delivering: '配送中',
  in_transit: '运输中',
  accepted: '已接单',
  not_accepted: '未接收',
  returned: '已退回',
  unfulfilled: '未履约',
  created: '已创建',
  processing: '处理中',
};

const ORDER_STATUS_CLASS_MAP: Record<string, string> = {
  pending: 'status-pending',
  awaiting_packaging: 'status-pending',
  acceptance_in_progress: 'status-pending',
  awaiting_deliver: 'status-ready',
  ready_to_ship: 'status-ready',
  paid: 'status-paid',
  accepted: 'status-paid',
  shipped: 'status-shipped',
  delivering: 'status-shipped',
  in_transit: 'status-shipped',
  delivered: 'status-delivered',
  returned: 'status-cancelled',
  cancelled: 'status-cancelled',
  not_accepted: 'status-cancelled',
  unfulfilled: 'status-cancelled',
};

export function getOrderStatusLabel(status: string) {
  const normalized = normalizeStatus(status);
  return ORDER_STATUS_LABEL_MAP[normalized] || status;
}

export function getOrderStatusClassName(status: string) {
  const normalized = normalizeStatus(status);
  return ORDER_STATUS_CLASS_MAP[normalized] || 'status-default';
}

export function getOrderStoreOptions(orders: OrderItem[]) {
  return Array.from(
    new Set(
      orders
        .map((order) => (order.storeClientId || '').trim())
        .filter((id) => id.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

export function filterOrders(params: {
  orders: OrderItem[];
  selectedStatus: string;
  selectedStore: string;
  searchKeyword: string;
  minAmount: string;
  maxAmount: string;
  startDate: string;
  endDate: string;
}) {
  const {
    orders,
    selectedStatus,
    selectedStore,
    searchKeyword,
    minAmount,
    maxAmount,
    startDate,
    endDate,
  } = params;

  let result = orders;

  if (selectedStatus !== 'all') {
    result = result.filter(
      (order) => normalizeStatus(order.status) === normalizeStatus(selectedStatus),
    );
  }

  if (selectedStore !== 'all') {
    result = result.filter(
      (order) =>
        (order.storeClientId || '').trim() === selectedStore ||
        String(order.storeId) === selectedStore ||
        order.storeName === selectedStore,
    );
  }

  const keyword = searchKeyword.trim().toLowerCase();
  if (keyword) {
    result = result.filter((order) => {
      return (
        order.orderNo.toLowerCase().includes(keyword) ||
        order.storeName.toLowerCase().includes(keyword)
      );
    });
  }

  const min = minAmount.trim() ? Number(minAmount) : null;
  const max = maxAmount.trim() ? Number(maxAmount) : null;

  if (min !== null && !Number.isNaN(min)) {
    result = result.filter((order) => order.totalAmount >= min);
  }

  if (max !== null && !Number.isNaN(max)) {
    result = result.filter((order) => order.totalAmount <= max);
  }

  if (startDate) {
    const start = new Date(`${startDate}T00:00:00`).getTime();
    result = result.filter((order) => {
      return new Date(order.createdAt).getTime() >= start;
    });
  }

  if (endDate) {
    const end = new Date(`${endDate}T23:59:59`).getTime();
    result = result.filter((order) => {
      return new Date(order.createdAt).getTime() <= end;
    });
  }

  return result;
}

export function paginateOrders(
  orders: OrderItem[],
  currentPage: number,
  pageSize: number,
) {
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  return orders.slice(start, end);
}

export function sumOrderAmounts(orders: OrderItem[]) {
  return orders.reduce((sum, order) => sum + order.totalAmount, 0);
}

export function exportOrdersToCsv(orders: OrderItem[]) {
  const headers = [
    '订单ID',
    '订单号',
    '店铺名称',
    '订单状态',
    '订单金额',
    '币种',
    '创建时间',
    '客户姓名',
    '国家',
    '城市',
    '地址',
    '商品数量',
    '备注',
  ];

  const rows = orders.map((order) => [
    order.id,
    order.orderNo,
    order.storeName,
    getOrderStatusLabel(order.status),
    order.totalAmount,
    order.currency,
    new Date(order.createdAt).toLocaleString(),
    order.customerName,
    order.country,
    order.city,
    order.address,
    order.itemCount,
    order.note,
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
