"use client";
import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui";

const TABS = [
  { href: "/clients/companies", label: "Client companies" }, { href: "/clients/contacts", label: "Contacts" },
  { href: "/clients/vendors", label: "Vendors" }, { href: "/clients/services", label: "Price list" },
];

export function ClientsTabs() {
  const path = usePathname();
  return <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6"><Tabs tabs={TABS} current={path} /></div>;
}
