import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_tiles_metadata():
    response = client.get("/api/tiles/metadata")
    assert response.status_code == 200
    data = response.json()
    assert data.get("name") == "OpenMapTiles"
    assert data.get("format") == "pbf"
    assert "bounds" in data


def test_serve_valid_tile():
    # Tile at Astana center z=14, x=11442, y=5475
    response = client.get("/api/tiles/14/11442/5475.pbf")
    assert response.status_code == 200
    assert len(response.content) > 0
    assert response.headers.get("content-encoding") == "gzip"


def test_serve_empty_or_out_of_bounds_tile():
    # Tile far outside bounds or non-existent
    response = client.get("/api/tiles/14/0/0.pbf")
    assert response.status_code == 204

    # Zoom beyond 14
    response = client.get("/api/tiles/15/0/0.pbf")
    assert response.status_code == 204
