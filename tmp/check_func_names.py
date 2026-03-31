import os
import sys
from sqlalchemy.orm import sessionmaker

# Add backend to sys.path
sys.path.append(os.path.abspath("backend"))

from app.database import SessionLocal
from app.models.problem import Problem

def check_function_names():
    with SessionLocal() as db:
        problems = db.query(Problem).all()
        for p in problems:
            # Check for generic anomalies
            if "(" in str(p.function_name or "") or "self" in str(p.function_name or ""):
                print(f"Problem: {p.title} (ID: {p.id}, Slug: {p.slug})")
                print(f"  Function Name: '{p.function_name}'")
                print("-" * 20)

if __name__ == "__main__":
    check_function_names()
