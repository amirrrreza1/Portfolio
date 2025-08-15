import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/Contexts/ThemeContext";

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
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
