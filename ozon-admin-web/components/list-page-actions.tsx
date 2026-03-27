import { ReactNode } from 'react';

type ListPageActionsProps = {
  children: ReactNode;
};

export function ListPageActions({ children }: ListPageActionsProps) {
  return <div className="order-filter-actions">{children}</div>;
}