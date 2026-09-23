import { listOrders } from "@/lib/store";
import { money, PRODUCT_LABELS } from "@/lib/pricing";
import { STATUS_LABELS } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET() {
  const orders = await listOrders({ limit: 5000 });
  const header = ["order_id", "created_at", "status", "assignee", "acknowledged_at", "product", "express", "lead_family_name", "lead_given_names", "nationality", "passport_number", "pax", "arrival_date", "port_of_entry", "flight", "email", "phone", "amount", "paid_at", "delivered_at", "ops_notes"];
  const rows = orders.map((o) => {
    const t = o.travelers[0];
    return [o.id, o.createdAt, STATUS_LABELS[o.status], o.assignee, o.acknowledgedAt, PRODUCT_LABELS[o.product], o.contact.express ? "yes" : "no", t.familyName, t.givenNames, t.nationality, t.passportNumber, o.travelers.length, o.travel.arrivalDate, o.travel.portOfEntry, o.travel.flightNumber, o.contact.email, o.contact.phone, money(o.amountCents, o.currency), o.paidAt, o.deliveredAt, o.opsNotes].map(q).join(",");
  });
  const csv = [header.join(","), ...rows].join("\r\n");
  return new Response("﻿" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}
