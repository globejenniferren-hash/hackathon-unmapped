# UNMAPPED (hackathon)

Government dashboard demo lives at **`/dashboard`**.

**Person 1 (Lovable youth app):** link to Screen 4 with a plain path on the same deployment, for example `<a href="/dashboard">Government dashboard</a>` or your router’s equivalent to `"/dashboard"` (no hash). If the youth app is on a different origin, use the full Vercel URL plus `/dashboard`.

- **Local:** `npm install` then `npm run dev` — open [http://localhost:5173/dashboard](http://localhost:5173/dashboard).
- **Mock JSON** is in `public/mock/`; Vite serves it at **`/mock/…`** (not `/public/mock/…` in the URL).
- **Vercel:** `vercel.json` rewrites all routes to the SPA. Set `VITE_USE_MOCK_API=true` (or leave unset) for static mocks; set `VITE_USE_MOCK_API=false` to attempt live `GET /api/dashboard/province-risk?…` and fall back to the same files on failure.
- **AI Data Intake (Screen 4):** `POST /api/data-intake/analyze` with JSON `{ "documentId": "<filename.pdf>" }` when not in mock mode; otherwise `public/mock/dataIntakeAnalyze.json` is used. **Reset to baseline** clears approved overrides; **Retry** on main data reload also clears intake state.

Youth / Lovable UI can be merged from the main product repo; this tree focuses on a reliable Screen 4 slice.
