import os
import sys
import json
from sqlalchemy import select

# Add backend to sys.path
backend_path = os.path.abspath('backend')
sys.path.append(backend_path)

from app.database import SessionLocal
from app.models.problem import Problem, TestCase

def get_problem_details(slug):
    with SessionLocal() as session:
        stmt = select(Problem).where(Problem.slug == slug)
        problem = session.execute(stmt).scalar_one_or_none()
        
        if not problem:
            print(f"Problem {slug} not found")
            return
            
        print(f"Title: {problem.title}")
        print(f"Slug: {problem.slug}")
        print(f"Function Name: {problem.function_name}")
        
        print("\nTest Cases:")
        for tc in problem.test_cases:
            print(f"ID: {tc.id}, Input: {repr(tc.input)}, Expected: {repr(tc.expected_output)}, Hidden: {tc.is_hidden}")

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv('backend/.env')
    get_problem_details('pattern-char-count-02')
