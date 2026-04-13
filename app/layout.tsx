import type { Metadata } from "next";
import { Inter } from "next/font/google";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "AHlogu",
  description: "Offline-first work logging application for field teams.",
  applicationName: "AHlogu",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AHlogu",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
