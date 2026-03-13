from pathlib import Path
import sys

from fastapi.testclient import TestClient


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app


client = TestClient(app)


def test_list_problems_supports_pagination_and_query() -> None:
    response = client.get(
        "/api/problems",
        params={
            "page": 1,
            "per_page": 1,
            "q": "two",
            "tags": "array",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["page"] == 1
    assert payload["per_page"] == 1
    assert payload["total"] >= 1
    assert payload["total_pages"] >= 1
    assert payload["selected_tags"] == ["array"]
    assert payload["items"][0]["id"] == "two_sum"


def test_get_problem_returns_detail_without_hidden_tests() -> None:
    response = client.get("/api/problem/two_sum")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "two_sum"
    assert payload["title"] == "Two Sum"
    assert payload["function_name"] == "twoSum"
    assert payload["hidden_testcase_count"] >= 0
    assert "hidden_testcases" not in payload
    assert len(payload["visible_testcases"]) == 4


def test_health_endpoints_report_ok() -> None:
    health = client.get("/health")
    db = client.get("/health/db")
    cache = client.get("/health/cache")

    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert db.status_code == 200
    assert db.json()["status"] == "ok"
    assert cache.status_code == 200
    assert cache.json()["status"] == "ok"
