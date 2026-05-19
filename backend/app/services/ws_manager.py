import json
from typing import Dict, List
from fastapi import WebSocket

class ContestWSManager:
    def __init__(self):
        # contest_id -> list of active websockets
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, contest_id: str):
        await websocket.accept()
        if contest_id not in self.active_connections:
            self.active_connections[contest_id] = []
        self.active_connections[contest_id].append(websocket)

    def disconnect(self, websocket: WebSocket, contest_id: str):
        if contest_id in self.active_connections:
            try:
                self.active_connections[contest_id].remove(websocket)
            except ValueError:
                pass

    async def broadcast(self, contest_id: str, message: dict):
        if contest_id in self.active_connections:
            msg_str = json.dumps(message)
            for connection in self.active_connections[contest_id]:
                try:
                    await connection.send_text(msg_str)
                except Exception:
                    pass # Connection might be dead

contest_ws_manager = ContestWSManager()


class ProblemPresenceManager:
    def __init__(self):
        self.active: Dict[str, set] = {}

    async def connect(self, websocket: WebSocket, slug: str) -> None:
        await websocket.accept()
        if slug not in self.active:
            self.active[slug] = set()
        self.active[slug].add(websocket)

    def disconnect(self, websocket: WebSocket, slug: str) -> None:
        if slug in self.active:
            self.active[slug].discard(websocket)
            if not self.active[slug]:
                del self.active[slug]

    def count(self, slug: str) -> int:
        return len(self.active.get(slug, set()))

    async def broadcast_count(self, slug: str) -> None:
        if slug not in self.active:
            return
        msg = json.dumps({"count": self.count(slug)})
        dead = []
        for ws in list(self.active[slug]):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active[slug].discard(ws)


problem_presence_manager = ProblemPresenceManager()