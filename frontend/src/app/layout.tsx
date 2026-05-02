import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "IndiaCircle - AI Trading Copilot for Indian Stock Market",
  description:
    "Auto-capture trades from 10+ Indian brokers. AI-powered insights, behavioral patterns, and smart risk assessment — all in one Chrome extension.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-white text-gray-900 antialiased`}>
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}
