import type { Metadata, Viewport } from "next";
import Navigation from "@/components/Navigation";
import DbProvider from "@/components/DbProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "DyeFlow ERP",
  description: "Complete ERP System for Dyeing Operations",
};

// phones render at their real width (no 980 px desktop zoom-out)
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('dyeflow_theme'),p=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&p)){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}`
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        style={{ margin: 0, padding: 0, height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <DbProvider>
          {children}
        </DbProvider>
      </body>
    </html>
  );
}
