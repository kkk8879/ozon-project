import { ReactNode } from 'react';

type DetailItem = {
  label: string;
  value: ReactNode;
  fullRow?: boolean;
};

type DetailCardProps = {
  title: string;
  items: DetailItem[];
  onClose: () => void;
};

export function DetailCard({
  title,
  items,
  onClose,
}: DetailCardProps) {
  return (
    <div className="detail-card">
      <div className="detail-header">
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button
          type="button"
          className="btn btn-default"
          onClick={onClose}
        >
          关闭详情
        </button>
      </div>

      <div className="detail-grid">
        {items.map((item) => (
          <div
            key={item.label}
            className={`detail-item ${item.fullRow ? 'detail-item-full' : ''}`}
          >
            <div className="detail-label">{item.label}</div>
            <div className="detail-value">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}