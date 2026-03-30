import os
import sys
import json
from sqlalchemy import create_engine, MetaData, Table, select
from datetime import datetime

sys.path.append(os.path.abspath('backend'))
from app.database import _sanitize_db_url

def dump_problem(slug):
    url = _sanitize_db_url(os.environ.get('DATABASE_URL'))
    engine = create_engine(url)
    metadata = MetaData()
    problems = Table('problems', metadata, autoload_with=engine)
    
    with engine.connect() as conn:
        result = conn.execute(select(problems).where(problems.c.slug == slug))
        row = result.first()
        if not row:
            print(f"Problem {slug} not found")
            return
        
        # Convert row to dict for easier inspection
        p_dict = dict(row._asdict())
        
        # Parse JSON fields if they are strings
        for field in ['visible_testcases', 'hidden_testcases', 'starter_code']:
            if isinstance(p_dict.get(field), str):
                try:
                    p_dict[field] = json.loads(p_dict[field])
                except:
                    pass
        
        # Only keep interesting parts
        output = {
            "title": p_dict.get("title"),
            "slug": p_dict.get("slug"),
            "function_name": p_dict.get("function_name"),
            "visible_testcases": p_dict.get("visible_testcases"),
            "hidden_testcases": p_dict.get("hidden_testcases")
        }
        
        with open('problem_details.json', 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print("Problem details saved to problem_details.json")

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv('backend/.env')
    dump_problem('pattern-char-count-02')
