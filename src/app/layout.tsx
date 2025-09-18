import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/Contexts/ThemeContext";
import MainLayout from "@/Components/Layout/MainLayout";
import { ToastProvider } from "@/Components/Toast/Toast";

export const metadata: Metadata = {
  title: "Amirreza Azarioun",
  description: "Amirreza Azarioun's portfolio site",
  keywords: [
    "Amirreza Azarioun",
    "Portfolio",
    "Web Developer",
    "Frontend",
    "React",
    "Next.js",
    "JavaScript",
    "TypeScript",
  ],
  authors: [{ name: "Amirreza Azarioun" }],
  creator: "Amirreza Azarioun",
  publisher: "Amirreza Azarioun",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <ToastProvider>
            <MainLayout>{children}</MainLayout>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
