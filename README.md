# UNMAPPED
### Infrastructure for the invisible workforce

> 800 million young people will enter the workforce in emerging markets. Only 400 million jobs will exist. Most of them are unmapped.

UNMAPPED is an open, localizable infrastructure layer that closes the distance between a young person's real skills and real economic opportunity — built for the World Bank Youth Summit 2026 Hack-Nation challenge.

---

## What it does

**For youth:** Describe your work experience by voice or text. AI extracts your skills, maps them to international standards (ISCO-08/ESCO), and shows you which skills are automation-resilient, which are at risk, and what training pathways increase your earning potential — all calibrated to your local economy.

**For governments:** Paste a national labor report in any language. AI extracts province-level employment data and visualizes displacement risk across regions. A time slider projects how automation reshapes the workforce from 2026 to 2031. The same engine works for any country — swap the data, the dashboard adapts.

---

## Data sources (all real, zero synthetic)

| Category | Source | What it provides |
|----------|--------|-----------------|
| Labor market | World Bank WDI / ILOSTAT | Employment by sector, unemployment, wages, GDP per capita |
| Automation risk | Frey & Osborne (2017) | Automation probability for 702 occupations |
| Skills taxonomy | ESCO / ISCO-08 | International occupation and skills classification |
| Education projections | Wittgenstein Centre | Education levels by country projected to 2035 |
| Digital readiness | ITU via World Bank | Internet penetration, mobile subscriptions |
| Country-specific | Government upload (e.g., BPS Sakernas) | Province-level employment, wages, sector breakdown |

Every number shown to the user traces to a published source.

---

## Architecture

- **Consumer app:** React (Vite) — voice/text input → Claude API skill extraction → risk scoring → pathway recommendations
- **Government dashboard:** Leaflet map + D3.js — province-level displacement risk, time slider, AI data intake
- **AI engine:** Claude API — skill extraction, risk calibration, report parsing (NLP)
- **Data pipeline:** Pre-loaded global datasets + government-uploaded local data via NLP intake
- **Deployment:** Vercel

---

## Running locally

```bash
# Install dependencies
npm install

# Start both frontend and backend
npm run dev          # Vite frontend on port 8080
node server.js       # Express backend on port 3000 (separate terminal)

# Open consumer app
http://localhost:8080

# Open government dashboard
http://localhost:8080/dashboard
```

### Environment variables

Create `.env.local`:
```
ANTHROPIC_API_KEY=your_key_here
USE_MOCK_API=false
```

Set `USE_MOCK_API=true` for demo-safe mock data mode.

---

## Modules built

**Module 1 — Skills Signal Engine:** Voice/text → AI extracts skills → maps to ISCO-08 → portable, human-readable profile

**Module 2 — AI Readiness & Displacement Risk Lens:** Frey-Osborne automation scores recalibrated for local context (internet penetration, e-commerce exposure). Time projection 2026–2031 using Wittgenstein education data.

**Module 3 — Opportunity Matching & Econometric Dashboard:** Dual interface — youth sees earnings potential and training pathways; government sees aggregate displacement risk by province with real econometric signals.

---

## Country-agnostic design

The system is not hardcoded to Indonesia. Country-specific parameters are inputs, not assumptions:
- Labor market data → uploaded by government via NLP intake
- Skills taxonomy → ISCO-08 / ESCO (international standard)
- Automation calibration → adjusted by local internet penetration
- Language → Claude handles any language natively

Demo shows Indonesia. The same engine works for any LMIC country.

---

## Team

Built for Hack-Nation Global AI Hackathon, April 2026.
