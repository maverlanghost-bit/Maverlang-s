import type { Metadata } from "next";
import { connection } from "next/server";
import { site, siteOrigin } from "@/config/site";
import { geistMono, geistSans } from "./fonts";
import { Providers } from "./providers";
import "./globals.css";

const origin = siteOrigin();

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title: {
    default: site.name,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  openGraph: {
    type: "website",
    locale: "es_CL",
    url: origin,
    siteName: site.name,
    title: site.name,
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: site.name,
    description: site.description,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // M48: la CSP con nonce por solicitud exige render dinámico (guía de Next 16:
  // las páginas estáticas se prerenderizan sin nonce y `strict-dynamic`
  // bloquearía sus scripts). Toda la app pasa a dinámica; la portada pierde
  // su ISR de 30 s hasta que la CSP sea por hashes (SRI) o por ruta.
  await connection();
  return (
    <html
      lang="es-CL"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
