import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Header, Footer } from "../components/shell.tsx";
import "./tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Atlas — локальный старт", template: "%s · Atlas" },
  description: "Локальный шаблон Atlas. Синтетические вакансии, без реальных откликов и обработки резюме.",
  robots: { index: false, follow: false }
};

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="ru"><body>
    <Header />
    <main id="main" className="container">{children}</main>
    <Footer />
  </body></html>;
}
