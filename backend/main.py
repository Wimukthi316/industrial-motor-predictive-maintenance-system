"""
FastAPI backend for the Industrial Motor Predictive Maintenance System.

Serves motor telemetry with Isolation Forest anomaly scores and aggregate stats
for a SPA frontend on another origin (CORS enabled).
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ml_model import MotorAnomalyDetector

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Industrial Motor Predictive Maintenance API",
    description="Motor telemetry and anomaly scores for predictive maintenance dashboards.",
    version="1.0.0",
)

# React (or any browser client) on a different port must be allowed to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Train once at import / worker startup — avoids re-fitting on every request.
detector = MotorAnomalyDetector()
logger.info(
    "MotorAnomalyDetector initialized; rows in dataset: %s",
    detector.loaded_row_count,
)


@app.get("/api/motor-data")
def get_motor_data() -> list[dict]:
    """Return all motor records with ``anomaly_score`` (-1 anomaly, 1 normal)."""
    return detector.get_processed_data()


@app.get("/api/stats")
def get_stats() -> dict[str, int]:
    """
    Summary counts: total rows, normal (score 1), anomalies (score -1).
    """
    data = detector.get_processed_data()
    total = len(data)
    normal = sum(1 for r in data if r.get("anomaly_score") == 1)
    anomalies = sum(1 for r in data if r.get("anomaly_score") == -1)
    return {
        "total_records": total,
        "normal_count": normal,
        "anomaly_count": anomalies,
    }
