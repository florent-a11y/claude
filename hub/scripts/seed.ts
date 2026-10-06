/**
 * Seed the database.
 *   npm run seed        → creates the first administrator from SEED_ADMIN_* env vars (if no users exist)
 *   npm run seed:demo   → also adds a demo client, contacts, workspaces, tasks, files and a flow
 */
import bcrypt from "bcryptjs";
import { db, one, run } from "../lib/db";
import { newId, nowIso } from "../lib/ids";
import { addDays, pickColor } from "../lib/format";

const demo = process.argv.includes("--demo");
const ts = nowIso();
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

async function user(name: string, email: string, password: string, role: "admin" | "member" | "client", title = "", clientId: string | null = null): Promise<string> {
  const existing = one<{ id: string }>("SELECT id FROM users WHERE email = ?", email);
  if (existing) return existing.id;
  const id = newId();
  run(
    "INSERT INTO users (id, name, email, password_hash, role, title, client_id, color, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
    id, name, email, await bcrypt.hash(password, 10), role, title, clientId, pickColor(email), ts,
  );
  console.log(`  user     ${name} <${email}> (${role})`);
  return id;
}

async function main() {
  db();
  const count = one<{ n: number }>("SELECT COUNT(*) AS n FROM users")!.n;
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "change-me-now";
  const adminName = process.env.SEED_ADMIN_NAME || "Administrator";

  let adminId: string;
  if (count === 0) {
    console.log("Creating first administrator…");
    adminId = await user(adminName, adminEmail, adminPassword, "admin", "Managing Director");
    console.log(`  → sign in with ${adminEmail} / ${adminPassword} and change the password in Settings.`);
  } else {
    adminId = one<{ id: string }>("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1")?.id ?? one<{ id: string }>("SELECT id FROM users LIMIT 1")!.id;
    console.log("Users already exist; keeping them.");
  }

  if (!demo) return;
  if (one("SELECT 1 FROM clients WHERE name = 'Acme Hospitality Group'")) {
    console.log("Demo data already present.");
    return;
  }
  console.log("Adding demo data…");

  const member1 = await user("Sari Dewi", "sari@example.com", "password123", "member", "Senior Consultant");
  const member2 = await user("Marc Leroy", "marc@example.com", "password123", "member", "Accountant");

  const clientA = newId();
  run("INSERT INTO clients (id, name, industry, website, email, phone, address, notes, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    clientA, "Acme Hospitality Group", "Hospitality", "https://acme-hospitality.example", "ops@acme-hospitality.example", "+62 361 000 000", "Jl. Sunset Road 1, Seminyak, Bali", "Decision maker is Putri. Prefers WhatsApp for urgent matters. Billing in USD.", pickColor("acme"), ago(40));
  const clientB = newId();
  run("INSERT INTO clients (id, name, industry, website, email, phone, address, notes, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    clientB, "Nordic Ventures AS", "Investment", "https://nordicventures.example", "", "", "Oslo, Norway", "", pickColor("nordic"), ago(20));
  console.log("  clients  Acme Hospitality Group, Nordic Ventures AS");

  const putri = await user("Putri Anggraini", "putri@acme-hospitality.example", "password123", "client", "Operations Director", clientA);
  const erik = await user("Erik Hansen", "erik@nordicventures.example", "password123", "client", "Partner", clientB);

  const flowId = newId();
  run("INSERT INTO templates (id, name, description, steps, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    flowId, "PT PMA company incorporation", "Standard steps to set up a foreign-owned company in Indonesia.",
    JSON.stringify([
      { type: "file_request", title: "Passport copies of all shareholders and directors", description: "Colour scans, valid for at least 18 months.", due_in_days: 3, assign_to: "client", internal: false },
      { type: "task", title: "Draft the deed of establishment", description: "", due_in_days: 7, assign_to: "team", internal: true },
      { type: "approval", title: "Approve the company name and share structure", description: "", due_in_days: 9, assign_to: "client", internal: false },
      { type: "task", title: "Notary appointment", description: "", due_in_days: 14, assign_to: "team", internal: false },
      { type: "task", title: "Obtain NIB and business licences via OSS", description: "", due_in_days: 25, assign_to: "team", internal: false },
      { type: "task", title: "Open the corporate bank account", description: "", due_in_days: 35, assign_to: "client", internal: false },
    ]), adminId, ts);
  console.log("  flow     PT PMA company incorporation");

  function workspace(name: string, clientId: string | null, description: string, status: string, due: string | null, lastActivity: string, members: string[]): string {
    const id = newId();
    run("INSERT INTO workspaces (id, name, description, client_id, status, owner_id, due_date, created_at, updated_at, last_activity_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, name, description, clientId, status, adminId, due, lastActivity, lastActivity, lastActivity);
    for (const m of members) run("INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, joined_at) VALUES (?, ?, ?)", id, m, lastActivity);
    console.log(`  workspace ${name}`);
    return id;
  }
  function msg(ws: string, who: string | null, body: string, at: string, opts: { internal?: boolean; system?: boolean } = {}) {
    run("INSERT INTO messages (id, workspace_id, user_id, kind, body, internal, file_id, ref_type, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)",
      newId(), ws, who, opts.system ? "system" : "text", body, opts.internal ? 1 : 0, at);
  }
  function task(ws: string, title: string, assignee: string | null, due: string | null, status: string, priority = "normal", internal = false, kind = "task") {
    run("INSERT INTO tasks (id, workspace_id, title, description, kind, assignee_id, due_date, status, priority, internal, created_by, created_at, updated_at, completed_at) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      newId(), ws, title, kind, assignee, due, status, priority, internal ? 1 : 0, adminId, ago(5), ago(1), status === "done" ? ago(1) : null);
  }

  const ws1 = workspace("Villa management licence renewal", clientA, "Renew the tourism business licence for the three Seminyak villas before the end of the quarter.", "active", addDays(21), ago(0.2), [adminId, member1, putri]);
  msg(ws1, adminId, "created this workspace", ago(12), { system: true });
  msg(ws1, adminId, "Hi Putri, welcome to your workspace. We will keep everything about the licence renewal here: documents, tasks and approvals.", ago(12));
  msg(ws1, putri, "Perfect, thank you! I'll upload the current licences tomorrow.", ago(11.8));
  msg(ws1, member1, "Reminder for us: the regency office now asks for the updated land certificate too.", ago(6), { internal: true });
  msg(ws1, putri, "Uploaded the three licences. Let me know if anything is missing.", ago(2));
  msg(ws1, adminId, "Received, thanks. We are preparing the renewal forms now and will send you the summary to approve by Friday.", ago(0.2));
  task(ws1, "Collect current licences from client", putri, addDays(-3), "done", "normal", false, "file_request");
  task(ws1, "Prepare renewal forms for the three villas", member1, addDays(2), "in_progress", "high");
  task(ws1, "Check land certificate validity at BPN", member1, addDays(5), "todo", "normal", true);
  task(ws1, "Submit the renewal file at the regency office", adminId, addDays(10), "todo");
  run("INSERT INTO approvals (id, workspace_id, title, description, requested_by, approver_id, file_id, status, decision_note, due_date, decided_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', '', ?, NULL, ?)",
    newId(), ws1, "Approve the renewal fee quotation", "Government fees plus our service fee for the three licences.", adminId, putri, addDays(4), ago(1));

  const ws2 = workspace("PT PMA incorporation — Nordic Ventures", clientB, "Set up the Indonesian entity for the Bali co-working project.", "active", addDays(45), ago(7), [adminId, member2, erik]);
  msg(ws2, adminId, "created this workspace", ago(15), { system: true });
  msg(ws2, erik, "Hello team, looking forward to getting started. Which documents do you need from our side first?", ago(14));
  msg(ws2, adminId, "Welcome Erik! I've added the file requests to the Tasks tab, starting with passport copies of the shareholders.", ago(13.9));
  msg(ws2, adminId, "Internal: Erik's co-founder is still deciding on the share split, expect a delay on the deed.", ago(7), { internal: true });
  task(ws2, "Passport copies of all shareholders and directors", erik, addDays(-4), "todo", "high", false, "file_request");
  task(ws2, "Draft the deed of establishment", member2, addDays(3), "todo", "normal", true);
  task(ws2, "Notary appointment", adminId, addDays(12), "todo");

  const ws3 = workspace("Monthly bookkeeping — Acme", clientA, "Recurring bookkeeping and tax filing.", "active", null, ago(1), [adminId, member2, putri]);
  msg(ws3, adminId, "created this workspace", ago(30), { system: true });
  msg(ws3, member2, "September bank statements received, reconciliation in progress.", ago(1));
  task(ws3, "Reconcile September accounts", member2, addDays(1), "in_progress");
  task(ws3, "File monthly VAT return", member2, addDays(6), "todo", "high");
  task(ws3, "Send September management report to client", adminId, addDays(8), "todo");

  const ws4 = workspace("Website redesign brief", null, "Internal project: refresh our own website.", "on_hold", null, ago(9), [adminId, member1]);
  msg(ws4, adminId, "created this workspace", ago(25), { system: true });
  msg(ws4, member1, "Parked until Q1; the agency quotes are in the Files tab.", ago(9));

  const ws5 = workspace("Work permit — General Manager", clientA, "KITAS and work permit for the new GM.", "completed", addDays(-10), ago(12), [adminId, member1, putri]);
  msg(ws5, adminId, "created this workspace", ago(60), { system: true });
  msg(ws5, adminId, "changed the status to completed", ago(12), { system: true });
  task(ws5, "Collect the GM's documents", putri, addDays(-40), "done", "normal", false, "file_request");
  task(ws5, "Submit the work permit application", member1, addDays(-25), "done");
  run("INSERT INTO approvals (id, workspace_id, title, description, requested_by, approver_id, file_id, status, decision_note, due_date, decided_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 'approved', 'Looks good, go ahead.', ?, ?, ?)",
    newId(), ws5, "Approve the job description for the permit", "", adminId, putri, addDays(-30), ago(31), ago(33));

  run("INSERT INTO notifications (id, user_id, title, body, href, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
    newId(), adminId, "Putri Anggraini in Villa management licence renewal", "Uploaded the three licences. Let me know if anything is missing.", `/workspaces/${ws1}`, ago(2));
  run("INSERT INTO notifications (id, user_id, title, body, href, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
    newId(), putri, "Approval requested in Villa management licence renewal", "Approve the renewal fee quotation", `/workspaces/${ws1}/approvals`, ago(1));

  function conversation(kind: "direct" | "group", title: string, memberIds: string[], lines: [string, string, string][]): string {
    const id = newId();
    const last = lines.at(-1)?.[2] ?? ts;
    run("INSERT INTO conversations (id, kind, title, created_by, created_at, last_message_at) VALUES (?, ?, ?, ?, ?, ?)", id, kind, title, memberIds[0], lines[0]?.[2] ?? ts, last);
    for (const uid of memberIds) {
      // the first member (the admin) has not read the latest message yet, so the demo shows an unread badge
      run("INSERT INTO conversation_members (conversation_id, user_id, joined_at, last_read_at) VALUES (?, ?, ?, ?)", id, uid, lines[0]?.[2] ?? ts, uid === memberIds[0] ? (lines.at(-2)?.[2] ?? ts) : last);
    }
    for (const [who, body, at] of lines) {
      run("INSERT INTO direct_messages (id, conversation_id, user_id, body, file_id, created_at) VALUES (?, ?, ?, ?, NULL, ?)", newId(), id, who, body, at);
    }
    return id;
  }
  conversation("direct", "", [adminId, putri], [
    [putri, "Hi Florent, quick question outside the licence project: can you recommend a payroll provider for the villas?", ago(3)],
    [adminId, "Of course. I'll send you two options we work with, with pricing, by tomorrow.", ago(2.9)],
    [putri, "Perfect, thank you!", ago(0.5)],
  ]);
  conversation("direct", "", [adminId, member1], [
    [member1, "Are you in the office on Thursday? I'd like to go through the Nordic deed together.", ago(1.2)],
    [adminId, "Yes, from 10. Book 30 minutes.", ago(1.1)],
    [member1, "Done 👍", ago(1)],
  ]);
  conversation("group", "Acme account team", [adminId, member1, member2], [
    [adminId, "Reminder: Acme's quarterly review is on the 20th. Sari covers licences, Marc the numbers.", ago(4)],
    [member2, "Management report draft will be ready on the 15th.", ago(3.8)],
  ]);
  console.log("  messages  3 conversations");

  console.log("Done. Demo logins (password: password123): sari@example.com, marc@example.com, putri@acme-hospitality.example, erik@nordicventures.example");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
