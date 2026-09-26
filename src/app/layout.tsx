import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Header, Footer } from "../components/shell.tsx";
import "./tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ненаугад — удалённая работа с понятными условиями", template: "%s · Ненаугад" },
  description: "Удалённые вакансии под ваш опыт и условия. Демо-каталог на синтетических данных; без автоматических откликов.",
  robots: { index: false, follow: false },
  icons: { icon: "/brand/favicon.svg" }
};

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="ru"><body>
    <Header />
    <main id="main" className="wrap page">{children}</main>
    <Footer />
  </body></html>;
}
