from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .db import engine
from .locations import router as locations_router
from .owners import router as owners_router
from .users import router as users_router

app = FastAPI(title="Rent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(users_router)
app.include_router(owners_router)
app.include_router(locations_router)


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/readyz")
def readyz():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ready", "db": "up"}
