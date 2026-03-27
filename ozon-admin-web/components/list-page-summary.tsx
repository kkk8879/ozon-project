type SummaryItem = {
  label: string;
  value: string | number;
};

type ListPageSummaryProps = {
  items: SummaryItem[];
};

export function ListPageSummary({ items }: ListPageSummaryProps) {
  return (
    <div className="order-result-summary">
      {items.map((item) => (
        <div key={item.label} className="order-result-item">
          {item.label}：<strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}