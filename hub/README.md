# Hub — client workspace platform

A self-hosted web app for running client engagements the way Moxo does: one **workspace** per
project, with a shared **conversation**, **tasks** and file requests, **files**, **approvals**,
**members** (your team + the client's contacts) and reusable **flows**. Your team sees everything;
clients sign in to the same URL and only see their own workspaces and nothing marked *internal*.

It is a single Next.js application with an embedded SQLite database and on-disk file storage, so it
runs anywhere a Docker container or a Node process can run. No third-party services are required.

## What's inside

The layout follows Moxo's: a top bar with **Home · Library · Manage · Admin**, and a three-pane Home.

| Area | What it does |
|---|---|
| Home | Left: the workspace list (filter, archive toggle, progress badge such as `2/5`, last-activity preview) with a **Summary** tab (your to-dos, approvals waiting on you, quiet workspaces, recent activity). Middle: the selected workspace with its cover, members and **Flow \| Files** tabs. Right: the workspace **Chat**. |
| Flow tab | The vertical timeline of steps: to-dos, file requests, acknowledgements and approvals, each with a status (Not Started / In Progress / Completed) and its assignee. Click a step for the **Action Details** panel: progress, activity log, comments (which appear in the chat as "Re: <step>"), and the buttons to complete, upload, acknowledge, approve or reject. **Add action** opens the action-type chooser; **Start a flow** applies a template and lets you say who plays each role. |
| Chat | Per-workspace chat with attachments (pick or drag-and-drop), live updates, and **internal notes** that clients never see. Event lines record every step, file and approval change. |
| Messages | Direct messages between any two people, and group chats, outside workspaces (top-right icon). Clients can message your team and people they share a workspace with. |
| Library | Flow Workspace Templates as cards (by whom, how many steps, last used). The **builder** is a vertical flow diagram: a Flow Start node with a welcome message, "+" connectors, step cards with coloured headers and "Assigned to" role chips, drag-and-drop from the Add panel, a **Roles** panel (Client, Manager and custom roles such as "Tax and Accounting") and a **Details** panel. |
| Manage | Report tables: Workspaces (current action, assignees, status, owner), Actions, Clients, Internal Users, plus the Companies directory. |
| Admin | Internal Users and Clients tables with Invite, make/remove admin, reset password, deactivate. In Moxo a "client" is a person; companies are an optional grouping here. |
| Roles | `admin` (everything), `member` (everything except Admin), `client` (own workspaces only, non-internal items only, no Library/Manage/Admin). |

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
   chats, and the workspace chat for anything about a project.

## Development

```bash
npm run typecheck && npm run build
```

Stack: Next.js 15 (App Router, server actions), React 19, Tailwind CSS 4, dnd-kit, better-sqlite3, bcryptjs.
Schema is created automatically on first start (`lib/db.ts`). Key folders: `lib/queries` (reads),
`lib/actions` (writes, one file per feature), `app/(app)` (pages), `components/`.
