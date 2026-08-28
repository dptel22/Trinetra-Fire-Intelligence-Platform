# Frontend — SIH 2026 PS26162

## Tech Stack: TBD

This directory will contain the React + TypeScript dashboard.

**Planned structure:**
```
frontend/
├── src/
│   ├── main.tsx              # Entry point
│   ├── App.tsx               # Root component
│   ├── components/           # Reusable UI components
│   │   ├── Map.tsx           # MapLibre/Leaflet wrapper
│   │   ├── Sidebar.tsx       # Filter/legend panel
│   │   ├── AlertPanel.tsx    # Real-time alerts feed
│   │   └── Charts.tsx        # Analytics visualizations
│   ├── pages/                # Route-level components
│   │   ├── Dashboard.tsx     # Main map view
│   │   ├── Analytics.tsx     # Charts & statistics
│   │   ├── Alerts.tsx        # Alert management
│   │   └── Model.tsx         # Model performance
│   ├── hooks/                # Custom React hooks
│   ├── services/             # API client (TanStack Query)
│   ├── store/                # Zustand stores
│   └── types/                # TypeScript interfaces
├── tests/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── Dockerfile
```

**Decisions pending:**
- Map library: MapLibre GL JS vs Leaflet
- State management: TanStack Query + Zustand (planned)
- Styling: Tailwind CSS (planned)
- Charting: Recharts / Chart.js / Visx