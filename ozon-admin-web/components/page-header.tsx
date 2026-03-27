import { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  description?: string;
  rightSlot?: ReactNode;
};

export function PageHeader({
  title,
  description,
  rightSlot,
}: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-desc">{description}</p> : null}
      </div>

      {rightSlot ? <div className="page-header-right">{rightSlot}</div> : null}
    </div>
  );
}