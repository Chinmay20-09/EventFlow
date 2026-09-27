import type { Metadata } from "next";
import "./globals.css";
import EventLive from './event-live';
import EventSidebar from "./event-sidebar";
import AppThemeProvider from "./theme-provider";

export const metadata: Metadata = {
  title: "EventFlow — Live Map",
  description: "Explore India, find destinations and compare routes with connected crowd intelligence.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased"><AppThemeProvider><EventLive><EventSidebar/><div className="site-shell">{children}</div></EventLive></AppThemeProvider></body>
    </html>
  );
}
