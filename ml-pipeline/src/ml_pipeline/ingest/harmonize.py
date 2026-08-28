"""
FIRMS CSV Harmonization - Unify schema across VIIRS/SUOMI/SV-C2 sources.
"""
import pandas as pd
from pathlib import Path
from loguru import logger
from typing import Optional

from .schema import FireRecordRaw, FireRecordHarmonized, infer_instrument
from ..config import settings

try:
    import h3
    H3_AVAILABLE = True
except ImportError:
    H3_AVAILABLE = False
    logger.warning("h3 not available - H3 indexing will be skipped")


def parse_acq_time(acq_time: int) -> pd.Series:
    """Parse HHMM integer to time components."""
    # Handle both HHMM and HMM formats
    acq_time_str = acq_time.astype(str).str.zfill(4)
    hours = acq_time_str.str[:2].astype(int)
    minutes = acq_time_str.str[2:].astype(int)
    return hours, minutes


def parse_acq_datetime(acq_date: pd.Series, acq_time: pd.Series) -> pd.Series:
    """Combine date and time columns into UTC datetime."""
    hours, minutes = parse_acq_time(acq_time)
    # Create datetime - assume UTC
    return pd.to_datetime(acq_date) + pd.to_timedelta(hours, unit='h') + pd.to_timedelta(minutes, unit='m')


def add_h3_indices(df: pd.DataFrame, lat_col: str = "latitude", lng_col: str = "longitude",
                   res7: int = 7, res8: int = 8) -> pd.DataFrame:
    """Add H3 cell indices at two resolutions."""
    if not H3_AVAILABLE:
        logger.warning("H3 not available, skipping H3 indexing")
        df[f"h3_cell_{res7}"] = ""
        df[f"h3_cell_{res8}"] = ""
        return df

    logger.info(f"Computing H3 indices at resolutions {res7} and {res8}")
    df[f"h3_cell_{res7}"] = df.apply(
        lambda row: h3.latlng_to_cell(row[lat_col], row[lng_col], res7), axis=1
    )
    df[f"h3_cell_{res8}"] = df.apply(
        lambda row: h3.latlng_to_cell(row[lat_col], row[lng_col], res8), axis=1
    )
    return df


def harmonize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Harmonize a single DataFrame to the unified schema.
    Handles column differences across FIRMS data sources.
    """
    logger.info(f"Harmonizing DataFrame with {len(df)} rows, columns: {list(df.columns)}")

    # Ensure all expected columns exist (fill missing with None)
    expected_cols = [
        "latitude", "longitude", "bright_ti4", "scan", "track",
        "acq_date", "acq_time", "satellite", "confidence", "version",
        "bright_ti5", "frp", "daynight", "instrument", "type"
    ]
    for col in expected_cols:
        if col not in df.columns:
            df[col] = None

    # Normalize satellite codes
    df["satellite"] = df["satellite"].astype(str).str.upper().str[0]

    # Infer instrument from satellite if missing
    if df["instrument"].isna().all():
        df["instrument"] = df["satellite"].map(lambda s: infer_instrument(s))

    # Normalize confidence
    conf_map = {"l": "low", "n": "nominal", "h": "high",
                "low": "low", "nominal": "nominal", "high": "high"}
    df["confidence"] = df["confidence"].astype(str).str.lower().map(conf_map).fillna("low")

    # Normalize daynight
    df["daynight"] = df["daynight"].astype(str).str.upper().str[0]

    # Version as string
    df["version"] = df["version"].astype(str)

    # Type as nullable int
    if "type" in df.columns:
        df["type"] = pd.to_numeric(df["type"], errors="coerce").astype("Int64")

    # Parse dates and times
    df["acq_date"] = pd.to_datetime(df["acq_date"], format="%Y-%m-%d").dt.date
    df["acq_time"] = pd.to_datetime(df["acq_time"].astype(str).str.zfill(4), format="%H%M").dt.time
    df["acquired_at"] = parse_acq_datetime(
        pd.to_datetime(df["acq_date"]), df["acq_time"]
    )

    # Add H3 indices
    df = add_h3_indices(df)

    # Select and order columns for output
    output_cols = [
        "latitude", "longitude", "bright_ti4", "scan", "track",
        "acq_date", "acq_time", "acquired_at",
        "satellite", "instrument", "confidence", "version",
        "bright_ti5", "frp", "daynight", "type",
        "h3_cell_7", "h3_cell_8",
    ]

    # Ensure all output columns exist
    for col in output_cols:
        if col not in df.columns:
            df[col] = None

    return df[output_cols]


def harmonize_csv_files(
    input_dir: Optional[Path] = None,
    output_path: Optional[Path] = None,
    pattern: str = "*.csv"
) -> pd.DataFrame:
    """
    Read all CSV files from input_dir, harmonize, and save as single Parquet.

    Args:
        input_dir: Directory containing raw CSV files (default: settings.data_raw_dir)
        output_path: Output Parquet path (default: settings.data_processed_dir / "fires_harmonized.parquet")
        pattern: Glob pattern for CSV files

    Returns:
        Harmonized DataFrame
    """
    input_dir = input_dir or settings.data_raw_dir
    output_path = output_path or (settings.data_processed_dir / "fires_harmonized.parquet")

    logger.info(f"Reading CSV files from {input_dir} matching {pattern}")

    csv_files = list(input_dir.glob(pattern))
    if not csv_files:
        raise FileNotFoundError(f"No CSV files found in {input_dir} matching {pattern}")

    logger.info(f"Found {len(csv_files)} CSV files: {[f.name for f in csv_files]}")

    # Read and harmonize each file
    dfs = []
    for csv_file in csv_files:
        logger.info(f"Reading {csv_file.name}...")
        try:
            df = pd.read_csv(csv_file, low_memory=False)
            logger.info(f"  Rows: {len(df)}, Columns: {len(df.columns)}")
            df_harmonized = harmonize_dataframe(df)
            dfs.append(df_harmonized)
        except Exception as e:
            logger.error(f"Failed to process {csv_file}: {e}")
            raise

    # Concatenate all
    combined = pd.concat(dfs, ignore_index=True)
    logger.info(f"Combined harmonized rows: {len(combined)}")

    # Sort by acquired_at for temporal consistency
    combined = combined.sort_values("acquired_at").reset_index(drop=True)

    # Save
    output_path.parent.mkdir(parents=True, exist_ok=True)
    combined.to_parquet(output_path, index=False)
    logger.info(f"Saved harmonized data to {output_path} ({output_path.stat().st_size / 1e6:.1f} MB)")

    return combined


def main():
    """CLI entry point."""
    import argparse
    parser = argparse.ArgumentParser(description="Harmonize FIRMS CSV files to Parquet")
    parser.add_argument("--input-dir", type=Path, default=settings.data_raw_dir)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--pattern", type=str, default="*.csv")
    args = parser.parse_args()

    harmonize_csv_files(args.input_dir, args.output, args.pattern)


if __name__ == "__main__":
    main()