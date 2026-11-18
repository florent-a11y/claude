import { notFound } from "next/navigation";
import { getOrder } from "@/lib/store";
import { canReview, staff } from "@/lib/admin";
import { STAFF_TRANSITIONS } from "@/lib/orders";
import { customerMessage, type CustomerEmail } from "@/lib/email";
import { orderUrl } from "@/lib/links";
import { idr } from "@/lib/money";
import { ageOn, type Order, type OrderStatus } from "@/lib/schema";
import { baliToday } from "@/lib/config";
import { METHOD_LABEL, STATUS_LABEL, STATUS_TONE, baliTime, waDigits } from "@/lib/admin-ui";
import { markPaidAction, notesAction, reviewAction, statusAction } from "../../actions";

export const dynamic = "force-dynamic";

const CONDITION_LABEL: Record<string, string> = {
  heart: "Heart disease / rhythm problems", blood_pressure: "High blood pressure", kidney: "Kidney disease", liver: "Liver disease", diabetes: "Diabetes",
  cancer: "Cancer (now or past)", clotting: "Blood clots / bleeding disorder", g6pd: "G6PD deficiency", autoimmune: "Autoimmune / immunosuppressants",
  pregnant: "Pregnant, possibly pregnant or breastfeeding", none: "None declared",
};
const TRANSITION_LABEL: Partial<Record<OrderStatus, string>> = {
  out_for_delivery: "Nurse / courier on the way", completed: "Mark completed", cancelled: "Cancel order", refunded: "Mark refunded",
  confirmed: "Back to confirmed", awaiting_payment: "Reject proof, ask again",
};

/** Which message fits the order right now (for the WhatsApp button). */
function messageKind(o: Order): CustomerEmail | null {
  switch (o.status) {
    case "awaiting_review": return "received";
    case "awaiting_payment": return o.review ? "approved" : "received";
    case "declined": return "declined";
    case "confirmed": return o.paid ? "confirmed" : "received";
    case "out_for_delivery": return "onTheWay";
    default: return null;
  }
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-mist-200 bg-white p-5">
      <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-ink-500">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();
  const who = await staff();
  const doctor = canReview(who);
  const kind = messageKind(order);
  const message = kind ? await customerMessage(order, kind) : null;
  const wa = message ? `https://wa.me/${waDigits(order.contact.phone)}?text=${encodeURIComponent([...message.paragraphs, message.url].join("\n\n"))}` : `https://wa.me/${waDigits(order.contact.phone)}`;
  const transitions = STAFF_TRANSITIONS[order.status] ?? [];
  const rxLines = order.lines.filter((l) => l.rx);
  const h = order.health;
  const f = order.fulfilment;

  return (
    <>
      <a href="/admin" className="text-sm font-semibold text-deep-700 underline underline-offset-2">← All orders</a>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl font-semibold text-deep-900">{order.id}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE[order.status]}`}>{STATUS_LABEL[order.status]}</span>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${order.paid ? "bg-tide-200 text-deep-900" : "bg-mist-200 text-ink-700"}`}>{order.paid ? "Paid" : "Unpaid"}</span>
        <span className="text-sm text-ink-500">placed {baliTime(order.createdAt)} (Bali time)</span>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Doctor review */}
          {(order.status === "awaiting_review" || h) && (
            <Card title="Medical">
              {!doctor ? (
                <p className="text-sm text-ink-700">
                  {order.status === "awaiting_review" ? "Waiting for the doctor's decision. " : ""}
                  The health questionnaire is visible to the doctor sign-in only.
                </p>
              ) : (
                <>
                  {h ? (
                    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                      <div><dt className="text-ink-500">Age / date of birth</dt><dd className="font-semibold">{ageOn(h.dob, baliToday())} years ({h.dob})</dd></div>
                      <div><dt className="text-ink-500">Sex / weight</dt><dd className="font-semibold">{h.sex}{h.weightKg ? `, ${h.weightKg} kg` : ""}</dd></div>
                      <div className="sm:col-span-2">
                        <dt className="text-ink-500">Conditions declared</dt>
                        <dd className="mt-1 flex flex-wrap gap-1.5">
                          {h.conditions.map((c) => <span key={c} className={`rounded-full px-2.5 py-1 text-xs font-bold ${c === "none" ? "bg-tide-100 text-deep-700" : "bg-coral-50 text-coral-600"}`}>{CONDITION_LABEL[c] ?? c}</span>)}
                        </dd>
                      </div>
                      <div className="sm:col-span-2"><dt className="text-ink-500">Allergies</dt><dd className="whitespace-pre-line font-semibold">{h.allergies}</dd></div>
                      <div className="sm:col-span-2"><dt className="text-ink-500">Medication and supplements</dt><dd className="whitespace-pre-line font-semibold">{h.medications}</dd></div>
                      <div className="sm:col-span-2"><dt className="text-ink-500">Goals / notes for the doctor</dt><dd className="whitespace-pre-line font-semibold">{h.goals || "—"}</dd></div>
                    </dl>
                  ) : <p className="text-sm text-ink-500">No questionnaire on this order.</p>}

                  {order.status === "awaiting_review" && (
                    <form action={reviewAction} className="mt-6 border-t border-mist-200 pt-5">
                      <input type="hidden" name="id" value={order.id} />
                      <fieldset>
                        <legend className="text-sm font-semibold text-deep-900">Prescription items requested (untick to refuse an item)</legend>
                        <div className="mt-2 space-y-2">
                          {rxLines.map((l) => (
                            <label key={l.slug} className="flex items-center gap-2.5 text-sm">
                              <input type="checkbox" name="approve" value={l.slug} defaultChecked className="checkbox" />
                              {l.qty} × {l.name}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <label className="label mt-4" htmlFor="review-note">Note to the patient (shown on their order page, in your words)</label>
                      <textarea id="review-note" name="note" className="input min-h-24" maxLength={1000} placeholder="Dose, timing, what to watch for, or why an item was not approved." />
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button type="submit" name="decision" value="approve" className="btn-primary btn-sm">Approve ticked items</button>
                        <button type="submit" name="decision" value="decline" className="btn-secondary btn-sm">Decline all prescription items</button>
                      </div>
                      <p className="hint mt-3">The patient is not charged before approval. After approval they receive a link to pay.</p>
                    </form>
                  )}
                </>
              )}
              {order.review && (
                <p className="mt-4 border-t border-mist-200 pt-4 text-sm text-ink-700">
                  <span className="font-semibold">{order.review.decision.replace("_", " ")}</span> by {order.review.by} on {baliTime(order.review.at)}
                  {order.review.note ? <><br /><span className="text-ink-500">Note to patient:</span> {order.review.note}</> : null}
                </p>
              )}
            </Card>
          )}

          <Card title="Items">
            <ul className="divide-y divide-mist-200 text-sm">
              {order.lines.map((l) => (
                <li key={l.slug} className="flex justify-between gap-4 py-2.5">
                  <span>{l.qty} × <span className="font-semibold">{l.name}</span>{l.rx ? <span className="ml-2 rounded-full bg-coral-50 px-2 py-0.5 text-xs font-bold text-coral-600">Rx</span> : null}{l.session ? <span className="ml-2 rounded-full bg-tide-100 px-2 py-0.5 text-xs font-bold text-deep-700">nurse</span> : null}</span>
                  <span>{idr(l.unitIdr * l.qty)}</span>
                </li>
              ))}
              {order.removedLines?.map((l) => (
                <li key={`x-${l.slug}`} className="flex justify-between gap-4 py-2.5 text-ink-500 line-through"><span>{l.qty} × {l.name}</span><span>not approved</span></li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-mist-200 pt-3 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{idr(order.subtotalIdr)}</dd></div>
              {order.deliveryIdr > 0 && <div className="flex justify-between"><dt>Delivery</dt><dd>{idr(order.deliveryIdr)}</dd></div>}
              {order.calloutIdr > 0 && <div className="flex justify-between"><dt>Nurse call-out</dt><dd>{idr(order.calloutIdr)}</dd></div>}
              <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{idr(order.totalIdr)}</dd></div>
            </dl>
          </Card>

          <Card title="Payment">
            <p className="text-sm text-ink-700">
              {order.paid ? `Paid ${order.paidAt ? baliTime(order.paidAt) : ""}` : "Not paid yet"}
              {order.paymentMethod ? ` · ${METHOD_LABEL[order.paymentMethod]}` : ""}
            </p>
            {order.proofId && <p className="mt-2 text-sm"><a className="font-semibold text-deep-700 underline underline-offset-2" href={`/api/admin/proof/${order.proofId}`} target="_blank" rel="noopener noreferrer">Open the transfer proof</a></p>}
            {!order.paid && ["awaiting_payment", "payment_review", "confirmed", "out_for_delivery", "completed"].includes(order.status) && (
              <form action={markPaidAction} className="mt-4 flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={order.id} />
                <div>
                  <label className="label" htmlFor="paid-method">Money received by</label>
                  <select id="paid-method" name="method" className="input py-2" defaultValue={order.paymentMethod ?? "transfer"}>
                    <option value="transfer">Bank transfer (checked in the bank account)</option>
                    <option value="cod">Cash / QRIS / card machine on delivery</option>
                    <option value="xendit">Xendit (confirmed in the Xendit dashboard)</option>
                    <option value="airwallex">Airwallex (confirmed in the Airwallex dashboard)</option>
                  </select>
                </div>
                <button type="submit" className="btn-primary btn-sm">Confirm payment received</button>
              </form>
            )}
          </Card>

          <Card title="Activity">
            <ol className="space-y-1.5 text-sm text-ink-700">
              {order.activity.map((a, i) => <li key={i}><span className="text-ink-500">{baliTime(a.at)}</span> · <span className="font-semibold">{a.by}</span> · {a.action}</li>)}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Customer">
            <p className="font-semibold text-deep-900">{order.contact.name}</p>
            <p className="mt-1 text-sm text-ink-700">{order.contact.phone}<br />{order.contact.email}<br />Language: {order.contact.locale.toUpperCase()}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a className="btn-primary btn-sm" href={wa} target="_blank" rel="noopener noreferrer">{message ? "WhatsApp: send status + link" : "Open WhatsApp"}</a>
              <a className="btn-secondary btn-sm" href={orderUrl(order)} target="_blank" rel="noopener noreferrer">Customer's order page</a>
            </div>
          </Card>

          <Card title="Where and when">
            <p className="text-sm text-ink-700">
              <span className="font-semibold text-deep-900">{f.mode === "address" ? `Address · ${f.area}` : "At the lounge"}</span>
              {f.address ? <><br /><span className="whitespace-pre-line">{f.address}</span></> : null}
              <br />{f.date ? `${f.date} · ${f.slot ?? "no window chosen"}` : "Time to agree on WhatsApp"}
              {f.notes ? <><br /><span className="text-ink-500">Customer note:</span> {f.notes}</> : null}
            </p>
          </Card>

          {transitions.length > 0 && (
            <Card title="Move the order">
              <div className="flex flex-wrap gap-2">
                {transitions.map((s) => (
                  <form key={s} action={statusAction}>
                    <input type="hidden" name="id" value={order.id} />
                    <input type="hidden" name="status" value={s} />
                    <button type="submit" className={s === "cancelled" || s === "refunded" ? "btn-secondary btn-sm" : "btn-primary btn-sm"}>{TRANSITION_LABEL[s] ?? STATUS_LABEL[s]}</button>
                  </form>
                ))}
              </div>
              <p className="hint mt-3">Refunds are made in the payment provider or bank; this only records them.</p>
            </Card>
          )}

          <Card title="Team notes (never shown to the customer)">
            <form action={notesAction}>
              <input type="hidden" name="id" value={order.id} />
              <textarea name="notes" aria-label="Team notes" className="input min-h-28" maxLength={4000} defaultValue={order.opsNotes ?? ""} />
              <button type="submit" className="btn-secondary btn-sm mt-3">Save notes</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
