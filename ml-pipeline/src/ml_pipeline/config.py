"""
Configuration for ML Pipeline using Pydantic Settings.
"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Data paths
    data_raw_dir: Path = Field(default=Path("data/raw"), description="Raw CSV input directory")
    data_processed_dir: Path = Field(default=Path("data/processed"), description="Processed Parquet output directory")
    data_sample_dir: Path = Field(default=Path("data/sample"), description="Sample data for CI")

    # Model paths
    model_path: Path = Field(default=Path("ml-pipeline/train/model.xgb"), description="Trained model artifact")
    metrics_path: Path = Field(default=Path("ml-pipeline/train/metrics.json"), description="Training metrics")
    feature_importance_path: Path = Field(default=Path("ml-pipeline/train/feature_importance.csv"), description="Feature importance CSV")
    config_path: Path = Field(default=Path("ml-pipeline/train/config.yaml"), description="Training config YAML")

    # FIRMS API
    firms_api_key: str = Field(default="", description="NASA FIRMS API key")
    firms_base_url: str = Field(default="https://firms.modaps.eosdis.nasa.gov/api", description="FIRMS API base URL")

    # H3 settings
    h3_resolution: int = Field(default=7, description="H3 resolution for spatial indexing (7 or 8)")
    h3_resolution_fine: int = Field(default=8, description="Fine H3 resolution")

    # Feature engineering
    persistence_window_days: int = Field(default=90, description="Rolling window for persistence feature")
    min_history_days: int = Field(default=30, description="Minimum history days for a cell to be considered")

    # Rule thresholds
    frp_threshold_mw: float = Field(default=40.0, description="FRP threshold in MW for high risk")
    brightness_threshold_k: float = Field(default=320.0, description="Brightness temperature threshold in K")
    confidence_min: str = Field(default="nominal", description="Minimum confidence level (low/nominal/high)")
    persistence_min: int = Field(default=3, description="Minimum persistence count for high risk")

    # Training
    train_split_date: str = Field(default="2024-10-01", description="Temporal split date (train before, val after)")
    test_size: float = Field(default=0.2, description="Test split fraction (if not temporal)")
    random_state: int = Field(default=42, description="Random seed")

    # XGBoost params
    xgb_objective: str = Field(default="multi:softprob", description="XGBoost objective")
    xgb_num_class: int = Field(default=4, description="Number of classes")
    xgb_tree_method: str = Field(default="hist", description="Tree method (hist/gpu_hist)")
    xgb_max_depth: int = Field(default=6, description="Max tree depth")
    xgb_eta: float = Field(default=0.1, description="Learning rate")
    xgb_subsample: float = Field(default=0.8, description="Subsample ratio")
    xgb_colsample_bytree: float = Field(default=0.8, description="Column sample by tree")
    xgb_early_stopping_rounds: int = Field(default=50, description="Early stopping rounds")
    xgb_n_estimators: int = Field(default=500, description="Max number of estimators")
    xgb_eval_metric: str = Field(default="mlogloss", description="Evaluation metric")

    # Logging
    log_level: str = Field(default="INFO", description="Log level")


settings = Settings()