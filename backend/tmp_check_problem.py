from app.database import SessionLocal
from app.models.problem import Problem, TestCase
db = SessionLocal()
ps = db.query(Problem).filter(Problem.slug.ilike("%divisible%")).all()
for p in ps:
    print(f"ID: {p.id} | Slug: {p.slug} | Function: {p.function_name}")
    cases = db.query(TestCase).filter(TestCase.problem_id == p.id).all()
    print(f"  Test Cases: {len(cases)}")
    for c in cases[:1]:
        print(f"    Sample Input: {repr(c.input)}")
        print(f"    Sample Output: {repr(c.expected_output)}")
