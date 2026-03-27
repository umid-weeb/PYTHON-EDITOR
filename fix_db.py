import os
import sys

sys.path.append(os.path.abspath('backend'))

from sqlalchemy import create_engine, MetaData, Table, text
from dotenv import load_dotenv

load_dotenv('backend/.env')

from app.database import _sanitize_db_url
url = _sanitize_db_url(os.getenv('DATABASE_URL'))
engine = create_engine(url)

with engine.connect() as conn:
    print("Executing ALTER TABLE to drop NOT NULL constraint on external_submission_id...")
    conn.execute(text("ALTER TABLE submissions ALTER COLUMN external_submission_id DROP NOT NULL;"))
    conn.commit()
    print("Success: dropped NOT NULL constraint!")
