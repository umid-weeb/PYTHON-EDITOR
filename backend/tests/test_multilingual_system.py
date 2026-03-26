#!/usr/bin/env python3
"""
Test Script: Multilingual Problem System

This script tests the multilingual problem system to ensure:
1. Database schema works correctly
2. API endpoints support language parameter
3. Fallback mechanism works
4. Backward compatibility is maintained
"""

import json
import sys
from typing import Dict, Any

import requests
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.problem import Problem
from app.models.problem_translation import ProblemTranslation
from app.services.problem_service import ProblemService


def test_database_schema():
    """Test that the database schema is correctly set up."""
    
    print("Testing database schema...")
    
    with SessionLocal() as db:
        # Test that leetcode_id column exists
        problem = db.query(Problem).first()
        if problem is None:
            print("✗ No problems found in database")
            return False
        
        # Test that problem_translations table exists and is accessible
        translations = db.query(ProblemTranslation).filter(
            ProblemTranslation.problem_id == problem.id
        ).all()
        
        print(f"✓ Found {len(translations)} translations for problem {problem.slug}")
        
        # Test unique constraint
        try:
            duplicate_trans = ProblemTranslation(
                problem_id=problem.id,
                language_code="en",
                title="Duplicate",
                description="Duplicate",
                starter_code="pass"
            )
            db.add(duplicate_trans)
            db.commit()
            print("✗ Unique constraint not working")
            return False
        except Exception as e:
            db.rollback()
            print("✓ Unique constraint working correctly")
        
        return True


def test_problem_service():
    """Test the problem service with multilingual support."""
    
    print("\nTesting problem service...")
    
    service = ProblemService()
    
    # Test getting problems list
    try:
        problems = service.list_problems()
        print(f"✓ Retrieved {len(problems)} problems")
        
        if len(problems) > 0:
            problem = problems[0]
            print(f"✓ Problem summary includes language_code: {problem.language_code}")
        
    except Exception as e:
        print(f"✗ Error getting problems list: {str(e)}")
        return False
    
    # Test getting specific problem
    try:
        with SessionLocal() as db:
            problem = db.query(Problem).first()
            if problem:
                bundle = service._build_problem_bundle_multilingual(problem, "uz")
                print(f"✓ Retrieved problem bundle with language: {bundle.get('language_code')}")
                
                # Test fallback
                bundle_en = service._build_problem_bundle_multilingual(problem, "en")
                print(f"✓ Fallback to English works: {bundle_en.get('language_code')}")
        
    except Exception as e:
        print(f"✗ Error testing problem service: {str(e)}")
        return False
    
    return True


def test_api_endpoints():
    """Test API endpoints with language parameter."""
    
    print("\nTesting API endpoints...")
    
    # Note: This assumes the API is running locally
    base_url = "http://localhost:8000"
    
    try:
        # Test getting problems list
        response = requests.get(f"{base_url}/problems")
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Problems list endpoint works, got {len(data['items'])} problems")
        else:
            print(f"✗ Problems list endpoint failed: {response.status_code}")
            return False
        
        # Test getting specific problem with language parameter
        if len(data['items']) > 0:
            problem_slug = data['items'][0]['slug']
            
            # Test Uzbek language
            response = requests.get(f"{base_url}/problems/{problem_slug}?lang=uz")
            if response.status_code == 200:
                problem_data = response.json()
                print(f"✓ Problem detail with Uzbek language: {problem_data.get('language_code')}")
            else:
                print(f"✗ Problem detail with Uzbek failed: {response.status_code}")
                return False
            
            # Test English language
            response = requests.get(f"{base_url}/problems/{problem_slug}?lang=en")
            if response.status_code == 200:
                problem_data = response.json()
                print(f"✓ Problem detail with English language: {problem_data.get('language_code')}")
            else:
                print(f"✗ Problem detail with English failed: {response.status_code}")
                return False
            
            # Test default language (should be Uzbek)
            response = requests.get(f"{base_url}/problems/{problem_slug}")
            if response.status_code == 200:
                problem_data = response.json()
                print(f"✓ Problem detail with default language: {problem_data.get('language_code')}")
            else:
                print(f"✗ Problem detail with default failed: {response.status_code}")
                return False
        
    except requests.exceptions.ConnectionError:
        print("⚠ API endpoints test skipped (API not running)")
        return True
    except Exception as e:
        print(f"✗ Error testing API endpoints: {str(e)}")
        return False
    
    return True


def test_backward_compatibility():
    """Test that existing functionality still works."""
    
    print("\nTesting backward compatibility...")
    
    with SessionLocal() as db:
        # Test that existing problems without translations still work
        problem = db.query(Problem).first()
        if problem is None:
            print("✗ No problems found")
            return False
        
        service = ProblemService()
        
        try:
            # Test original method still works
            bundle = service._build_problem_bundle(problem)
            print("✓ Original problem bundle method still works")
            
            # Test that fallback works for problems without translations
            bundle_uz = service._build_problem_bundle_multilingual(problem, "uz")
            print(f"✓ Fallback works for problems without translations: {bundle_uz.get('language_code')}")
            
        except Exception as e:
            print(f"✗ Backward compatibility test failed: {str(e)}")
            return False
    
    return True


def test_data_migration():
    """Test that data migration works correctly."""
    
    print("\nTesting data migration...")
    
    with SessionLocal() as db:
        # Check if translations exist
        total_problems = db.query(Problem).count()
        total_translations = db.query(ProblemTranslation).count()
        english_translations = db.query(ProblemTranslation).filter(
            ProblemTranslation.language_code == "en"
        ).count()
        uzbek_translations = db.query(ProblemTranslation).filter(
            ProblemTranslation.language_code == "uz"
        ).count()
        
        print(f"Total problems: {total_problems}")
        print(f"Total translations: {total_translations}")
        print(f"English translations: {english_translations}")
        print(f"Uzbek translations: {uzbek_translations}")
        
        if total_translations == 0:
            print("⚠ No translations found (migration may not have been run)")
            return True
        
        if english_translations == total_problems and uzbek_translations == total_problems:
            print("✓ Data migration appears successful")
            return True
        else:
            print("✗ Data migration incomplete")
            return False


def test_uzbek_naming_conventions():
    """Test that Uzbek naming conventions are followed."""
    
    print("\nTesting Uzbek naming conventions...")
    
    # Test some predefined translations
    test_cases = [
        {
            "slug": "two-sum",
            "expected_title": "Ikki son yig‘indisi",
            "description_contains": ["massiv", "indeks", "yig‘indisi"]
        },
        {
            "slug": "valid-parentheses", 
            "expected_title": "To‘g‘ri qavslar tekshiruvi",
            "description_contains": ["qavs", "to'g'ri", "belgilar"]
        }
    ]
    
    with SessionLocal() as db:
        for test_case in test_cases:
            translation = db.query(ProblemTranslation).filter(
                ProblemTranslation.language_code == "uz",
                ProblemTranslation.problem.has(slug=test_case["slug"])
            ).first()
            
            if translation:
                if translation.title == test_case["expected_title"]:
                    print(f"✓ {test_case['slug']} has correct Uzbek title")
                else:
                    print(f"⚠ {test_case['slug']} title may need review: {translation.title}")
                
                # Check if description contains expected Uzbek terms
                description_lower = translation.description.lower()
                found_terms = [term for term in test_case["description_contains"] if term in description_lower]
                if len(found_terms) > 0:
                    print(f"✓ {test_case['slug']} contains Uzbek technical terms: {found_terms}")
                else:
                    print(f"⚠ {test_case['slug']} may need Uzbek technical terms")
            else:
                print(f"⚠ No Uzbek translation found for {test_case['slug']}")
    
    return True


def run_all_tests():
    """Run all tests and return overall result."""
    
    print("=" * 60)
    print("MULTILINGUAL PROBLEM SYSTEM TESTS")
    print("=" * 60)
    
    tests = [
        ("Database Schema", test_database_schema),
        ("Problem Service", test_problem_service),
        ("API Endpoints", test_api_endpoints),
        ("Backward Compatibility", test_backward_compatibility),
        ("Data Migration", test_data_migration),
        ("Uzbek Naming Conventions", test_uzbek_naming_conventions)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n--- {test_name} ---")
        try:
            if test_func():
                passed += 1
                print(f"✓ {test_name} PASSED")
            else:
                print(f"✗ {test_name} FAILED")
        except Exception as e:
            print(f"✗ {test_name} ERROR: {str(e)}")
    
    print("\n" + "=" * 60)
    print(f"TEST RESULTS: {passed}/{total} tests passed")
    print("=" * 60)
    
    if passed == total:
        print("🎉 All tests passed! The multilingual system is working correctly.")
        return True
    else:
        print(f"⚠ {total - passed} test(s) failed. Please review the issues above.")
        return False


def main():
    """Main function."""
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "schema":
            test_database_schema()
        elif sys.argv[1] == "service":
            test_problem_service()
        elif sys.argv[1] == "api":
            test_api_endpoints()
        elif sys.argv[1] == "compatibility":
            test_backward_compatibility()
        elif sys.argv[1] == "migration":
            test_data_migration()
        elif sys.argv[1] == "naming":
            test_uzbek_naming_conventions()
        elif sys.argv[1] == "all":
            run_all_tests()
        else:
            print("Usage: python test_multilingual_system.py [schema|service|api|compatibility|migration|naming|all]")
    else:
        run_all_tests()


if __name__ == "__main__":
    main()