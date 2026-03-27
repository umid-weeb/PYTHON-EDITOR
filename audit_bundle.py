import sys
import os
import asyncio
import json
from datetime import datetime

sys.path.append(os.path.abspath('backend'))

from app.services.problem_service import get_problem_service

async def test():
    service = get_problem_service()
    try:
        # Using a valid problem slug from previous trace
        bundle = await service.get_problem_bundle("balanced-brackets-lite-02", force_refresh=True)
        print("Bundle keys:", bundle.keys())
        
        # Check for any datetimes in values
        for k, v in bundle.items():
            if isinstance(v, datetime):
                print(f"FOUND DATETIME in key: {k}")
            if isinstance(v, list):
                for item in v:
                    if isinstance(item, dict):
                        for subk, subv in item.items():
                            if isinstance(subv, datetime):
                                print(f"FOUND DATETIME in list-dict key: {k}.{subk}")
        
        print("Attempting manual json.dumps(bundle)...")
        json.dumps(bundle)
        print("Success!")
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(test())
