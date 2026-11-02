import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MUSE Nova — AI Workspace & Muse Studio',
  description: 'Multimodal MUSE Nova and an AI Studio-inspired workspace for Meta Muse models',
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
