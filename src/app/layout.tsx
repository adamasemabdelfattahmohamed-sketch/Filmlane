import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./ui-kit.css";
import { ThemeProvider } from "@/providers";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "أفان تيتر - محرر السيناريو السينمائي",
  description:
    "محرر سيناريو سينمائي احترافي للكتابة العربية مع دعم الذكاء الاصطناعي | منصة النسخة",
  keywords: ["سيناريو", "كتابة سينمائية", "محرر عربي", "أفان تيتر", "النسخة"],
  authors: [{ name: "فريق النسخة" }],
  creator: "النسخة - Alnuskha",
  publisher: "النسخة",

  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "ar_SA",
    url: "https://alnuskha.com",
    title: "أفان تيتر - محرر السيناريو السينمائي",
    description:
      "محرر سيناريو سينمائي احترافي للكتابة العربية مع دعم الذكاء الاصطناعي",
    siteName: "أفان تيتر",
  },
  twitter: {
    card: "summary_large_image",
    title: "أفان تيتر - محرر السيناريو السينمائي",
    description: "محرر سيناريو سينمائي احترافي للكتابة العربية",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#029784" },
    { media: "(prefers-color-scheme: dark)", color: "#029784" },
  ],
};

/**
 * تخطيط الجذر للتطبيق Next.js
 *
 * @description
 * يوفر التخطيط الأساسي للتطبيق مع إعدادات SEO والمواضيع واللغة العربية.
 * يشمل:
 * - metadata للصفحات مع دعم Open Graph و Twitter Cards
 * - إعدادات viewport للأجهزة المحمولة
 * - ThemeProvider لدعم الوضع المظلم
 * - Toaster للإشعارات
 * - اتجاه النص من اليمين لليسار (RTL)
 *
 * @param {Object} props - خصائص المكون
 * @param {React.ReactNode} props.children - المحتوى المراد عرضه داخل التخطيط
 * @returns {JSX.Element} عنصر HTML الكامل مع التخطيط والإعدادات
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className="bg-background font-[family-name:var(--font-family-ui)] text-foreground antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange={false}
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
