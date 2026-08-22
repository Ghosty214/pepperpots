import type { Metadata } from 'next';
import './globals.css';

const title = 'PEPPERPOTS — Build the life. Keep the streak.';
const description = 'A private two-person home system for quests, progress, projects, and plans.';

export const metadata: Metadata = {
  metadataBase: new URL('https://ghosty214.github.io/pepperpots/'),
  title,
  description,
  icons: { icon: '/pepperpots/public/og.png', apple: '/pepperpots/public/og.png' },
  openGraph: { title, description, type: 'website', images: [{ url: '/pepperpots/public/og.png', width: 1731, height: 908, alt: 'PEPPERPOTS — Build the life. Keep the streak.' }] },
  twitter: { card: 'summary_large_image', title, description, images: ['/pepperpots/public/og.png'] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
