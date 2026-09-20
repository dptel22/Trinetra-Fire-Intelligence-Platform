"""Tests for scripts/fetch_serving_data.py manifest handling.

Regression: the published ``serving-data-2026-09-09`` release ships a
PowerShell ``Get-FileHash``-style manifest (``file`` / ``Hash``, upper-case hex)
while the script originally only understood ``name`` / ``sha256``, so the
documented fresh-clone data fetch aborted with "malformed manifest entry".
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import zipfile
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "fetch_serving_data.py"
_spec = importlib.util.spec_from_file_location("fetch_serving_data", _SCRIPT)
assert _spec is not None and _spec.loader is not None
fsd = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fsd)

PAYLOAD_A = b"parquet-a-bytes"
PAYLOAD_B = b"parquet-b-bytes"
SHA_A = hashlib.sha256(PAYLOAD_A).hexdigest()
SHA_B = hashlib.sha256(PAYLOAD_B).hexdigest()


def test_normalize_canonical_shape():
    manifest = [{"name": "a.parquet", "sha256": SHA_A}, {"name": "b.parquet", "sha256": SHA_B}]
    assert fsd._normalize_manifest(manifest) == [("a.parquet", SHA_A), ("b.parquet", SHA_B)]


def test_normalize_powershell_get_filehash_shape_uppercase():
    """Exactly the shape published in the serving-data-2026-09-09 release."""
    manifest = [
        {"file": "a.parquet", "Hash": SHA_A.upper()},
        {"file": "b.parquet", "Hash": SHA_B.upper()},
    ]
    assert fsd._normalize_manifest(manifest) == [("a.parquet", SHA_A), ("b.parquet", SHA_B)]


def test_normalize_unwraps_files_key():
    manifest = {"files": [{"name": "a.parquet", "sha256": SHA_A}]}
    assert fsd._normalize_manifest(manifest) == [("a.parquet", SHA_A)]


@pytest.mark.parametrize(
    "bad",
    [
        [],
        {},
        [{"file": "a.parquet"}],  # no digest
        [{"Hash": SHA_A}],  # no name
        [{"name": "a.parquet", "sha256": "not-hex"}],  # not a SHA256
        [{"name": "a.parquet", "sha256": SHA_A[:-1]}],  # wrong length
        ["a.parquet"],  # not an object
    ],
)
def test_normalize_rejects_malformed(bad):
    with pytest.raises(ValueError):
        fsd._normalize_manifest(bad)


def _make_zip(path: Path, manifest: list[dict], payloads: dict[str, bytes]) -> None:
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("SHA256SUMS.json", json.dumps(manifest, indent=2))
        for name, data in payloads.items():
            zf.writestr(name, data)


def _run_main(monkeypatch, tmp_path: Path, zip_path: Path, out_dir: Path) -> int:
    def fake_download(url: str, dest: Path) -> None:
        dest.write_bytes(zip_path.read_bytes())

    monkeypatch.setattr(fsd, "download", fake_download)
    monkeypatch.setattr("sys.argv", ["fetch_serving_data.py", "--out", str(out_dir)])
    return fsd.main()


def test_main_extracts_when_release_shape_manifest_verifies(monkeypatch, tmp_path):
    zip_path = tmp_path / "release.zip"
    _make_zip(
        zip_path,
        [{"file": "a.parquet", "Hash": SHA_A.upper()}, {"file": "b.parquet", "Hash": SHA_B.upper()}],
        {"a.parquet": PAYLOAD_A, "b.parquet": PAYLOAD_B},
    )
    out = tmp_path / "out"
    assert _run_main(monkeypatch, tmp_path, zip_path, out) == 0
    assert (out / "a.parquet").read_bytes() == PAYLOAD_A
    assert (out / "b.parquet").read_bytes() == PAYLOAD_B


def test_main_refuses_to_extract_on_hash_mismatch(monkeypatch, tmp_path, capsys):
    zip_path = tmp_path / "release.zip"
    _make_zip(
        zip_path,
        [{"file": "a.parquet", "Hash": SHA_B.upper()}],  # wrong digest for a.parquet
        {"a.parquet": PAYLOAD_A},
    )
    out = tmp_path / "out"
    assert _run_main(monkeypatch, tmp_path, zip_path, out) == 1
    assert "SHA256 mismatch" in capsys.readouterr().err
    assert not (out / "a.parquet").exists()
