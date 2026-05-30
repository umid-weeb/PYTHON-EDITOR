from fastapi.testclient import TestClient
from app.main import app


class DummyUser:
    def __init__(self, user_id: int):
        self.id = user_id


def test_get_learning_patterns_route(monkeypatch):
    import app.api.routes.learning as learning_routes

    app.dependency_overrides[learning_routes.get_current_user] = lambda: DummyUser(42)
    monkeypatch.setattr(
        learning_routes,
        "get_learning_pattern",
        lambda db, user_id, topic: {
            "user_id": user_id,
            "topic": topic,
            "fail_count": 2,
            "mastery_score": 20,
            "is_locked": False,
        },
    )

    client = TestClient(app)
    response = client.get("/api/learning-patterns/42/binary_search")
    assert response.status_code == 200, response.text
    assert response.json() == {
        "user_id": 42,
        "topic": "binary_search",
        "fail_count": 2,
        "mastery_score": 20,
        "is_locked": False,
    }
    app.dependency_overrides = {}


def test_get_adaptive_remediation_route_fallback(monkeypatch):
    import app.api.routes.learning as learning_routes

    app.dependency_overrides[learning_routes.get_current_user] = lambda: DummyUser(42)
    async def _mock_fetch_adaptive_service_payload(user_id, topic):
        return {}

    monkeypatch.setattr(learning_routes, "_fetch_adaptive_service_payload", _mock_fetch_adaptive_service_payload)

    client = TestClient(app)
    response = client.get("/api/ai/adaptive/remediation?topic=bfs")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["youtube_embed_id"] == "bFsV9kLmQ8p"
    assert "concept_explanation" in data
    assert isinstance(data["quiz"], list)
    app.dependency_overrides = {}


def test_post_learning_complete_route(monkeypatch):
    import app.api.routes.learning as learning_routes

    app.dependency_overrides[learning_routes.get_current_user] = lambda: DummyUser(42)
    monkeypatch.setattr(
        learning_routes,
        "mark_mastery_complete",
        lambda db, user_id, topic: {
            "user_id": user_id,
            "topic": topic,
            "fail_count": 0,
            "mastery_score": 100,
            "is_locked": False,
        },
    )

    client = TestClient(app)
    response = client.post("/api/learning/complete", json={"topic": "linked_list"})
    assert response.status_code == 200, response.text
    assert response.json()["mastery_score"] == 100
    app.dependency_overrides = {}


def test_post_learning_failure_route(monkeypatch):
    import app.api.routes.learning as learning_routes

    app.dependency_overrides[learning_routes.get_current_user] = lambda: DummyUser(42)
    monkeypatch.setattr(
        learning_routes,
        "record_failure",
        lambda db, user_id, topic: {
            "user_id": user_id,
            "topic": topic,
            "fail_count": 3,
            "mastery_score": 0,
            "is_locked": True,
        },
    )

    client = TestClient(app)
    response = client.post("/api/learning/failure", json={"topic": "dfs"})
    assert response.status_code == 200, response.text
    assert response.json()["is_locked"] is True
    app.dependency_overrides = {}
