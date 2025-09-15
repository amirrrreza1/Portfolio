import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/Contexts/ThemeContext";
import MainLayout from "@/Components/Layout/MainLayout";
import { ToastProvider } from "@/Components/Toast/Toast";
import SmoothLayout from "@/Components/SmoothScroll/SmoothScroll";

export const metadata: Metadata = {
  title: "Amirreza Azarioun",
  description: "Amirreza Azarioun's portfolio site",
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
            <SmoothLayout>
              <MainLayout>{children}</MainLayout>
            </SmoothLayout>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
