// web/app/layout.tsx
import type { Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

// 1. Locks the screen scaling for phone screens and prevents iOS zoom-on-focus issues
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* 2. Added 'overflow-x-hidden w-full' and theme backgrounds to ensure smooth snapping */}
      <body className="antialiased overflow-x-hidden w-full bg-gray-50 dark:bg-gray-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
