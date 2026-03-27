type PageLoadingProps = {
  text?: string;
};

export function PageLoading({
  text = '列表加载中...',
}: PageLoadingProps) {
  return <div className="empty-box">{text}</div>;
}