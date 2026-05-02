"""
Motor anomaly detection using Isolation Forest on multivariate sensor features.

Loads cleaned motor telemetry from CSV, trains once, and exposes processed rows
with per-record `anomaly_score` labels (-1 = anomaly, 1 = normal per sklearn).
"""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

logger = logging.getLogger(__name__)

# Features used for unsupervised anomaly detection (must exist in CSV or mock data).
FEATURE_COLUMNS: tuple[str, ...] = ("amp", "motor_temp", "vib_x", "vib_y", "vib_z")

# Default CSV path: project root is `backend/`'s parent.
_DEFAULT_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "cleaned_motor_dataset.csv"


class MotorAnomalyDetector:
    """
    Trains an IsolationForest on numerical motor features and scores each row.
    """

    def __init__(
        self,
        csv_path: Path | str | None = None,
        *,
        contamination: float | str = "auto",
        random_state: int = 42,
        n_estimators: int = 100,
    ) -> None:
        self._csv_path = Path(csv_path) if csv_path is not None else _DEFAULT_DATA_PATH
        self._contamination = contamination
        self._random_state = random_state
        self._n_estimators = n_estimators

        self._df: pd.DataFrame = pd.DataFrame()
        self._model: IsolationForest | None = None

        self._load_dataset()
        self.train()

    @property
    def loaded_row_count(self) -> int:
        """Number of rows in the working dataframe (after CSV load or mock)."""
        return len(self._df)

    def _minimal_mock_dataframe(self) -> pd.DataFrame:
        """Synthetic rows so the API can still run when the dataset is missing."""
        return pd.DataFrame(
            {
                "amp": [0.1, 0.12, 0.08, 2.5],
                "motor_temp": [27.0, 27.5, 26.8, 45.0],
                "vib_x": [0.5, -0.2, 0.8, 5.0],
                "vib_y": [0.3, 0.1, -0.4, 4.0],
                "vib_z": [1.0, 1.2, 0.9, 3.0],
                "timestamp": pd.date_range("2026-01-01", periods=4, freq="5min"),
                "motor_id": ["MTR-MOCK"] * 4,
                "status": ["Normal", "Normal", "Normal", "Fault"],
            }
        )

    def _load_dataset(self) -> None:
        """Load CSV into ``self._df``; on failure, use an empty frame or minimal mock data."""
        try:
            self._df = pd.read_csv(self._csv_path)
            if self._df.empty:
                logger.warning("CSV at %s is empty; using minimal mock data.", self._csv_path)
                self._df = self._minimal_mock_dataframe()
                return
            missing = [c for c in FEATURE_COLUMNS if c not in self._df.columns]
            if missing:
                logger.warning(
                    "CSV missing columns %s; using minimal mock data.",
                    missing,
                )
                self._df = self._minimal_mock_dataframe()
        except FileNotFoundError:
            logger.warning("Dataset not found at %s; using minimal mock data.", self._csv_path)
            self._df = self._minimal_mock_dataframe()
        except Exception as exc:  # noqa: BLE001 — deliberate broad catch for robust startup
            logger.exception("Failed to load motor dataset: %s", exc)
            self._df = self._minimal_mock_dataframe()

    def train(self) -> None:
        """
        Fit ``IsolationForest`` on the five numerical feature columns.

        No-op if there is no data or required columns are absent after load.
        """
        if self._df.empty:
            self._model = None
            return

        for col in FEATURE_COLUMNS:
            if col not in self._df.columns:
                logger.error("Cannot train: column %r missing.", col)
                self._model = None
                return

        X = self._df.loc[:, list(FEATURE_COLUMNS)].copy()
        # Coerce to numeric and fill NaNs so fit/predict remain stable.
        X = X.apply(pd.to_numeric, errors="coerce").replace([np.inf, -np.inf], np.nan)
        if X.isna().any().any():
            X = X.fillna(X.median(numeric_only=True))
        X = X.fillna(0.0)

        n_samples = len(X)
        n_trees = min(self._n_estimators, 10) if n_samples < 2 else self._n_estimators
        self._model = IsolationForest(
            n_estimators=n_trees,
            contamination=self._contamination,
            random_state=self._random_state,
        )
        self._model.fit(X.values)

    def get_processed_data(self) -> list[dict[str, Any]]:
        """
        Return all loaded records as dicts, each with ``anomaly_score`` (-1 or 1).

        If the model is not trained or data is empty, returns an empty list.
        """
        if self._df.empty or self._model is None:
            return []

        for col in FEATURE_COLUMNS:
            if col not in self._df.columns:
                return []

        X = self._df.loc[:, list(FEATURE_COLUMNS)].copy()
        X = X.apply(pd.to_numeric, errors="coerce").replace([np.inf, -np.inf], np.nan)
        if X.isna().any().any():
            X = X.fillna(X.median(numeric_only=True))
        X = X.fillna(0.0)

        scores = self._model.predict(X.values)
        out_df = self._df.copy()
        out_df["anomaly_score"] = scores.astype(np.int8)

        records: list[dict[str, Any]] = []
        for rec in out_df.to_dict(orient="records"):
            row: dict[str, Any] = {}
            for key, val in rec.items():
                if val is not None and isinstance(val, float) and pd.isna(val):
                    row[key] = None
                elif isinstance(val, (pd.Timestamp, datetime)):
                    row[key] = val.isoformat()
                elif isinstance(val, (np.integer, np.int64, np.int32)):
                    row[key] = int(val)
                elif isinstance(val, (np.floating, np.float64)):
                    row[key] = float(val)
                elif isinstance(val, (np.bool_,)):
                    row[key] = bool(val)
                else:
                    row[key] = val
            row["anomaly_score"] = int(row["anomaly_score"])
            records.append(row)

        return records
