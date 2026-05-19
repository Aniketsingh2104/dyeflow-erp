import type { Metadata } from "next";
import Navigation from "@/components/Navigation";
import DbProvider from "@/components/DbProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "DyeFlow ERP",
  description: "Complete ERP System for Dyeing Operations",
};

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
          <Navigation />
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {children}
          </div>
        </DbProvider>
      </body>
    </html>
  );
}
