from fastapi.testclient import TestClient
from app.main import app


class DummyProblemService:
    async def get_problem(self, slug: str):
        return type("P", (), {"title": "Dummy Problem"})()


class DummyAIService:
    async def get_hint(self, code: str, problem_title: str, language: str) -> str:
        return "Bu test yo'nalish"


def test_ai_hint_endpoint(monkeypatch):
    # Override dependencies to avoid DB and external AI calls
    import app.api.routes.ai as ai_routes

    app.dependency_overrides[ai_routes.get_problem_service] = lambda: DummyProblemService()
    app.dependency_overrides[ai_routes.get_ai_service] = lambda: DummyAIService()

    client = TestClient(app)

    payload = {"code": "print('hi')", "problem_slug": "dummy", "language": "python"}
    resp = client.post("/api/ai/hint", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data.get("hint") == "Bu test yo'nalish"
