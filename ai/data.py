"""Canonical synthetic case data, loaded independently of the working directory."""

import json
from pathlib import Path


DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "city_data.json"
with DATA_PATH.open(encoding="utf-8") as source:
    CITY_DATA = json.load(source)

BUDGET = CITY_DATA["budget"]
HORIZON = CITY_DATA["horizon"]
DECISION_COUNT = CITY_DATA["decision_count"]
MAX_PER_DIRECTION = CITY_DATA["max_per_direction"]
CRITICAL_THRESHOLD = CITY_DATA["critical_threshold"]
INDICATORS = CITY_DATA["indicators"]
DISTRICTS = CITY_DATA["districts"]
MEASURES = CITY_DATA["measures"]
SYNERGIES = CITY_DATA["synergies"]
INCOMPATIBILITIES = CITY_DATA["incompatibilities"]
DEMO_PLAN = CITY_DATA["demo_plan"]
