from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)


def test_allowed_origin_receives_cors_header():
    res = client.get("/healthz", headers={"Origin": "http://localhost:3000"})
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_disallowed_origin_receives_no_cors_header():
    res = client.get("/healthz", headers={"Origin": "http://evil.example.com"})
    assert res.status_code == 200
    assert "access-control-allow-origin" not in res.headers


def test_preflight_from_allowed_origin():
    res = client.options(
        "/api/v1/users/me",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_preflight_permits_delete_draft():
    # Regression: the owner draft-delete endpoint issues a browser
    # preflight (Authorization + Content-Type headers); if DELETE is
    # missing from allow_methods, the browser never sends the request
    # and the frontend surfaces a transport error. Same gate protects
    # the listing photo-delete endpoint.
    res = client.options(
        "/api/v1/owner/listings/1/draft",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "DELETE",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "DELETE" in res.headers["access-control-allow-methods"]
