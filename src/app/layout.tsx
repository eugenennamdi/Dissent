import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dissent | AI Trading Desk',
  description: 'Stress-test the trade before the market does.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
