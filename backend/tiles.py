"""MBTiles tile server for OpenStreetMap Astana vector tiles."""
import json
import sqlite3
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Response

ROOT = Path(__file__).resolve().parents[1]
MBTILES_PATH = ROOT / "osm-2020-02-10-v3.11_kazakhstan_astana.mbtiles"

router = APIRouter(prefix="/api/tiles", tags=["tiles"])

_db_conn: Optional[sqlite3.Connection] = None
_metadata: dict = {}


def get_db() -> sqlite3.Connection:
    global _db_conn, _metadata
    if _db_conn is None:
        if not MBTILES_PATH.exists():
            raise FileNotFoundError(f"MBTiles file not found at {MBTILES_PATH}")
        # Open in read-only mode, safe for concurrent read threads
        uri = f"file:{MBTILES_PATH.resolve().as_posix()}?mode=ro"
        _db_conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
        _db_conn.row_factory = sqlite3.Row

        # Cache metadata
        cur = _db_conn.cursor()
        cur.execute("SELECT name, value FROM metadata")
        for row in cur.fetchall():
            _metadata[row["name"]] = row["value"]

    return _db_conn


@router.get("/metadata")
def metadata():
    """Return MBTiles metadata and layer information."""
    try:
        get_db()
        data = dict(_metadata)
        if "json" in data:
            try:
                data["json"] = json.loads(data["json"])
            except Exception:
                pass
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{z}/{x}/{y}.pbf")
def serve_tile(z: int, x: int, y: int):
    """Serve vector tile in PBF format. Converts standard XYZ to MBTiles TMS coordinate."""
    if not (0 <= z <= 14):
        return Response(status_code=204)

    # Convert Slippy map tile (XYZ) to TMS tile_row:
    # In MBTiles / TMS: tile_row = (2^z - 1) - y
    y_tms = (1 << z) - 1 - y

    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?",
            (z, x, y_tms),
        )
        row = cur.fetchone()
        if not row or not row["tile_data"]:
            return Response(status_code=204)

        tile_bytes = row["tile_data"]

        # Tiles in MBTiles are already gzip-compressed.
        # Returning with Content-Encoding: gzip allows the browser to transparently decompress.
        return Response(
            content=tile_bytes,
            media_type="application/x-protobuf",
            headers={
                "Content-Encoding": "gzip",
                "Cache-Control": "public, max-age=86400, immutable",
                "Access-Control-Allow-Origin": "*",
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Tile retrieval error: {exc}")
