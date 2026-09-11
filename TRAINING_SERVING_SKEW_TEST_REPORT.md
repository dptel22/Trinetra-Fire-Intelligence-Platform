# Training/Serving Skew Test Report

> **STATUS: HISTORICAL / PARTIALLY SUPERSEDED (2026-09-10).**
> This 2026-09-08 report is an accurate record of its day, but two details
> have since changed: (1) the fixed parity sample cells used here were later
> found absent from the refreshed serving data and the fixtures were changed
> to intersect real training/serving keys (audit finding MODEL-001); (2) the
> `.venv-pinned` environment no longer exists — use the repo `.venv`.
> The **living** source of truth for parity is
> `tests/test_training_serving_parity.py` (3 tests, passing 2026-09-10 —
> see [`docs/CLAIMS_AND_EVIDENCE.md`](docs/CLAIMS_AND_EVIDENCE.md) C-35).

**Date:** 2026-09-08  
**Scope:** Automated guardrail for the PS26162 CatBoost training/serving feature contract.

## Outcome

The automated parity test is in place and passed. It validates the complete 55-feature model contract for two real, deterministic rows reachable through both the locked training artifact and the live serving feature store.

## Implemented test

File: `tests/test_training_serving_parity.py`

The test:

- Locates the locked labeled training artifact using model metadata, with the local artifact available at `data/processed/sih2026_h3_daily_labeled_osi_wri.parquet`.
- Uses the real pairs `88209a2297fffff` / `2025-11-29` and `88209a2011fffff` / `2025-01-26`.
- Confirms the feature-schema/configuration contract has exactly 55 features with identical set and order.
- Sends the serving row through `feature_store.get_cell()` and `model_service._prepare_pool()`.
- Confirms the CatBoost Pool contains one row, 55 features in the configured order, and categorical positions for `h3_08` and `daynight`.
- Compares each feature value: categorical values exactly and numeric values with `rtol=1e-6` / `atol=1e-6`.
- Retains a narrowly scoped `xfail` only for an observed NULL-vs-0.0 mismatch in the documented lag columns. It does not hide unrelated mismatches.

## Coverage evidence

The chosen row is not a first observation and contains real lag history:

| Field | Training artifact | Serving feature store |
| --- | ---: | ---: |
| `is_first_observation` | 0 | 0 |
| `frp_max_lag7` | 3.74 | 3.740000009536743 |
| `frp_max_lag30` | 3.74 | 3.740000009536743 |
| `active_days_7d` | 1 | 1 |
| `active_days_30d` | 1 | 1 |
| `active_days_90d` | 1 | 1 |

The small FRP representation difference is within the intended numeric tolerance. No unexpected feature-set, order, categorical, or value divergence was found.

The first-observation row has NULL FRP lag values and zero active-day lags on the training side. It is retained as a second parametrized case so the documented NULL-vs-0.0 lag path is exercised. The current serving data returns NULL for the FRP lags as well, so this case passes rather than xfails.

## Verification

| Command | Result |
| --- | --- |
| `.venv-pinned\Scripts\python.exe -m pytest tests\test_training_serving_parity.py -v -p no:cacheprovider` | 4 passed, no warnings, 22.14s |
| `.venv-pinned\Scripts\python.exe -m pytest tests\test_aggregation.py tests\test_backend.py tests\test_security_error_sanitization.py -q -p no:cacheprovider` | 24 passed, 2 unrelated deprecation warnings, 22.97s |

## Dependency status

The calibration artifact was created with scikit-learn 1.6.1. `runtime_versions.json`, `requirements.txt`, and `pyproject.toml` all already pin scikit-learn 1.6.1, so no dependency change was required.

The available global interpreter is Python 3.14 with scikit-learn 1.9.0. Its `InconsistentVersionWarning` when loading the 1.6.1 calibration artifact is an environment mismatch, not a production dependency mismatch. A clean managed Python 3.12.13 environment was created at `.venv-pinned`; it installed and ran with scikit-learn 1.6.1 and emitted no `InconsistentVersionWarning`.

## Remaining action

The legacy repository `.venv` points to a removed Python 3.12 base installation. A stale process keeps its `Scripts` directory locked and immediately restarts after it is stopped, preventing replacement in-place. Use the verified `.venv-pinned` environment now; replace the old `.venv` only after the external process is identified and stopped.

Run the complete suite with:

```powershell
.venv-pinned\Scripts\python.exe -m pytest -v
```

This will provide the final clean run without the global-interpreter sklearn warning.

## Scope and cleanup

No file under `app/` or `pipeline/` was changed. Temporary diagnostic scripts and outputs created during the agent work were removed. Existing notebook and parquet changes were preserved because they were outside this task and could not be safely attributed to it.
