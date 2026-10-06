# Hub — client workspace platform

A self-hosted web app for running client engagements the way Moxo does: one **workspace** per
project, with a shared **conversation**, **tasks** and file requests, **files**, **approvals**,
**members** (your team + the client's contacts) and reusable **flows**. Your team sees everything;
clients sign in to the same URL and only see their own workspaces and nothing marked *internal*.

It is a single Next.js application with an embedded SQLite database and on-disk file storage, so it
runs anywhere a Docker container or a Node process can run. No third-party services are required.

## What's inside

| Area | What it does |
|---|---|
| Dashboard | Active workspaces, your open/overdue tasks, approvals waiting on you, workspaces that went quiet ("needs a follow-up"), recent activity. |
| Messages | Direct messages between any two people, and group chats, outside of workspaces. Clients can message your team (and people they share a workspace with). Attachments, unread badges, one notification per unread conversation. "Message" buttons next to every person. |
| Workspaces | One per project. Status (active / on hold / completed / archived), client, owner, target date. Filter by status, client, "only mine", search. |
| Conversation | Chat per workspace with file attachments (pick or drag-and-drop), live updates (polling), day separators, and **internal notes** that clients never see. System lines record every task, file and approval event. |
| Tasks | Tasks and **file requests** with assignee, due date, priority, status (to do / in progress / done), internal flag. Cross-workspace views: mine, team, overdue. |
| Files | Upload or drag-and-drop (50 MB per file), folders, download with access control, internal flag. Attachments from the conversation and approvals appear here too. |
| Approvals | Ask a client or colleague for a formal yes/no on a document or decision; decision + note are logged and the requester is notified. |
| Flows & project builder | A drag-and-drop builder: drag Task, File request, Approval and Message steps onto a plan, reorder them, set due-in-days and who gets each step. Save the plan as a reusable **flow**, or open **Build project** inside a workspace to compose the plan there (start from a flow, assign steps to real members, create everything in one click, optionally save it as a flow too). |
| Clients | Companies with contacts, internal notes and all their workspaces. Create portal logins for contacts from the client page. |
| Team | Administrators manage internal users: add, switch role, deactivate (sessions revoked), reset passwords (also for client logins). |
| Notifications | In-app notifications for messages, assignments, files, approvals and membership changes; unread badge in the top bar. |
| Roles | `admin` (everything), `member` (everything except team admin and deletions), `client` (own workspaces only, non-internal items only). |

## Run it locally

```bash
cd hub
npm install
cp .env.example .env.local      # optional: app name, company name
npm run dev                     # http://localhost:3000
```

On first launch the app shows a **Set up** page to create the first administrator (or set
`SEED_ADMIN_NAME/EMAIL/PASSWORD` and the account is created automatically at start-up). For a
quick look with realistic content:

```bash
npm run seed:demo    # first admin from SEED_ADMIN_*, plus a demo client, contacts, workspaces, tasks and a flow
```

Demo logins created by `seed:demo` (password `password123`): `sari@example.com`, `marc@example.com`
(team), `putri@acme-hospitality.example`, `erik@nordicventures.example` (clients).

Data lives in `./data` (`hub.db` + `uploads/`). Back up that folder and you have everything.

## Put it online (Docker)

```bash
cd hub
cp .env.example .env            # set NEXT_PUBLIC_ORG_NAME, SEED_ADMIN_*, COOKIE_SECURE=true
docker compose up -d --build    # app on port 3000, data in the `hub-data` volume
```

The first administrator is created from `SEED_ADMIN_*` when the container starts (only while the
user table is empty). If you leave them unset, open the URL and use the Set up page instead.

Then put a TLS reverse proxy in front (Caddy, Nginx, Traefik, or the platform's own) and point your
domain at it, e.g. `hub.yourcompany.com`. With Caddy the whole config is:

```
hub.yourcompany.com {
  reverse_proxy localhost:3000
}
```

Works the same on any host that runs a Docker image with a persistent volume: a small VPS
(Hetzner, DigitalOcean, Lightsail), Fly.io, Railway, Render, Coolify, CapRover. Mount the volume at
`/data` and set `COOKIE_SECURE=true` once HTTPS is on.

Not suitable for Vercel or other serverless hosts: the database and uploads live on disk, so the app
needs a persistent volume.

The `NEXT_PUBLIC_*` values are baked in at build time; pass them as build args (see
`docker-compose.yml`) rather than runtime environment variables.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_NAME` | `Hub` | Name shown in the sidebar and titles (build-time). |
| `NEXT_PUBLIC_ORG_NAME` | `Your company` | Your company name, shown to clients (build-time). |
| `DATA_DIR` | `./data` (`/data` in Docker) | Database and uploads location. |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS. |
| `SEED_ADMIN_NAME/EMAIL/PASSWORD` | — | First administrator, created at start-up while no user exists (also used by `npm run seed`). |

## Migrating from Moxo

The full runbook is in [`docs/migrating-from-moxo.md`](docs/migrating-from-moxo.md): what Moxo lets you
export and how, the migration order, what cannot be carried over and the workaround for each, a
cutover plan with a client email template, and an effort estimate. For bulk loading, prepare CSV files
(templates in [`docs/import-templates/`](docs/import-templates/)) and run:

```bash
npm run import:csv -- path/to/folder --dry-run   # validate first
npm run import:csv -- path/to/folder             # clients → contacts → workspaces → tasks
```

The importer is idempotent, generates temporary passwords for new contacts into
`credentials-out.csv` next to your CSVs (share them privately, then delete the file), and reports every
problem with its line number.

In short:

1. Create your **clients** and their **contacts** (Clients → New client → Add a contact). Each contact
   gets a login; send them the temporary password privately.
2. Create a **workspace** per active Moxo workspace, pick the client, add your team and the contacts.
3. Turn your recurring engagements into **flows** (Flows → New flow, drag the steps into place) so new
   workspaces start with every step in place. For a one-off project, open the workspace's Tasks tab
   and click **Build project**.
4. Upload the important files from Moxo into the Files tab (folders are free text, e.g. `Contracts`).
5. Share the URL with the team; clients use the same URL. Use **Messages** for one-to-one and group
   chats, and the workspace conversation for anything about a project.

## Development

```bash
npm run typecheck && npm run build
```

Stack: Next.js 15 (App Router, server actions), React 19, Tailwind CSS 4, dnd-kit, better-sqlite3, bcryptjs.
Schema is created automatically on first start (`lib/db.ts`). Key folders: `lib/queries` (reads),
`lib/actions` (writes, one file per feature), `app/(app)` (pages), `components/`.
