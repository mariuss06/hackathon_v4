import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: { default: "CrediFit — evaluare Credit Ready pentru IMM", template: "%s — CrediFit" },
  description:
    "CrediFit: profil Credit Ready pentru IMM-uri din România din date e-Factura pe 12 luni, 5 surse oficiale (ANAF, bilanț, VIES, ONRC, portal.just.ro), recomandări bancare și plan de acțiune 30–90 de zile.",
  applicationName: "CrediFit",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ro" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full overflow-x-clip">
        <LanguageProvider>
          <AuthProvider>{children}</AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
