import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "P2P Share - Chatroom Voice & Video",
  description:
    "Professional room-based chat with admin-controlled WebRTC voice/video calls and real-time connection diagnostics.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
