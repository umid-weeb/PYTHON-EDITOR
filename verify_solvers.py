import asyncio
from app.services.problem_service import get_problem_service

async def test():
    service = get_problem_service()
    resp = await service.list_problem_page(page=1, per_page=10)
    for item in resp['items']:
        print(f"Problem: {item.title}, Solvers: {item.solvers_count}, Accept: {item.acceptance_rate}%")

if __name__ == "__main__":
    asyncio.run(test())
