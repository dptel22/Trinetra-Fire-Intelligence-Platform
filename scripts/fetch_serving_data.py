#!/usr/bin/env python3
"""Fetch the Trinetra serving parquets from the GitHub Releases asset.

A fresh clone has no data/processed parquets (gitignored). This script
downloads the serving-data release ZIP, verifies every file against the
SHA256SUMS.json manifest shipped inside the ZIP, and extracts the parquets
into data/processed/. Fail-closed: any hash mismatch aborts the extraction
and no partial file is left behind.

Usage:
    python scripts/fetch_serving_data.py                       # default release
    python scripts/fetch_serving_data.py --url <zip-url>       # specific release
    python scripts/fetch_serving_data.py --out data/processed  # custom target

Stdlib only — no project dependencies required.
"""

from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import re
import shutil
import socket
import sys
import tempfile
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

DEFAULT_ZIP_URL = (
    "https://github.com/dptel22/Trinetra-Fire-Intelligence-Platform/releases/"
    "download/serving-data-2026-09-09/sih2026-serving-data-v1.zip"
)
MANIFEST_NAME = "SHA256SUMS.json"
CHUNK = 1 << 20  # 1 MiB

# Release downloads redirect to GitHub's asset CDN, so both are allowlisted.
ALLOWED_HOSTS = {
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
}


class _UnsafeURLError(ValueError):
    """Raised when a URL fails the scheme/host/IP safety checks."""


def _assert_public_host(host: str) -> None:
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror as err:
        raise _UnsafeURLError(f"could not resolve host {host!r}: {err}") from err
    if not infos:
        raise _UnsafeURLError(f"could not resolve host {host!r}")
    for info in infos:
        addr = ipaddress.ip_address(info[4][0])
        if (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_reserved
            or addr.is_multicast
            or addr.is_unspecified
        ):
            raise _UnsafeURLError(
                f"{host!r} resolves to a non-public address ({addr}); refusing to connect"
            )


def _validate_url(url: str) -> None:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https":
        raise _UnsafeURLError(f"only https URLs are allowed, got scheme {parsed.scheme!r}")
    host = parsed.hostname
    if not host or host.lower() not in ALLOWED_HOSTS:
        raise _UnsafeURLError(f"host {host!r} is not in the allowlist {sorted(ALLOWED_HOSTS)}")
    _assert_public_host(host)


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Redirect handler that re-validates every hop (scheme/host/resolved IPs)."""

    max_redirections = 5

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_OPENER = urllib.request.build_opener(_SafeRedirectHandler())


def _sha256_stream(handle) -> str:
    h = hashlib.sha256()
    for chunk in iter(lambda: handle.read(CHUNK), b""):
        h.update(chunk)
    return h.hexdigest()


_NAME_KEYS = ("name", "file", "filename", "path")
_HASH_KEYS = ("sha256", "hash", "checksum")


def _normalize_manifest(manifest) -> list[tuple[str, str]]:
    """Return ``[(file_name, sha256_hex_lowercase), ...]`` from a release manifest.

    Accepts the canonical ``{"name": ..., "sha256": ...}`` shape and the
    ``{"file": ..., "Hash": ...}`` shape emitted by PowerShell ``Get-FileHash``
    (the shape the published ``serving-data-2026-09-09`` release actually ships).
    Keys are matched case-insensitively; a top-level ``{"files": [...]}``
    wrapper is unwrapped. Raises ``ValueError`` on any malformed entry so the
    caller refuses to extract unverified data.
    """
    entries = manifest.get("files", manifest) if isinstance(manifest, dict) else manifest
    if not isinstance(entries, list) or not entries:
        raise ValueError(f"manifest has no file entries: {manifest!r}")
    normalized: list[tuple[str, str]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError(f"malformed manifest entry: {entry!r}")
        lowered = {str(k).lower(): v for k, v in entry.items()}
        name = next((lowered[k] for k in _NAME_KEYS if isinstance(lowered.get(k), str) and lowered[k]), None)
        digest = next((lowered[k] for k in _HASH_KEYS if isinstance(lowered.get(k), str) and lowered[k]), None)
        if not name or not digest:
            raise ValueError(f"malformed manifest entry: {entry!r}")
        digest = digest.strip().lower()
        if not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ValueError(f"manifest entry for '{name}' has a non-SHA256 digest: {entry!r}")
        normalized.append((name, digest))
    return normalized


def download(url: str, dest: Path) -> None:
    _validate_url(url)
    print(f"Downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "trinetra-fetch-serving-data/1.0"})
    with _OPENER.open(req, timeout=120) as resp, dest.open("wb") as out:
        total = int(resp.headers.get("Content-Length", 0))
        done = 0
        while True:
            chunk = resp.read(CHUNK)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            if total:
                print(f"\r  {done / 1e6:.1f} / {total / 1e6:.1f} MB", end="", flush=True)
    print()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--url", default=DEFAULT_ZIP_URL, help="Serving-data release ZIP URL (https, GitHub only)")
    ap.add_argument("--out", default="data/processed", help="Extraction target directory")
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="trinetra-serving-") as tmp:
        zip_path = Path(tmp) / "serving-data.zip"
        try:
            download(args.url, zip_path)
        except _UnsafeURLError as err:
            print(f"ERROR: URL rejected: {err}", file=sys.stderr)
            return 1
        except Exception as err:  # noqa: BLE001 - report any network failure plainly
            print(f"ERROR: download failed: {err}", file=sys.stderr)
            return 1

        with zipfile.ZipFile(zip_path) as zf:
            names = zf.namelist()
            manifest_members = [n for n in names if Path(n).name == MANIFEST_NAME]
            if not manifest_members:
                print(
                    f"ERROR: {MANIFEST_NAME} not found inside the ZIP; refusing to extract unverified data.",
                    file=sys.stderr,
                )
                return 1
            manifest = json.loads(zf.read(manifest_members[0]))

            try:
                entries = _normalize_manifest(manifest)
            except ValueError as err:
                print(f"ERROR: {err}", file=sys.stderr)
                return 1
            verified = 0
            for name, expected in entries:
                members = [n for n in names if Path(n).name == name]
                if not members:
                    print(f"ERROR: manifest lists '{name}' but it is not in the ZIP", file=sys.stderr)
                    return 1
                with zf.open(members[0]) as f:
                    actual = _sha256_stream(f)
                if actual != expected:
                    print(
                        f"ERROR: SHA256 mismatch for {name}\n  expected {expected}\n  actual   {actual}",
                        file=sys.stderr,
                    )
                    return 1
                print(f"  verified {name}")
                verified += 1

            extracted = 0
            for name, _expected in entries:
                member = next(n for n in names if Path(n).name == name)
                target = out_dir / Path(name).name
                with zf.open(member) as src, target.open("wb") as dst:
                    shutil.copyfileobj(src, dst)
                extracted += 1
            print(f"Extracted {extracted} file(s) into {out_dir} ({verified} verified against {MANIFEST_NAME})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
