# Migrating from Moxo to Hub

A practical runbook for a small consulting team moving its client work out of Moxo (moxo.com, formerly
Moxtra) into Hub. It covers what you can get out of Moxo and how, the order to do things in, what maps
to what, what cannot be moved faithfully, the cutover, a checklist and an effort estimate. The bulk
importer that goes with it is `scripts/import-csv.ts` (columns in [section 9](#9-the-csv-importer)).

> **How this was researched.** Moxo's help center (`support.moxo.com`), developer portal and website
> could not be opened directly from where this was written; the facts below come from search-engine
> extracts of those pages and are marked **confirmed** (quoted from a Moxo page), **likely** (follows
> the same pattern as a confirmed feature but the page itself was not read) or **unknown**. Before you
> start, spend 15 minutes in your own Moxo admin console checking the **likely/unknown** items, and send
> the questions in [section 2.8](#28-questions-to-ask-moxo-support) to Moxo support.

---

## 1. Before you start

- You need a Moxo **org administrator** login (the **Manage** area must be visible in the top bar).
- Hub must be running with its first administrator created (Set up page, or `SEED_ADMIN_*` +
  `npm run seed`). Decide the URL clients will use (e.g. `hub.ilaglobalconsulting.com`) and have HTTPS on
  before any client gets a login.
- Create a working folder, e.g. `moxo-export/`, with one sub-folder per workspace. Everything you pull
  out of Moxo goes there first; nothing goes into Hub by hand until the CSVs are ready.
- Nominate one person as migration owner. Two people doing the per-workspace export in parallel is
  fine; two people editing the same CSV is not.

## 2. What to export from Moxo, and how

### 2.1 Admin reports (lists of clients, users, workspaces, actions)

**Confirmed.** Moxo's admin area has a **Reports** section: *Manage* (top bar) → *Reports* (left panel),
with these reports: **Clients**, **Internal Users**, **Workspaces**, **Actions**, **Flow Performance**
and **Usage**
([Internal Users Report](https://support.moxo.com/hc/en-us/articles/22300699859085-Internal-Users-Report)).

**Confirmed** for the Actions report: an **Export** icon (top-right) lets you export *all columns* or
*current columns* and **Download** a **CSV**
([Actions Report](https://support.moxo.com/hc/en-us/articles/22300623021837-Actions-Report)).
Columns can be customised with the *Columns* icon next to the filters.

**Likely** (same report UI, not verified on the page itself): the Clients, Internal Users and Workspaces
reports have the same Export → CSV button. If one of them does not, select-all + copy from the table
into a spreadsheet works for 20–50 rows.

Step by step:

1. *Manage* → *Reports* → **Clients** → Export → all columns → save as `moxo-export/moxo-clients.csv`.
2. **Internal Users** → export → `moxo-internal-users.csv` (your team).
3. **Workspaces** → export → `moxo-workspaces.csv`. If the report has a status filter, export
   *active* and *archived* separately so you can decide what to bring over.
4. **Actions** → remove all filters (active, completed and overdue) → export all columns →
   `moxo-actions.csv`. This is your to-dos / file requests / approvals list, one row per action, with
   the workspace name, assignee, due date and status.
5. Client-side users (your clients' contacts) are **not** in the Internal Users report. **Unknown**
   whether the Clients report lists each contact or only the company. If it only lists companies, open
   each client in *Manage* → *Clients* and copy the contacts (name, email, title) into
   `contacts.csv`; for 20 clients this is under an hour.

### 2.2 Files

**Confirmed:** files live inside each workspace (and in client-portal *Resources*). Moxo documents
uploading files into workspaces and pushing collected files to Google Drive / Dropbox / Box / OneDrive
via automations
([Flow Automations Overview](https://support.moxo.com/hc/en-us/articles/32843848855053-Flow-Automations-Overview)).

**Unknown:** a "download all as ZIP" for a whole workspace or folder. No help-center article describing
one was found. Plan for **downloading file by file** from the workspace's Files tab, or, if you already
have a Drive/Dropbox automation, for collecting from there.

Per workspace:

1. Open the workspace → *Files*. Download every file you still need into
   `moxo-export/<workspace>/files/`, keeping Moxo's folder names as sub-folders (Hub has free-text
   folders, so `Contracts/` in Moxo becomes folder `Contracts` in Hub).
2. Only the **latest version** of each file matters; Hub has no version history.
3. Skip files that only exist because a chat attachment was auto-added if they are not deliverables.

### 2.3 Chat / conversation history

**Confirmed:** Moxo can log workspace activity, "every message exchanged, links to any files uploaded,
and any user activity like annotations", as a **daily batch into an archiving system** (Smarsh; Global
Relay is listed as a connector too)
([Connect Smarsh with Moxo](https://support.moxo.com/hc/en-us/articles/35473471149709-Connect-Smarsh-with-Moxo),
[Types of Integrations](https://support.moxo.com/hc/en-us/articles/27594999829645-Types-of-Integrations)).
That is a compliance feed, not a user-facing export, and needs a Smarsh/Global Relay subscription.

**Unknown:** an "export chat" / "save transcript as PDF" button inside a workspace. None was found in
the help center. The practical route is **print to PDF**:

1. Open the workspace chat in a desktop browser, scroll to the top until all history has loaded
   (older messages load in pages; keep scrolling until the "created this workspace" line).
2. Browser *Print* → *Save as PDF* → `moxo-export/<workspace>/chat-transcript.pdf`.
3. If the layout cuts things off, use the browser's reader view or zoom to 80 % first.
4. For **group chats** ("Groups & Topics" in the client portal,
   [article](https://support.moxo.com/hc/en-us/articles/27324362772109-Groups-Topics)) do the same,
   one PDF per group.

The legacy Moxtra REST API has a *get binder conversation* call
([developer.moxtra.com](https://developer.moxtra.com/docs/docs-rest-api/conversation/#get_binder_conversation))
that returns messages as JSON; see 2.7 for whether you can use it.

### 2.4 To-dos, file requests, approvals, e-signatures, forms

- **To-dos / file requests / approvals** are all *actions* and come out of the **Actions report CSV**
  (2.1). Open actions become Hub tasks / file requests / approvals; completed ones are usually only worth
  importing for workspaces that are still active.
- **E-signatures** (Moxo native e-sign or the
  [Docusign action](https://support.moxo.com/hc/en-us/articles/22340019000717-Docusign-Action)):
  download the **signed PDF** and, where offered, the **audit trail / certificate of completion** for
  each signed document into `moxo-export/<workspace>/signed/`. These are legal records; Hub's
  approvals are a yes/no with a note, not an e-signature, so the PDFs are the record.
- **Forms / questionnaires**: open each completed form and save it as PDF (or export responses if the
  form offers CSV). Store next to the files.

### 2.5 Flows and templates

**Confirmed:** Moxo has Flow templates, a template gallery and workspace variables
([Create a Flow Workspace Template](https://support.moxo.com/hc/en-us/articles/22300233695373),
[Template Gallery](https://support.moxo.com/hc/en-us/articles/22300051164557-Template-Gallery)).
**Unknown:** any export of a template. Plan to **rebuild** them: open each template, list its steps
(type, title, who, due in days, internal or client-visible) in a spreadsheet, and recreate them in
Hub → *Flows* (drag-and-drop builder). Conditional branches and automations do not exist in Hub;
split such a flow into two linear flows or handle the branch by hand.

### 2.6 Meetings and recordings

Video meeting history and recordings have no equivalent in Hub. Download any recording you must
keep (per meeting, from the meeting entry in the workspace) into `moxo-export/<workspace>/meetings/`.
Moving forward, meeting links go in the workspace conversation (Google Meet/Zoom etc.).

### 2.7 The Moxo API (optional, for bulk pulls)

- **Confirmed:** Moxo offers "REST API & Webhooks" for custom integrations, with "extracting workspace
  data from the Moxo platform and storing it in an internal system" given as an example use case
  ([Types of Integrations](https://support.moxo.com/hc/en-us/articles/27594999829645-Types-of-Integrations)).
  API access "is part of the Moxo platform subscription and is not sold standalone"; it goes through an
  **approval request** after which credentials (API keys / tokens) are provisioned
  ([API access approval](https://www.moxo.com/process/api-access-approval)).
- **Likely:** the current Moxo API is small. A third-party catalogue of its spec lists **12 endpoints**
  covering workspaces, workspace members, transactions (actions), clients, files, e-signatures, notes and
  flow steps, plus a button webhook, with OAuth 2.0 or API-key auth
  ([jentic.com](https://jentic.com/apis/moxtra.com/moxo-api)). Note: **no chat/messages endpoint** in that
  list.
- **Confirmed (legacy):** the older Moxtra developer platform exposes 200+ REST endpoints at
  `https://api.moxtra.com` for users, binders (= workspaces), messages, files, meetings, to-dos and
  notifications, with OAuth 2.0 access tokens
  ([developer.moxtra.com](https://developer.moxtra.com/),
  [api-evangelist profile](https://github.com/api-evangelist/moxtra)). Whether a current Moxo tenant
  can still call these, and with which credentials, is **unknown**.
- **Unknown:** rate limits, pagination limits, whether file download URLs are exposed, whether your
  plan includes API access at all.
- **Zapier** exists ([overview](https://support.moxo.com/hc/en-us/articles/27595159336205-Zapier-Integrations-Overview))
  but is built around *triggers on new events*, not bulk history, so it does not help with a one-off
  export.

Recommendation for 30 workspaces: **do not wait for API access**. The manual route (reports CSV + per
workspace download + print-to-PDF) is 2–3 days of work and has no dependency on Moxo's approval
process. Ask for API access in parallel (2.8); if it arrives in time, use it only for the two tedious
parts, file download and chat JSON, and keep everything else as below.

### 2.8 Questions to ask Moxo support

Send these in one ticket as early as possible (support may take days):

1. We are leaving Moxo. Is there a **full-account export** (all workspaces, files, chat history) that
   you can produce for us? In what format, and how long does it take?
2. Do the **Clients, Workspaces and Internal Users reports** export to CSV like the Actions report?
   Does the Clients report include each client's **contacts (name, email)**?
3. Is there a way to **download all files of a workspace at once** (ZIP), or must each file be
   downloaded individually?
4. Is there a **chat transcript export** (PDF/CSV/JSON) per workspace, including group chats and 1:1
   conversations?
5. Can we get **API credentials** for a one-off data pull? Which endpoints are available on our plan
   (workspaces, members, files, messages)? What are the **rate limits**?
6. For **e-signatures** completed in Moxo, how do we download the signed documents and their audit
   trails in bulk?
7. After we **cancel**, how long does our data remain accessible for export? (The
   [Terms of Service](https://www.moxo.com/legal/terms-of-service) require 30 days' written notice to
   terminate and say Moxo "does not assume any responsibility for retention of any user information or
   communications"; no explicit post-termination export window was found.)
8. Can our org be put in a **read-only / no-new-invites** state during the transition?

---

## 3. Order of migration

Do it in this order; each step depends on the previous one.

| # | Step | How | Depends on |
|---|---|---|---|
| 1 | **Clients** (companies) | `clients.csv` → importer | Moxo Clients report |
| 2 | **Contacts** (client users) and **team** | `contacts.csv` → importer; temporary passwords land in `credentials-out.csv` | 1 |
| 3 | **Workspaces** with members, status, due date | `workspaces.csv` → importer | 1, 2 |
| 4 | **Files** incl. chat PDFs and signed documents | Upload by hand in each workspace's Files tab (drag-and-drop, folders) | 3 |
| 5 | **Tasks, file requests, approvals** | `tasks.csv` → importer (tasks and file requests); approvals by hand (few) | 3 |
| 6 | **Flows** | Rebuild in Hub → Flows | nothing, can be done any time |
| 7 | **Announce to clients** | Email template in section 6 | 1–5 checked |

Only migrate **active and on-hold** workspaces in full. Completed/archived ones: either create them
with status `completed`/`archived` and upload only the final deliverables and the chat PDF, or leave
them in the Moxo archive export on disk and do not create them in Hub at all.

## 4. How Moxo objects map to Hub

| Moxo | Hub | Notes |
|---|---|---|
| Client (organisation) | **Client** (`clients`) | Name, industry, website, phone, address, internal notes. |
| Client user / contact | **Contact** = user with role `client` + `client_id` | Sees only workspaces they are a member of and nothing marked *internal*. |
| Internal user (admin / member) | User with role `admin` or `member` | `member` cannot manage the team or delete. |
| Workspace / binder (incl. Flow workspaces) | **Workspace** | One per project. Status active / on hold / completed / archived, owner, target date. |
| Workspace members | **Members** (`workspace_members`) | Team + the client's contacts. |
| Workspace chat | **Conversation** (`messages`) | History not migrated; see section 5. New messages, attachments, internal notes from day one. |
| 1:1 and group chats ("Groups & Topics") | **Direct / group conversations** (`conversations`, `direct_messages`) | History not migrated; PDF of important ones into a workspace's Files. |
| To-do / action item | **Task** (`tasks`, kind `task`) | Assignee, due date, priority, status, internal flag. |
| File request | **File request** (`tasks`, kind `file_request`) | Client uploads against it. |
| Approval / acknowledgement | **Approval** (`approvals`) | Formal yes/no with note; decision logged and requester notified. |
| E-signature (native / Docusign) | No equivalent; store signed PDF in **Files** | Use an approval for the "please confirm" step and an external e-sign tool when a real signature is needed. |
| Files and folders | **Files** (`files`, free-text `folder`) | 50 MB per file, latest version only, internal flag. |
| Flow template / Template gallery | **Flow** (`templates`) | Linear list of task / file-request / approval / message steps with due-in-days and who gets it. |
| Form / questionnaire | No equivalent | Attach the PDF; ask questions as a task or in the conversation. |
| Meeting / recording | No equivalent | Link to Meet/Zoom in the conversation; recordings as files if needed. |
| Notifications / read receipts | **Notifications** (new events only) | Nothing historical. |
| Client portal branding, mobile app | App name / org name env vars | Hub is one responsive web app at your own domain. |

Status mapping used by the importer: workspace `Active/Open → active`, `On hold/Paused/Pending →
on_hold`, `Completed/Closed/Done → completed`, `Archived → archived`; action `Pending/Open/Overdue →
todo`, `In progress → in_progress`, `Completed/Closed → done`; priority `Medium → normal`,
`Urgent → high`.

## 5. What cannot be migrated faithfully, and what to do instead

| Lost or changed | Why | Workaround |
|---|---|---|
| **Chat history** (workspace, group and 1:1) | No bulk export found; the importer does not create messages because authorship and timestamps could not be reproduced honestly. | Print each conversation to PDF (2.3) and upload it into the workspace's **Files** tab in a folder named `Moxo archive`. Add one message in the new conversation: "History before &lt;date&gt; is in Files → Moxo archive." |
| **Original timestamps and authors** | Everything imported is stamped with the import date and the importing administrator. | Keep Moxo's workspace creation date and link in the description (`moxo_url` column). Put the original due dates in the CSV; those are kept. |
| **E-signature records** | Hub approvals are not legally-binding signatures and carry no audit trail. | Signed PDF + certificate of completion into `Files/Signed documents`. Future signatures: Docusign/Dropbox Sign and file the PDF. |
| **Video meetings, recordings, scheduling** | No meetings in Hub. | Recordings as files only if required; meetings via Meet/Zoom links. |
| **Forms and their responses** | No forms in Hub. | PDF of each completed form into Files; new questionnaires as a file request with a template document, or as tasks. |
| **Conditional / automated flows** | Hub flows are linear. | Split into two flows, or one flow with the decision as an approval step and the rest done by hand. |
| **File versions, annotations, comments on files** | Hub keeps one version and no annotations. | Upload the final version; if the annotated version matters, export it as PDF first. |
| **Task comments / threads** | Hub tasks have a description, discussion happens in the workspace conversation. | Put the essential context in the task description column. |
| **Completed actions in bulk** | Fine to import, but they add noise. | Import only open actions for active workspaces; completed ones live in the chat PDF and the Actions report CSV you keep on disk. |
| **Users' passwords** | Cannot be exported from any system. | Temporary passwords are generated by the importer; users change them in Settings. |

Keep the whole `moxo-export/` folder (reports, files, PDFs) as a cold archive on your company drive
for as long as your retention rules require, independent of Hub.

## 6. Cutover plan

**Week 0, preparation (team only)**

1. Hub online at its final URL with HTTPS, org name set, your team logged in once.
2. Send the support ticket (2.8). Export the admin reports (2.1).
3. Build `clients.csv`, `contacts.csv`, `workspaces.csv`, `tasks.csv` (section 9). Run the importer
   with `--dry-run` until there are no problems, then for real. Spot-check 3 workspaces.
4. Per workspace: download files and print the chat to PDF; upload into Hub. Two people, half a day
   each per 10 workspaces.
5. Rebuild flows. Create the handful of open approvals by hand.

**Week 1–2, parallel run**

6. Put Moxo in **read-only mode** for your team: no new workspaces, no new invites, no new files; a
   note at the top of each Moxo workspace chat: "We have moved this project to &lt;Hub URL&gt;; please
   continue there." (Ask Moxo support whether an org-wide read-only setting exists; otherwise this is a
   team rule.)
7. Announce to clients (template below), one email per contact with their temporary password sent
   **separately** (different channel, e.g. WhatsApp or a second email), never in the same message as
   the URL.
8. Anything that still arrives in Moxo during these two weeks is answered with a pointer to Hub and
   copied over by hand (file → Files tab, decision → approval).
9. Daily 10-minute check: who has not signed in yet (Team / Clients pages), nudge them.

**Week 3, close**

10. Final sweep of Moxo: any file or decision from the parallel period that is not yet in Hub.
11. Final admin report export (so you have the last state of Moxo on disk).
12. Give Moxo the 30 days' written notice if you have not already. Keep the Moxo login until the
    termination date in case something was missed.

**Client email template**

> Subject: Your new ILA Global Consulting client workspace
>
> Dear &lt;first name&gt;,
>
> We are moving our client collaboration from Moxo to our own platform, **&lt;Hub URL&gt;**. From
> &lt;date&gt; we will run &lt;project name(s)&gt; there: the conversation, the documents, the tasks and
> anything we need you to approve, all in one place, with email notifications when something needs
> your attention.
>
> Your login is your email address, &lt;email&gt;. You will receive a temporary password in a separate
> message; please change it under *Settings* after your first sign-in.
>
> The files from your Moxo workspace have already been copied over, and a PDF of the previous
> conversation is in the *Files* tab under "Moxo archive". Moxo will remain readable until &lt;date&gt;
> and will then be closed.
>
> Nothing changes in how we work together; only the address. If anything does not work as expected,
> reply to this email or call &lt;phone&gt;.
>
> Kind regards,
> &lt;name&gt;

## 7. Checklist

**Preparation**
- [ ] Hub reachable over HTTPS at its final URL; `NEXT_PUBLIC_ORG_NAME` set; first admin created
- [ ] Backup of Hub's `data/` folder tested (copy it, restore it on a laptop, open the app)
- [ ] Support ticket with the questions in 2.8 sent to Moxo
- [ ] Admin reports exported: clients, internal users, workspaces, actions (all statuses)
- [ ] Decided which workspaces are migrated in full, which as `completed`/`archived` shells, which not at all

**Data**
- [ ] `clients.csv` ready, one row per company, names exactly as you want them shown
- [ ] `contacts.csv` ready: every client contact who needs a login, plus your team as `member`/`admin`
- [ ] `workspaces.csv` ready: client, status, owner, target date, members, Moxo link
- [ ] `tasks.csv` ready: open actions for active workspaces, with assignee emails and ISO due dates
- [ ] `--dry-run` shows 0 problems; real run done; `credentials-out.csv` moved to a safe place
- [ ] Per workspace: files downloaded, chat PDF saved, signed documents saved
- [ ] Per workspace: files uploaded to Hub with folders; chat PDF in `Moxo archive`
- [ ] Open approvals recreated; flows rebuilt; one test project built from a flow

**Cutover**
- [ ] Team briefed: Moxo read-only, where things go in Hub, how to reset a client password (Team page)
- [ ] Client emails sent; temporary passwords sent through a second channel
- [ ] Sign-in tracking for two weeks; non-starters nudged
- [ ] Final sweep of Moxo; final report export; `credentials-out.csv` deleted
- [ ] Written termination notice sent to Moxo; `moxo-export/` archived on company drive

## 8. Effort estimate (30 workspaces, 20 clients, ~40 contacts)

| Activity | Estimate | Notes |
|---|---|---|
| Admin report exports and tidy-up into the four CSVs | 3–4 h | Most time goes into matching contact emails to workspaces. |
| Importer dry runs, real run, spot checks | 1 h | |
| Files: download from Moxo, upload to Hub | 30 × 15–25 min = 8–12 h | Assumes file-by-file download, ~10–30 files per workspace. Halves if a ZIP export exists. |
| Chat print-to-PDF and upload | 30 × 5–10 min = 3–5 h | Long chats take longer to scroll-load. |
| Signed documents and forms | 1–2 h | Only workspaces that used e-sign/forms. |
| Rebuild 3–6 flows | 2–3 h | |
| Open approvals by hand | 0.5–1 h | |
| Client communication and two weeks of nudging/support | 4–6 h spread over 2 weeks | 20 emails + password handling + a few "I can't log in". |
| Final sweep and archive | 1–2 h | |
| **Total** | **≈ 24–36 person-hours, i.e. 3–5 working days** | Over 2–3 calendar weeks because of the parallel run. |

Reduce it by: not migrating completed workspaces in full (saves most of the file time), getting a ZIP
or API file export from Moxo, and doing the per-workspace work two people in parallel.

## 9. The CSV importer

```bash
cd hub
npx tsx scripts/import-csv.ts <folder> --dry-run     # validate, print the report, write nothing
npx tsx scripts/import-csv.ts <folder>               # import
npx tsx scripts/import-csv.ts <folder> --strict      # write nothing if any row has a problem
npx tsx scripts/import-csv.ts <folder> --actor you@company.com   # who is recorded as creator/owner
```

Set `DATA_DIR` if the database is not in `./data` (in Docker: run it inside the container, e.g.
`docker compose exec app npx tsx scripts/import-csv.ts /data/import`, after copying the folder in).
Example files with the exact columns are in `docs/import-templates/`.

The importer reads whichever of the four files exist in the folder (names matched case-insensitively),
in this order: `clients.csv`, `contacts.csv`, `workspaces.csv`, `tasks.csv`. It is **idempotent**:
clients are matched by name, users by email, workspaces by name + client, tasks by workspace + title +
kind; existing rows are reported as "already existed" and left unchanged (members and assignees listed
for an existing workspace are still added). Rows with a problem are **skipped and listed with their
line number**; everything else is written in one transaction. Exit code is 1 when any row had a problem.

Parsing rules: headers are case-insensitive and spaces/dashes count as underscores (`Due date` =
`due_date`); a few synonyms are accepted (`Company` → `client`, `E-mail` → `email`, `Full name` →
`name`, `Assigned to` → `assignee`, `Type` → `kind`); cells are trimmed; blank rows are skipped;
quoted cells may contain commas, line breaks and `""` for a quote; a UTF-8 BOM from Excel is fine.
Dates must be `YYYY-MM-DD` (an unambiguous `6 Oct 2026` also works; `03/04/2026` is rejected because
it could be either 3 April or 4 March).

### clients.csv

| Column | Required | Notes |
|---|---|---|
| `name` | yes | Company name, matched case-insensitively for idempotency. |
| `industry`, `website`, `email`, `phone`, `address`, `notes` | no | `notes` are internal, never shown to clients. |

### contacts.csv

| Column | Required | Notes |
|---|---|---|
| `name` | yes | |
| `email` | yes | Login; unique, case-insensitive. |
| `client` | for role `client` | Must match a row in `clients.csv` or an existing client. Leave empty for your own team. |
| `title` | no | Job title shown next to the name. |
| `role` | no | `client` (default), `member`, `admin`. |
| `password` | no | At least 8 characters. Leave empty and a temporary password is generated and written to `<folder>/credentials-out.csv` (`name,email,client,temporary_password`), appended on later runs, never printed to the console. Move that file somewhere safe, send each password privately, delete it. |

### workspaces.csv

| Column | Required | Notes |
|---|---|---|
| `name` | yes | Matched together with `client` for idempotency. |
| `client` | no | Empty = internal workspace. |
| `description` | no | |
| `status` | no | `active` (default), `on_hold`, `completed`, `archived` (synonyms accepted). |
| `owner` | no | Email of a team user; defaults to the actor. Always a member. |
| `due_date` | no | Target date. |
| `members` | no | Emails separated by `;`. Unknown emails are a warning, not an error. |
| `moxo_url` | no | Link to the Moxo workspace, appended to the description as "Migrated from Moxo: …". |

### tasks.csv

| Column | Required | Notes |
|---|---|---|
| `workspace` | yes | Workspace name. |
| `client` | when ambiguous | Needed only if two clients have a workspace with the same name. |
| `title` | yes | Matched with workspace + kind for idempotency. |
| `description` | no | |
| `kind` | no | `task` (default) or `file_request` (`File request`, `To-do`, `Action` accepted). |
| `assignee` | no | Email of an existing user. Added to the workspace if not yet a member (reported as a warning). |
| `due_date` | no | |
| `status` | no | `todo` (default), `in_progress`, `done` (`Pending`, `Overdue` → todo; `Completed` → done). |
| `priority` | no | `low`, `normal` (default), `high` (`Medium` → normal, `Urgent` → high). |
| `internal` | no | `yes`/`no` (default no). Internal tasks are invisible to clients. |

Approvals are not imported from CSV on purpose: there are usually only a handful open at cutover,
and each needs a real approver and often a file. Create them in the workspace's Approvals tab after
the files are uploaded.

### Turning the Moxo Actions report into tasks.csv

Open `moxo-actions.csv` in a spreadsheet, keep only the rows you want, and map the columns:
workspace name → `workspace`, action title → `title`, action type (to-do / file request) → `kind`,
assignee email → `assignee` (if the report gives names only, look the emails up in `contacts.csv`),
due date → `due_date` as `YYYY-MM-DD`, status → `status`. Delete the other columns (or leave them: the
importer warns about unknown columns and ignores them). Save as CSV (UTF-8).
