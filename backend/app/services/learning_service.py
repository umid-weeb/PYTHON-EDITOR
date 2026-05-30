from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

TOPIC_ALIASES: dict[str, set[str]] = {
    "binary_search": {"binary_search", "binary search", "binarysearch"},
    "trees": {"trees", "tree"},
    "linked_list": {"linked_list", "linked list", "linkedlist"},
    "bfs": {"bfs", "breadth first search", "breadth-first search", "breadthfirstsearch"},
    "dfs": {"dfs", "depth first search", "depth-first search", "depthfirstsearch"},
}
ALLOWED_TOPICS = set(TOPIC_ALIASES)

FALLBACK_REMEDIATION: dict[str, Any] = {
    "binary_search": {
        "concept_explanation": (
            "Binary qidiruv - bu saralangan ro'yxatda elementni logarifmik vaqt ichida topish usuli. "
            "Har safar o'rtadagi elementni tekshirib, chap yoki o'ng bo'limga o'tasiz, shuning uchun vaqt murakkabligi O(log n)."
        ),
        "youtube_embed_id": "v4mC_d6Kq9o",
        "quiz": [
            {
                "question": "Binary search qachon ishlaydi?",
                "options": [
                    "Ro'yxat saralangan bo'lsa",
                    "Ro'yxat tartibsiz bo'lsa",
                    "Faqat bitta element bo'lsa",
                    "Hech qachon",
                ],
                "correct_answer_index": 0,
            }
        ],
    },
    "trees": {
        "concept_explanation": (
            "Daraxtlar — tugunlar va qirralardan tashkil topgan ma'lumotlar tuzilishi. "
            "Root bitta boshlang'ich tugun, leaf esa bolalari bo'lmagan tugun."
        ),
        "youtube_embed_id": "A1b2C3d4E5f",
        "quiz": [
            {
                "question": "Binary tree ning leaf tuguni nima?",
                "options": [
                    "Bolalari yo'q tugun",
                    "Faqat bitta bola bor tugun",
                    "Ikkita bola bor tugun",
                    "Root tugun",
                ],
                "correct_answer_index": 0,
            }
        ],
    },
    "linked_list": {
        "concept_explanation": (
            "Linked list - har bir tugun keyingi tugunni ko'rsatadigan dinamik tuzilma. "
            "Ular oson insert va remove qilinadi, lekin tasodifiy elementni olish O(n) bo'ladi."
        ),
        "youtube_embed_id": "L1nK3dQ9rT0",
        "quiz": [
            {
                "question": "Singly linked listda elementni o'chirish qanday amalga oshadi?",
                "options": [
                    "Oldingi tugunning pointerini o'zgartirish",
                    "Elementni indeks bilan chiqarish",
                    "Massivni qayta saralash",
                    "Imkoniyatsiz",
                ],
                "correct_answer_index": 0,
            }
        ],
    },
    "bfs": {
        "concept_explanation": (
            "BFS (breadth-first search) darajalar bo'yicha grafni yoki daraxtni kezadi. "
            "U navbat (queue) yordamida ishlaydi va har bir tugunni bir marta tashrif buyuradi."
        ),
        "youtube_embed_id": "bFsV9kLmQ8p",
        "quiz": [
            {
                "question": "BFS qaysi ma'lumot tuzilmadan foydalanadi?",
                "options": ["Queue", "Stack", "Hashmap", "Tree"],
                "correct_answer_index": 0,
            }
        ],
    },
    "dfs": {
        "concept_explanation": (
            "DFS (depth-first search) chuqurlik tomon qarab grafni kezadi. "
            "U odatda stack yoki rekursiya yordamida amalga oshiriladi."
        ),
        "youtube_embed_id": "dFsX7nP3kL1",
        "quiz": [
            {
                "question": "DFS nimaga o'xshash tuzilma bilan ishlaydi?",
                "options": ["Stack", "Queue", "Heap", "Map"],
                "correct_answer_index": 0,
            }
        ],
    },
}


def _normalize_topic_tag(topic: str) -> str:
    return str(topic or "").strip().lower().replace("-", " ").replace("_", " ")


def infer_topic_from_tags(tags: list[str] | None, slug: str | None = None) -> str | None:
    normalized_tags = { _normalize_topic_tag(tag) for tag in (tags or []) }
    if slug:
        normalized_tags.add(_normalize_topic_tag(slug))

    for topic, aliases in TOPIC_ALIASES.items():
        if normalized_tags & aliases:
            return topic
    return None


def _validate_topic(topic: str) -> str:
    if topic not in ALLOWED_TOPICS:
        raise ValueError(f"Noto'g'ri topic: {topic}")
    return topic


def get_learning_pattern(db: Session, user_id: int, topic: str) -> dict[str, Any]:
    _validate_topic(topic)
    result = db.execute(
        text(
            "SELECT fail_count, mastery_score, is_locked "
            "FROM user_learning_patterns "
            "WHERE user_id = :user_id AND topic = :topic"
        ),
        {"user_id": user_id, "topic": topic},
    ).mappings().first()

    if result is None:
        return {
            "user_id": user_id,
            "topic": topic,
            "fail_count": 0,
            "mastery_score": 0,
            "is_locked": False,
        }

    return {
        "user_id": user_id,
        "topic": topic,
        "fail_count": int(result["fail_count"]),
        "mastery_score": int(result["mastery_score"]),
        "is_locked": bool(result["is_locked"]),
    }


def record_failure(db: Session, user_id: int, topic: str) -> dict[str, Any]:
    _validate_topic(topic)
    with db.begin():
        row = db.execute(
            text(
                "SELECT id, fail_count, mastery_score, is_locked "
                "FROM user_learning_patterns "
                "WHERE user_id = :user_id AND topic = :topic FOR UPDATE"
            ),
            {"user_id": user_id, "topic": topic},
        ).mappings().first()

        if row is None:
            db.execute(
                text(
                    "INSERT INTO user_learning_patterns(user_id, topic, fail_count, mastery_score, is_locked, updated_at) "
                    "VALUES(:user_id, :topic, 1, 0, false, now())"
                ),
                {"user_id": user_id, "topic": topic},
            )
            return {
                "user_id": user_id,
                "topic": topic,
                "fail_count": 1,
                "mastery_score": 0,
                "is_locked": False,
            }

        new_fail = int(row["fail_count"] or 0) + 1
        is_locked = bool(row["is_locked"])
        if new_fail >= 3 and int(row["mastery_score"] or 0) < 100:
            is_locked = True

        db.execute(
            text(
                "UPDATE user_learning_patterns "
                "SET fail_count = :fail_count, is_locked = :is_locked, updated_at = now() "
                "WHERE id = :id"
            ),
            {"fail_count": new_fail, "is_locked": is_locked, "id": row["id"]},
        )

        return {
            "user_id": user_id,
            "topic": topic,
            "fail_count": new_fail,
            "mastery_score": int(row["mastery_score"] or 0),
            "is_locked": is_locked,
        }


def mark_mastery_complete(db: Session, user_id: int, topic: str) -> dict[str, Any]:
    _validate_topic(topic)
    with db.begin():
        row = db.execute(
            text(
                "SELECT id FROM user_learning_patterns "
                "WHERE user_id = :user_id AND topic = :topic FOR UPDATE"
            ),
            {"user_id": user_id, "topic": topic},
        ).mappings().first()

        if row is None:
            db.execute(
                text(
                    "INSERT INTO user_learning_patterns(user_id, topic, fail_count, mastery_score, is_locked, updated_at) "
                    "VALUES(:user_id, :topic, 0, 100, false, now())"
                ),
                {"user_id": user_id, "topic": topic},
            )
        else:
            db.execute(
                text(
                    "UPDATE user_learning_patterns "
                    "SET fail_count = 0, mastery_score = 100, is_locked = false, updated_at = now() "
                    "WHERE id = :id"
                ),
                {"id": row["id"]},
            )

    return {
        "user_id": user_id,
        "topic": topic,
        "fail_count": 0,
        "mastery_score": 100,
        "is_locked": False,
    }


def get_remediation_payload(topic: str) -> dict[str, Any]:
    _validate_topic(topic)
    return FALLBACK_REMEDIATION.get(topic, {
        "concept_explanation": (
            "Bu mavzu uchun qisqacha tushuntirish mavjud emas. Iltimos, boshqa mavzuni tanlang."
        ),
        "youtube_embed_id": "dQw4w9WgXcQ",
        "quiz": [],
    })
