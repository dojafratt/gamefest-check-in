# LAN Check-In

A BYOC (Bring Your Own Computer) LAN-event check-in system with a visual floor plan. Admins can lay out tables and seats, then operators on any phone/tablet can tap a seat to check someone in or out. The live map syncs across every device in real time.

- **Map editor** — pan/zoom SVG canvas, tables sized in feet with rotation, sections with customizable ID prefixes, BYOC vs Rental node types, grid snap, auto-save.
- **Check-in** — tap a node, capture name/Discord/phone, tap again to check out. Data is scoped per day with prev/next navigation.
- **Multi-device sync** — Supabase realtime keeps the map live on every open browser.
- **Free to run** — Supabase free tier + Vercel free tier + free GitHub repo.

---

## Tech stack

- Vite + React (plain JS, no TypeScript)
- Supabase (Postgres + realtime) for the shared database
- Vercel for hosting the static build

---

## Quick start (local dev)

```bash
git clone <your-repo-url>
cd lan-checkin
npm install
cp .env.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see "Supabase setup" below)
npm run dev
```

Open http://localhost:5173.

Without Supabase credentials the app still runs — it just stores data in `localStorage` on one device. You'll see an orange banner at the top when this is the case.

---

## Supabase setup (free tier)

1. **Create a project.** Go to [supabase.com](https://supabase.com) → sign in with GitHub → *New project*. Pick any name, region, and password. The **Free** plan is what you want. Creation takes ~2 minutes.

2. **Run the schema.** In the project dashboard: *SQL editor* → *New query* → paste the entire contents of [`supabase-schema.sql`](./supabase-schema.sql) → *Run*. This creates the `layouts` and `checkins` tables, row-level-security policies, and adds both tables to the realtime publication.

3. **Get your credentials.** *Project Settings* → *API*. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

   The anon key is safe to ship in the frontend — it's gated by the RLS policies from step 2.

4. **(Optional) Verify realtime is on.** *Database* → *Replication* → you should see `layouts` and `checkins` under the `supabase_realtime` publication. The SQL script adds them automatically but the dashboard is where you'd confirm.

Paste the two values into `.env.local` and run `npm run dev`. Open the app in two browser tabs — check someone in on one tab and they should appear on the other within a second.

---

## Deploy to Vercel (free)

1. **Push this project to GitHub.**

   ```bash
   git init
   git add .
   git commit -m "initial"
   git branch -M main
   git remote add origin https://github.com/<you>/lan-checkin.git
   git push -u origin main
   ```

2. **Import into Vercel.** Go to [vercel.com](https://vercel.com) → sign in with GitHub → *Add New* → *Project* → pick the repo. Vercel auto-detects Vite. Leave the build settings as-is:
   - Build command: `npm run build`
   - Output directory: `dist`

3. **Add environment variables.** Before clicking *Deploy*, expand *Environment Variables* and add:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your project URL from Supabase |
   | `VITE_SUPABASE_ANON_KEY` | your anon public key from Supabase |
   | `VITE_ADMIN_PASSCODE` | any passcode for the edit-mode gate |

4. **Deploy.** Vercel gives you a `*.vercel.app` URL. Open it on a laptop and a phone — they share the same data.

Any future `git push` to `main` redeploys automatically.

---

## Using the app

**Check-in mode** (default, operator view)
- Tap a node to open the check-in form (name, Discord, phone).
- Tap a filled node to see who's there and check them out.
- The date picker at the top navigates days. Each day is a fresh roster.

**Edit mode** (admin view, passcode-gated)
- *Map & Tables* — set the room's outer dimensions in feet, set grid snap, add tables.
- Click a table to drag it, or edit its size / rotation / label in the right panel.
- *Sections* — create as many as you need. Each has a color, a prefix (e.g. "A"), and a **Show prefix in ID** toggle. With it on, nodes render as `A-1`, `A-2`. With it off, they just render as `1`, `2`. Each section numbers independently starting at 1.
- Inside a section, click **+ BYOC** or **+ Rental**, then click anywhere on the map to place nodes. Keep clicking to place more. Cancel via the orange panel on the left.
- Click a node to drag it or edit its section / type / number.
- Everything auto-saves. The sync pill in the top-right shows *Saving…* / *Synced*.

---

## Data model

`layouts` — one row (`id = 'main'`), `data` column holds the whole floor plan as JSON:
```
{ tables: [...], nodes: [...], sections: [...], mapWidth, mapHeight, gridSize }
```

`checkins` — one row per (date, node). Deleting the row = check-out:
```
date (YYYY-MM-DD) | node_id | name | discord | phone | checked_in_at
```

---

## Hardening (optional)

The default setup gives anyone with the URL full read/write access to both tables. That's appropriate for an internal tool whose URL you only share with staff. To tighten:

- **Narrow the edit policy.** Use Supabase Auth and restrict writes on `layouts` to an authenticated admin. Operators can still check people in with an anon key. Update `supabase-schema.sql` accordingly, e.g. replace the `layouts: public write` policy with `using (auth.role() = 'authenticated')`.
- **Private deployment.** Vercel free tier supports password-protecting preview deployments; the Pro tier extends this to production.
- **Rotate the passcode per event.** `VITE_ADMIN_PASSCODE` is shipped in the client bundle — swap it out between events.

---

## Troubleshooting

**Orange "Supabase not configured" banner on Vercel.** Your env vars aren't reaching the build. In Vercel: *Settings* → *Environment Variables* → confirm both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` exist for the Production environment, then trigger a redeploy.

**Changes save on one device but don't appear on others.** Realtime isn't wired up. Go to *Supabase* → *Database* → *Replication* and confirm `layouts` and `checkins` are in the `supabase_realtime` publication. If not, re-run the SQL script.

**Getting "new row violates row-level security" errors.** You enabled RLS but didn't create the policies. Re-run the SQL script — it's idempotent.

**Edit mode is stuck asking for a passcode.** Clear the session: open DevTools → *Application* → *Session Storage* → delete `lan-checkin:admin`.

---

## License

Do what you want with it.
