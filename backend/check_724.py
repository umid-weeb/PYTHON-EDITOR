import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.problem import Problem
from app.models.problem_translation import ProblemTranslation

with SessionLocal() as db:
    prob = db.query(Problem).filter_by(id="find-pivot-index").first()
    if prob:
        print(f"Problem found: {prob.title}")
        translations = db.query(ProblemTranslation).filter_by(problem_id=prob.id).all()
        for t in translations:
            print(f"Translation [{t.language_code}]: {t.title}")
    else:
        print("Problem not found.")
