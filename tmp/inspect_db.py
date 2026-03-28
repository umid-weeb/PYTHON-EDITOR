import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
load_dotenv("backend/.env")
engine = create_engine(os.getenv("DATABASE_URL"))
def inspect():
    with engine.connect() as conn:
        print("LATEST 20 SUBS:")
        q = "SELECT id, user_id, status, verdict, error_text FROM submissions ORDER BY id DESC LIMIT 20"
        for r in conn.execute(text(q)):
            print(f"ID: {r[0]} | U: {r[1]} | S: {r[2]} | V: {r[3]}")
            if r[4]: print(f"  E: {r[4][:200]}")
if __name__ == "__main__":
    inspect()
