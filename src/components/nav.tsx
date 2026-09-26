"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icon.tsx";

const NAV_ITEMS = [
  { href: "/jobs", label: "Вакансии", icon: "briefcase" },
  { href: "/saved", label: "Сохранённое", icon: "bookmark" },
  { href: "/profile", label: "Профиль", icon: "user" },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav() {
  const pathname = usePathname();
  return <nav className="site-nav" aria-label="Основная навигация">
    {NAV_ITEMS.map(item => (
      <Link key={item.href} href={item.href}
        aria-current={isActive(pathname, item.href) ? "page" : undefined}>
        {item.label}
      </Link>
    ))}
  </nav>;
}

export function MobileNav() {
  const pathname = usePathname();
  return <nav className="mobile-nav" aria-label="Мобильная навигация">
    {NAV_ITEMS.map(item => (
      <Link key={item.href} href={item.href}
        aria-current={isActive(pathname, item.href) ? "page" : undefined}>
        <Icon name={item.icon} />
        {item.label}
      </Link>
    ))}
  </nav>;
}
