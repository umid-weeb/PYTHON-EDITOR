import traceback, sys, os
sys.path.append(os.path.abspath('backend'))

from app.database import SessionLocal
from app.services.problem_service import get_problem_service
from app.api.routes.problems import ProblemNotFoundError

db = SessionLocal()
service = get_problem_service()

try:
    with SessionLocal() as session:
        from app.models.problem import Problem
        problem_slug = "balanced-brackets-lite-02"
        problem_obj = session.query(Problem).filter(Problem.slug == problem_slug).first()
        bundle = service._build_problem_bundle_multilingual(problem_obj, "uz")
        print("Success!", bundle["title"])
except Exception as e:
    with open('err3.txt', 'w', encoding='utf-8') as f:
        f.write(traceback.format_exc())
