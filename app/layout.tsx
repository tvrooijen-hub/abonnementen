import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Abonnementen',
  description: 'Beheer je abonnementen',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  )
}