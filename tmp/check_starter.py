import os
import sys

# Add backend to sys.path
sys.path.append(os.path.abspath("backend"))

from app.database import SessionLocal
from app.models.problem import Problem

def check_starter_codes():
    with SessionLocal() as db:
        problems = db.query(Problem).all()
        for p in problems:
            # Look for clues in starter code
            if "solve(self)" in str(p.starter_code or ""):
                print(f"Problem: {p.title} (ID: {p.id}, Slug: {p.slug})")
                print(f"  Function Name: '{p.function_name}'")
                print(f"  Has 'solve(self)' in starter code")
                print("-" * 20)
            elif "(self)" in str(p.starter_code or "") and p.function_name and p.function_name not in p.starter_code:
                 print(f"Problem: {p.title} (ID: {p.id}, Slug: {p.slug})")
                 print(f"  Mismatch? Func: '{p.function_name}', Starter has (self)")
                 print("-" * 20)

if __name__ == "__main__":
    check_starter_codes()
