import os
import sys

sys.path.append(os.path.abspath('backend'))

from sqlalchemy import create_engine, MetaData, Table
from dotenv import load_dotenv

load_dotenv('backend/.env')

from app.database import _sanitize_db_url
url = _sanitize_db_url(os.getenv('DATABASE_URL'))
engine = create_engine(url)
metadata = MetaData()

with open('schema_solved.txt', 'w') as f:
    for table_name in ['solved_problems', 'submissions', 'user_stats']:
        try:
            table = Table(table_name, metadata, autoload_with=engine)
            f.write(f"\nTABLE: {table_name}\n")
            for c in table.c:
                f.write(f"{c.name} {c.type} Nullable: {c.nullable} Default: {c.server_default}\n")
        except Exception as e:
            f.write(f"Error loading {table_name}: {e}\n")
