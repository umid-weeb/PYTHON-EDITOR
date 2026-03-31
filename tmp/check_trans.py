import os
import sys

# Add backend to sys.path
sys.path.append(os.path.abspath("backend"))

from app.database import SessionLocal
from app.models.problem_translation import ProblemTranslation

def check_translations():
    with SessionLocal() as db:
        trans = db.query(ProblemTranslation).all()
        for t in trans:
            if "solve(self)" in str(t.starter_code or "") or "(self)" in str(t.starter_code or ""):
                print(f"Translation: {t.problem_id} (Lang: {t.language_code})")
                print(f"  Starter: {t.starter_code}")
                print("-" * 20)

if __name__ == "__main__":
    check_translations()
