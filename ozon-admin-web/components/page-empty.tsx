type PageEmptyProps = {
  text: string;
};

export function PageEmpty({ text }: PageEmptyProps) {
  return <div className="empty-box">{text}</div>;
}