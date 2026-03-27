import { AppShell } from '../components/app-shell';
import './globals.css';

export const metadata = {
  title: '雍金保理ozon电商管理系统',
  description: '雍金保理ozon电商管理系统',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

