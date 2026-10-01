"use client";
import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui";

const TABS = [
  { href: "/crm/deals", label: "Deals" }, { href: "/crm/quotes", label: "Quotes" }, { href: "/crm/projects", label: "Projects" },
  { href: "/crm/renewals", label: "Renewals" }, { href: "/crm/contacts", label: "Contacts" }, { href: "/crm/companies", label: "Companies" },
  { href: "/crm/services", label: "Catalogue" }, { href: "/crm/vendors", label: "Vendors" },
];

export function CrmTabs() {
  const path = usePathname();
  if (/^\/crm\/quotes\/[^/]+\/print/.test(path)) return null;
  return <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6"><Tabs tabs={TABS} current={path} /></div>;
}
