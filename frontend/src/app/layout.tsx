import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "IndiaCircle - Market Intelligence + Behavioral Coaching for Indian Retail Traders",
  description:
    "Market intelligence during the session. Behavioral coaching after the close. IndiaCircle helps Indian retail traders review context, discipline, and repeat mistakes without sharing broker credentials.",
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
