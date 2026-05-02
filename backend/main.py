"""
FastAPI backend for the Industrial Motor Predictive Maintenance System.

Serves motor telemetry with Isolation Forest anomaly scores and aggregate stats
for a SPA frontend on another origin (CORS enabled). Includes a LangChain
pandas agent backed by Google Gemini for natural-language questions over telemetry.
"""

from __future__ import annotations

import logging

from pydantic import BaseModel
import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_experimental.agents import create_pandas_dataframe_agent

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ml_model import MotorAnomalyDetector

load_dotenv()

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


class ChatRequest(BaseModel):
    """Body for POST /api/chat."""

    message: str


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


@app.post("/api/chat", response_model=None)
def chat(body: ChatRequest) -> dict[str, str] | JSONResponse:
    """
    Answer questions about the loaded motor dataframe using a Gemini-powered agent.

    Schema-first prompt (``include_df_in_prompt=False``) keeps prompts small; the agent
    still runs Python against the full in-memory dataframe. ``temperature=0`` reduces
    hallucination and output variance.

    Requires ``GOOGLE_API_KEY`` (or related Google GenAI env vars) in ``.env``.
    """
    try:
        if os.getenv("GOOGLE_API_KEY") is None:
            logger.warning("GOOGLE_API_KEY is not set; Gemini may reject requests.")

        llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash-latest",
            temperature=0,
        )
        agent = create_pandas_dataframe_agent(
            llm,
            detector._df,
            verbose=True,
            allow_dangerous_code=True,
            include_df_in_prompt=False,
        )
        result = agent.invoke({"input": body.message})
        output = result.get("output")
        if output is None:
            return JSONResponse(
                status_code=500,
                content={
                    "response": "Chat agent returned no output. Check server logs.",
                },
            )
        return {"response": output}
    except Exception as exc:  # noqa: BLE001 — e.g. quota, token limits, tool errors
        logger.exception("Chat agent failed")
        return JSONResponse(
            status_code=500,
            content={
                "response": (
                    f"Chat request failed: {exc}. "
                    "If this persists, check API quota, token limits, and logs."
                ),
            },
        )
