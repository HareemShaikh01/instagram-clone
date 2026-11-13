import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { ConfirmProvider } from "@/components/modal";

export const metadata: Metadata = {
  title: "Instagram Clone",
  description: "A full-stack Instagram-inspired social app",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

const themeScript = `(function(){try{var t=localStorage.getItem("ig-theme")||"system";var d=t==="system"?window.matchMedia("(prefers-color-scheme: dark)").matches:t==="dark";document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
