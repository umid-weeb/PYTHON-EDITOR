#!/usr/bin/env python3
"""
Translation Loader Script: Add new problems with multilingual support

This script helps add new problems with both English and Uzbek translations.
It can be used by content managers to add new problems to the system.
"""

import json
import sys
from typing import Dict, List, Any

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.problem import Problem
from app.models.problem_translation import ProblemTranslation


def create_problem_with_translations(
    problem_data: Dict[str, Any],
    english_translation: Dict[str, Any],
    uzbek_translation: Dict[str, Any]
) -> bool:
    """
    Create a new problem with both English and Uzbek translations.
    
    Args:
        problem_data: Basic problem data (id, slug, difficulty, function_name, tags_json)
        english_translation: English content for the problem
        uzbek_translation: Uzbek content for the problem
    
    Returns:
        bool: True if successful, False otherwise
    """
    
    with SessionLocal() as db:
        try:
            # 1. Create the main problem record
            problem = Problem(
                id=problem_data["id"],
                slug=problem_data["slug"],
                title=english_translation["title"],  # Store English title as fallback
                difficulty=problem_data["difficulty"],
                description=english_translation["description"],  # Store English description as fallback
                input_format=english_translation["input_format"],
                output_format=english_translation["output_format"],
                constraints_text=english_translation["constraints"],
                starter_code=english_translation["starter_code"],
                function_name=problem_data.get("function_name", "solve"),
                tags_json=json.dumps(problem_data.get("tags", [])),
                leetcode_id=problem_data.get("leetcode_id")
            )
            db.add(problem)
            db.flush()  # Get the problem ID
            
            # 2. Create English translation
            english_trans = ProblemTranslation(
                problem_id=problem.id,
                language_code="en",
                title=english_translation["title"],
                description=english_translation["description"],
                input_format=english_translation["input_format"],
                output_format=english_translation["output_format"],
                constraints=english_translation["constraints"],
                starter_code=english_translation["starter_code"]
            )
            db.add(english_trans)
            
            # 3. Create Uzbek translation
            uzbek_trans = ProblemTranslation(
                problem_id=problem.id,
                language_code="uz",
                title=uzbek_translation["title"],
                description=uzbek_translation["description"],
                input_format=uzbek_translation["input_format"],
                output_format=uzbek_translation["output_format"],
                constraints=uzbek_translation["constraints"],
                starter_code=uzbek_translation["starter_code"]
            )
            db.add(uzbek_trans)
            
            db.commit()
            print(f"✓ Successfully created problem: {problem.slug}")
            return True
            
        except Exception as e:
            db.rollback()
            print(f"✗ Error creating problem: {str(e)}")
            return False


def load_problem_template() -> Dict[str, Any]:
    """Load a template for creating new problems."""
    return {
        "problem_data": {
            "id": "unique-problem-id",
            "slug": "problem-slug",
            "difficulty": "easy|medium|hard",
            "function_name": "solve",
            "tags": ["array", "hash-table"],
            "leetcode_id": 1  # Optional
        },
        "english_translation": {
            "title": "Problem Title in English",
            "description": "Detailed problem description in English...",
            "input_format": "Input format description...",
            "output_format": "Output format description...",
            "constraints": "Constraints description...",
            "starter_code": "def solve(input):\n    # Your solution here\n    pass"
        },
        "uzbek_translation": {
            "title": "Problem Title in Uzbek",
            "description": "Detailed problem description in Uzbek...",
            "input_format": "Input format description in Uzbek...",
            "output_format": "Output format description in Uzbek...",
            "constraints": "Constraints description in Uzbek...",
            "starter_code": "def solve(input):\n    # Sizning yechimingiz\n    pass"
        }
    }


def validate_problem_data(data: Dict[str, Any]) -> List[str]:
    """Validate problem data and return list of errors."""
    errors = []
    
    required_fields = ["id", "slug", "difficulty"]
    for field in required_fields:
        if field not in data["problem_data"]:
            errors.append(f"Missing required field: {field}")
    
    if data["problem_data"]["difficulty"] not in ["easy", "medium", "hard"]:
        errors.append("Difficulty must be one of: easy, medium, hard")
    
    required_translation_fields = ["title", "description", "starter_code"]
    for lang in ["english_translation", "uzbek_translation"]:
        for field in required_translation_fields:
            if field not in data[lang] or not data[lang][field]:
                errors.append(f"Missing required {lang} field: {field}")
    
    return errors


def add_sample_problems():
    """Add some sample problems with proper Uzbek translations."""
    
    sample_problems = [
        {
            "problem_data": {
                "id": "reverse-integer",
                "slug": "reverse-integer",
                "difficulty": "easy",
                "function_name": "reverse",
                "tags": ["math", "string"],
                "leetcode_id": 7
            },
            "english_translation": {
                "title": "Reverse Integer",
                "description": "Given a 32-bit signed integer, reverse digits of an integer.",
                "input_format": "Single integer x.",
                "output_format": "Reversed integer.",
                "constraints": "-2^31 <= x <= 2^31 - 1",
                "starter_code": "def reverse(x):\n    # Your solution here\n    pass"
            },
            "uzbek_translation": {
                "title": "Butun sonni teskari aylantirish",
                "description": "32-bit ishorali butun son berilgan. Son raqamlarini teskari aylantiring.",
                "input_format": "Bitta butun son x.",
                "output_format": "Teskari aylantirilgan butun son.",
                "constraints": "-2^31 <= x <= 2^31 - 1",
                "starter_code": "def reverse(x):\n    # Sizning yechimingiz\n    pass"
            }
        },
        {
            "problem_data": {
                "id": "palindrome-number",
                "slug": "palindrome-number",
                "difficulty": "easy",
                "function_name": "is_palindrome",
                "tags": ["math"],
                "leetcode_id": 9
            },
            "english_translation": {
                "title": "Palindrome Number",
                "description": "Determine whether an integer is a palindrome. An integer is a palindrome when it reads the same backward as forward.",
                "input_format": "Single integer x.",
                "output_format": "True if x is palindrome, False otherwise.",
                "constraints": "-2^31 <= x <= 2^31 - 1",
                "starter_code": "def is_palindrome(x):\n    # Your solution here\n    pass"
            },
            "uzbek_translation": {
                "title": "Palindrom son",
                "description": "Butun son palindrom ekanligini aniqlang. Butun son o'ngdan ham, chapdan ham bir xil o'qilganda palindrom bo'ladi.",
                "input_format": "Bitta butun son x.",
                "output_format": "Agar x palindrom bo'lsa True, aks holda False.",
                "constraints": "-2^31 <= x <= 2^31 - 1",
                "starter_code": "def is_palindrome(x):\n    # Sizning yechimingiz\n    pass"
            }
        }
    ]
    
    print("Adding sample problems...")
    
    success_count = 0
    for problem_data in sample_problems:
        errors = validate_problem_data(problem_data)
        if errors:
            print(f"✗ Validation errors for {problem_data['problem_data']['slug']}:")
            for error in errors:
                print(f"  - {error}")
            continue
        
        if create_problem_with_translations(
            problem_data["problem_data"],
            problem_data["english_translation"],
            problem_data["uzbek_translation"]
        ):
            success_count += 1
    
    print(f"\nAdded {success_count} sample problems successfully!")


def interactive_problem_creator():
    """Interactive mode for creating new problems."""
    
    print("\n" + "=" * 50)
    print("INTERACTIVE PROBLEM CREATOR")
    print("=" * 50)
    
    while True:
        print("\n1. Add new problem")
        print("2. Add sample problems")
        print("3. Exit")
        
        choice = input("\nEnter your choice (1-3): ").strip()
        
        if choice == "1":
            create_interactive_problem()
        elif choice == "2":
            add_sample_problems()
        elif choice == "3":
            print("Goodbye!")
            break
        else:
            print("Invalid choice. Please try again.")


def create_interactive_problem():
    """Create a new problem interactively."""
    
    print("\n" + "-" * 30)
    print("CREATE NEW PROBLEM")
    print("-" * 30)
    
    # Collect problem data
    problem_data = {}
    problem_data["id"] = input("Enter problem ID: ").strip()
    problem_data["slug"] = input("Enter problem slug: ").strip()
    problem_data["difficulty"] = input("Enter difficulty (easy/medium/hard): ").strip().lower()
    problem_data["function_name"] = input("Enter function name (default: solve): ").strip() or "solve"
    problem_data["tags"] = input("Enter tags (comma-separated): ").strip().split(",")
    leetcode_id = input("Enter LeetCode ID (optional): ").strip()
    if leetcode_id:
        problem_data["leetcode_id"] = int(leetcode_id)
    
    # Collect English translation
    print("\n--- ENGLISH TRANSLATION ---")
    english_trans = {}
    english_trans["title"] = input("Enter English title: ").strip()
    english_trans["description"] = input("Enter English description: ").strip()
    english_trans["input_format"] = input("Enter input format: ").strip()
    english_trans["output_format"] = input("Enter output format: ").strip()
    english_trans["constraints"] = input("Enter constraints: ").strip()
    english_trans["starter_code"] = input("Enter starter code: ").strip()
    
    # Collect Uzbek translation
    print("\n--- UZBEK TRANSLATION ---")
    uzbek_trans = {}
    uzbek_trans["title"] = input("Enter Uzbek title: ").strip()
    uzbek_trans["description"] = input("Enter Uzbek description: ").strip()
    uzbek_trans["input_format"] = input("Enter Uzbek input format: ").strip()
    uzbek_trans["output_format"] = input("Enter Uzbek output format: ").strip()
    uzbek_trans["constraints"] = input("Enter Uzbek constraints: ").strip()
    uzbek_trans["starter_code"] = input("Enter Uzbek starter code: ").strip()
    
    # Validate and create
    data = {
        "problem_data": problem_data,
        "english_translation": english_trans,
        "uzbek_translation": uzbek_trans
    }
    
    errors = validate_problem_data(data)
    if errors:
        print("\nValidation errors:")
        for error in errors:
            print(f"  - {error}")
        return
    
    if create_problem_with_translations(
        data["problem_data"],
        data["english_translation"],
        data["uzbek_translation"]
    ):
        print("\nProblem created successfully!")
    else:
        print("\nFailed to create problem.")


def main():
    """Main function."""
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "interactive":
            interactive_problem_creator()
        elif sys.argv[1] == "samples":
            add_sample_problems()
        else:
            print("Usage: python add_problem_with_translations.py [interactive|samples]")
    else:
        print("Usage: python add_problem_with_translations.py [interactive|samples]")


if __name__ == "__main__":
    main()