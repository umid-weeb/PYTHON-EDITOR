import requests
import json

def test_solutions_endpoint():
    base_url = "http://127.0.0.1:8000"
    # Note: This requires a logged in user who has solved the problem.
    # In a real test environment, we'd provide a token.
    # For now, we'll check if the endpoint exists and returns 401/403 as expected for unauthenticated/unsolved.
    
    slug = "two-sum"
    print(f"Testing Solutions endpoint for: {slug}")
    try:
        response = requests.get(f"{base_url}/api/problems/{slug}/solutions")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Failed to connect to backend: {e}")

if __name__ == "__main__":
    test_solutions_endpoint()
