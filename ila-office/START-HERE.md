# ILA Office: start it on your laptop

You need two free programs once: **Git** (git-scm.com) and **Node.js 22** (nodejs.org, "LTS").
Then open a terminal (Mac: Terminal; Windows: PowerShell) and paste these four lines:

```bash
git clone -b claude/great-cerf-wd6j0e https://github.com/florent-a11y/claude.git ila-app
cd ila-app/ila-office
npm run start:local
```

The last command installs the app, loads the demo data (ILA's entity and chart of accounts, the service
catalogue, your vendor list, one fictional client) and starts the server. When it prints
`Local: http://localhost:3100`, open that address in your browser and sign in with:

| Email | Password |
|---|---|
| florent@ilaglobalconsulting.com | change-me-now-please |

Change the password under **Settings → Users** afterwards.

## Day to day
- Start again later: `cd ila-app/ila-office` then `npm run dev`.
- Stop the server: press `Ctrl` + `C` in the terminal.
- Your data lives in `ila-app/ila-office/data/` on this laptop only. Nothing is sent anywhere.
- Get the latest version: `git pull` inside the folder, then `npm run setup`.

## When you want the team on it
Follow the Deploy section of `README.md` (Vercel + Supabase, the same setup as the arrival-card site) and put it behind
Cloudflare Access. The design document is `docs/ila-office-spec.md`.
