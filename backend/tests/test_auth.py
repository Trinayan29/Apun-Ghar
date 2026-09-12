from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app import auth as auth_module

probe = FastAPI()


@probe.get("/probe")
def probe_route(claims: dict = Depends(auth_module.get_firebase_claims)):
    return {"uid": claims["uid"]}


client = TestClient(probe, raise_server_exceptions=False)


def test_missing_header_returns_401():
    res = client.get("/probe")
    assert res.status_code == 401


def test_malformed_header_returns_401():
    res = client.get("/probe", headers={"Authorization": "Token abc123"})
    assert res.status_code == 401
    res = client.get("/probe", headers={"Authorization": "Bearer "})
    assert res.status_code == 401


def test_invalid_token_returns_401(monkeypatch):
    def boom(token):
        raise ValueError("bad token")

    monkeypatch.setattr(auth_module.firebase_auth, "verify_id_token", boom)
    res = client.get("/probe", headers={"Authorization": "Bearer invalid"})
    assert res.status_code == 401


def test_wrong_project_token_returns_401(monkeypatch):
    def wrong_audience(token):
        raise ValueError("audience mismatch")

    monkeypatch.setattr(auth_module.firebase_auth, "verify_id_token", wrong_audience)
    res = client.get("/probe", headers={"Authorization": "Bearer other-project-token"})
    assert res.status_code == 401


def test_valid_token_returns_claims(monkeypatch):
    def ok(token):
        assert token == "good-token"
        return {"uid": "test-uid-1", "email": "t@example.com"}

    monkeypatch.setattr(auth_module.firebase_auth, "verify_id_token", ok)
    res = client.get("/probe", headers={"Authorization": "Bearer good-token"})
    assert res.status_code == 200
    assert res.json() == {"uid": "test-uid-1"}
