# SurveyOS Codebase Structure

_Generated 2026-04-11. Excludes `node_modules`, `.git`, `dist`, `.vercel`, `.swarm`, `.claude`, `.claude-flow`._

## Root

```
.
├── .env                    # local secrets (gitignored)
├── .gitignore
├── .mcp.json
├── CLAUDE.md               # Claude Code project instructions
├── README.md
├── index.html              # Vite entry
├── package.json
├── package-lock.json
└── vite.config.js
```

## `/docs`

```
docs/
└── SurveyOS_Master_Architecture.md
```

## `/public`

```
public/
├── sw-vault.js             # service worker — vault
└── sw.js                   # service worker — app shell
```

## `/src`

```
src/
├── App.jsx
├── Auth.jsx
├── main.jsx
├── index.css
├── supabaseClient.js
├── surveyos-architecture.md
│
├── components/
│   ├── DeploymentModal.jsx
│   ├── FallbackView.jsx
│   ├── LiveCADViewer.jsx
│   ├── ProjectDrawer.jsx
│   ├── ProjectVault.jsx
│   ├── SignaturePad.jsx
│   └── ui/                 # (empty)
│
├── data/
│   └── constants.js
│
├── lib/
│   ├── harrisonMath.js
│   ├── networkProbe.js
│   ├── offlineStore.js
│   ├── stripe.js
│   ├── supabase.js
│   └── syncEngine.js
│
├── utils/
│   └── generateCertifiedReport.js
│
└── views/
    ├── ClientPortal.jsx
    ├── CommandCenter.jsx
    ├── DispatchBoard.jsx
    ├── EquipmentLogistics.jsx
    ├── FieldLogs.jsx
    ├── IntelligenceDrawer.jsx
    ├── LiveView.jsx
    ├── MobileCrewView.jsx
    ├── MorningBrief.jsx
    ├── NetworkOps.jsx
    ├── ProfitAnalytics.jsx
    ├── ProjectVault.jsx
    ├── Roster.jsx
    └── TodaysWork.jsx
```

> ⚠️ Stray file: `src/point_id,point_number,delta_n,delta_e,de` — looks like a CSV header accidentally saved as a filename. Worth cleaning up.

## `/supabase`

```
supabase/
├── functions/
│   ├── _shared/
│   │   ├── cors.ts
│   │   ├── stripe.ts
│   │   └── supabase-admin.ts
│   ├── notify-client/
│   │   └── index.ts
│   ├── stripe-connect-onboard/
│   │   └── index.ts
│   ├── stripe-create-invoice/
│   │   └── index.ts
│   └── stripe-webhook/
│       └── index.ts
└── migrations/
    ├── 01_core_multitenant_rbac.sql
    ├── 02_stripe_connect_tables.sql
    ├── 03_client_portal_tables.sql
    ├── 04_roster_roles.sql
    └── 05_project_vault_storage.sql
```
