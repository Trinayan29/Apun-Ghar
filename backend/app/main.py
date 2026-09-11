from fastapi import FastAPI
from sqlalchemy import text

from .db import engine

app = FastAPI(title="Rent API")


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/readyz")
def readyz():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ready", "db": "up"}
