import requests
import json

def test_ai_hint():
    base_url = "http://127.0.0.1:8000"
    payload = {
        "code": "print('hello')",
        "problem_slug": "two-sum",
        "language": "python"
    }
    
    print(f"Testing AI Hint for: {payload['problem_slug']}")
    try:
        response = requests.post(f"{base_url}/api/ai/hint", json=payload)
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            print(f"Hint: {response.json().get('hint')}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Failed to connect to backend: {e}")

if __name__ == "__main__":
    test_ai_hint()
