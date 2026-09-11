# Hackathon Judge Runbook

## Demo path

1. From the repository root, run `.\scripts\setup.ps1 -Mode demo -SkipInstall`.
2. If serving parquets are missing, run `.\scripts\setup.ps1 -Mode demo -DownloadServingData`.
3. Start the backend with `.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000`.
4. Run `.\scripts\verify.ps1` and show the health/latest-date result.
5. In a second terminal, run `Push-Location frontend; npm run dev; Pop-Location`.
6. Open the printed frontend URL and show the map, filters, hotspot inspector, explanation, archive, and alert review flow.

For Docker demo startup, run `docker compose up --build backend`. For live
ingestion with the local raw inputs and FIRMS key, run
`docker compose -f docker-compose.yml -f docker-compose.live.yml up --build backend`.
The live override uses a Docker secret file; do not paste the key into Compose
or the image.

## Truthfulness rules

The refreshed serving snapshot covers 2024-08-01 through 2026-09-10. It uses
the full India bounding box and currently contains detections in 20 states/UTs;
states with no FIRMS detections on a date are not fabricated into the map; empty
states/UTs remain empty rather than becoming synthetic alerts. The model marks
44 rows outside its training geography for analyst review.

- `LIVE`, `HISTORICAL`, `DEMO`, and `OFFLINE` are different states.
- Mock rows are always visibly labeled.
- Missing detail or alert persistence is an error state, never a mock success.
- Confidence is the model's returned probability, not an accuracy claim.
- Mining and agricultural-burn caveats remain visible wherever their outputs are shown.
- Current data coverage is described by backend provenance, not by a marketing label.

## Recovery path

If the backend is unavailable, the frontend may show explicitly labeled demo
data for map exploration, but detail, explanations, archive mutations, and
alert actions must remain visibly unavailable. Restart the backend and refresh
the page before presenting live results.

## Live mode prerequisite

Live ingestion requires `FIRMS_MAP_KEY`, the India OSM PBF, the WRI CSV, and
the pinned India state boundary files. If any are missing, demonstrate the
prepared demo/historical path and say that live freshness is externally blocked.
