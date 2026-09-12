from fastapi import FastAPI
from sqlalchemy import text

from .db import engine
from .users import router as users_router

app = FastAPI(title="Rent API")

app.include_router(users_router)


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/readyz")
def readyz():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ready", "db": "up"}
