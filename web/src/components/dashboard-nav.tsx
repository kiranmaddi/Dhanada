"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Contacts" },
  { href: "/dashboard/events", label: "Events" },
  { href: "/dashboard/invitees", label: "Invitees" },
  { href: "/dashboard/wishlist", label: "Wish List" },
  { href: "/dashboard/gifts", label: "Gifts" },
];

export default function DashboardNav({ displayName }: { displayName: string }) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  async function handleSignOut() {
    window.location.href = "/auth/sign-out";
  }

  return (
    <div className="page-wide">
      <div className="top-bar">
        <div>
          <div className="logo">Dhanada</div>
          <p className="subtitle">{displayName}</p>
        </div>
        <button className="btn-secondary" onClick={handleSignOut}>
          Sign Out
        </button>
      </div>

      <nav className="nav">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link${isActive(item.href) ? " active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
