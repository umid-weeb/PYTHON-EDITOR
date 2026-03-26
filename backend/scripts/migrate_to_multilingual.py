#!/usr/bin/env python3
"""
Data Migration Script: Migrate existing problems to multilingual system

This script:
1. Copies existing English content to problem_translations table
2. Generates Uzbek translations (placeholder - can be replaced with AI translation)
3. Updates existing problems to maintain backward compatibility
"""

import json
import sys
from typing import Dict, List, Any

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.problem import Problem
from app.models.problem_translation import ProblemTranslation


def load_uzbek_translations() -> Dict[str, Dict[str, str]]:
    """
    Load predefined Uzbek translations for common problem names.
    In production, this could be replaced with AI translation or manual translations.
    """
    return {
        "two-sum": {
            "title": "Ikki son yig‘indisi",
            "description": "Berilgan butun sonlar massividagi ikki sonning yig‘indisi berilgan maqsad qiymatga teng bo'ladigan ikki son indekslarini toping.",
            "input_format": "Birinchi qatorda massiv uzunligi n va maqsad qiymat target. Ikkinchi qatorda n ta butun son - massiv elementlari.",
            "output_format": "Massivda yig‘indisi target ga teng bo'ladigan ikki son indekslarini chop eting.",
            "constraints": [
                "2 <= n <= 10^4",
                "-10^9 <= nums[i] <= 10^9",
                "-10^9 <= target <= 10^9",
                "Bitta javob mavjud"
            ],
            "starter_code": "def two_sum(nums, target):\n    # Sizning yechimingiz\n    pass"
        },
        "valid-parentheses": {
            "title": "To‘g‘ri qavslar tekshiruvi",
            "description": "Berilgan qator faqat '(', ')', '{', '}', '[' va ']' belgilaridan iborat. Qator to'g'ri qavsli ekanligini tekshiring.",
            "input_format": "Bir qatorda qavsli qator s beriladi.",
            "output_format": "Agar qator to'g'ri qavsli bo'lsa 'true', aks holda 'false' chop eting.",
            "constraints": [
                "1 <= len(s) <= 10^4",
                "s faqat '(', ')', '{', '}', '[' va ']' belgilaridan iborat"
            ],
            "starter_code": "def is_valid(s):\n    # Sizning yechimingiz\n    pass"
        },
        "longest-substring-without-repeating-characters": {
            "title": "Takrorlanmaydigan eng uzun qator",
            "description": "Berilgan qator ichida takrorlanmaydigan belgilarga ega eng uzun qism qatorning uzunligini toping.",
            "input_format": "Bir qatorda qator s beriladi.",
            "output_format": "Takrorlanmaydigan belgilarga ega eng uzun qism qator uzunligini chop eting.",
            "constraints": [
                "0 <= len(s) <= 5 * 10^4",
                "s faqat ASCII belgilaridan iborat"
            ],
            "starter_code": "def length_of_longest_substring(s):\n    # Sizning yechimingiz\n    pass"
        }
    }


def get_uzbek_translation(slug: str, original_content: Dict[str, Any]) -> Dict[str, Any]:
    """
    Get Uzbek translation for a problem.
    In production, this could use AI translation services.
    """
    predefined_translations = load_uzbek_translations()
    
    if slug in predefined_translations:
        return predefined_translations[slug]
    
    # For other problems, create placeholder translations
    # In production, replace this with actual translation logic
    return {
        "title": f"{original_content['title']} (Uzbek translation needed)",
        "description": f"{original_content['description']} (Uzbek translation needed)",
        "input_format": original_content.get("input_format", "") or "Kirish formati (tarjima kerak)",
        "output_format": original_content.get("output_format", "") or "Chiqish formati (tarjima kerak)",
        "constraints": original_content.get("constraints", []) or ["Cheklovlarni tarjima qilish kerak"],
        "starter_code": original_content.get("starter_code", "") or "# Uzbekcha kod (tarjima kerak)"
    }


def migrate_existing_problems():
    """Migrate all existing problems to the new multilingual system."""
    
    print("Starting migration to multilingual system...")
    
    with SessionLocal() as db:
        # Get all existing problems
        problems = db.query(Problem).all()
        print(f"Found {len(problems)} existing problems to migrate")
        
        migrated_count = 0
        error_count = 0
        
        for problem in problems:
            try:
                print(f"Processing problem: {problem.slug}")
                
                # 1. Create English translation entry
                english_translation = ProblemTranslation(
                    problem_id=problem.id,
                    language_code="en",
                    title=problem.title,
                    description=problem.description,
                    input_format=problem.input_format,
                    output_format=problem.output_format,
                    constraints=problem.constraints_text,
                    starter_code=problem.starter_code
                )
                db.add(english_translation)
                
                # 2. Create Uzbek translation entry
                original_content = {
                    "title": problem.title,
                    "description": problem.description,
                    "input_format": problem.input_format,
                    "output_format": problem.output_format,
                    "constraints": problem.constraints_text,
                    "starter_code": problem.starter_code
                }
                
                uzbek_content = get_uzbek_translation(problem.slug, original_content)
                
                uzbek_translation = ProblemTranslation(
                    problem_id=problem.id,
                    language_code="uz",
                    title=uzbek_content["title"],
                    description=uzbek_content["description"],
                    input_format=uzbek_content["input_format"],
                    output_format=uzbek_content["output_format"],
                    constraints=uzbek_content["constraints"],
                    starter_code=uzbek_content["starter_code"]
                )
                db.add(uzbek_translation)
                
                db.commit()
                migrated_count += 1
                print(f"✓ Successfully migrated: {problem.slug}")
                
            except Exception as e:
                db.rollback()
                error_count += 1
                print(f"✗ Error migrating {problem.slug}: {str(e)}")
                continue
        
        print(f"\nMigration completed!")
        print(f"Successfully migrated: {migrated_count} problems")
        print(f"Failed to migrate: {error_count} problems")
        
        if error_count > 0:
            print("\nNote: Some problems failed to migrate. Check the errors above.")
            return False
        
        return True


def verify_migration():
    """Verify that the migration was successful."""
    
    print("\nVerifying migration...")
    
    with SessionLocal() as db:
        # Check if translations were created
        total_problems = db.query(Problem).count()
        total_translations = db.query(ProblemTranslation).count()
        english_translations = db.query(ProblemTranslation).filter(ProblemTranslation.language_code == "en").count()
        uzbek_translations = db.query(ProblemTranslation).filter(ProblemTranslation.language_code == "uz").count()
        
        print(f"Total problems: {total_problems}")
        print(f"Total translations: {total_translations}")
        print(f"English translations: {english_translations}")
        print(f"Uzbek translations: {uzbek_translations}")
        
        # Verify each problem has both translations
        problems_with_translations = db.query(ProblemTranslation.problem_id).distinct().count()
        
        if problems_with_translations == total_problems and english_translations == total_problems and uzbek_translations == total_problems:
            print("✓ Migration verification successful!")
            return True
        else:
            print("✗ Migration verification failed!")
            return False


def main():
    """Main migration function."""
    
    print("=" * 60)
    print("MULTILINGUAL PROBLEM SYSTEM MIGRATION")
    print("=" * 60)
    
    # Step 1: Migrate existing problems
    migration_success = migrate_existing_problems()
    
    if not migration_success:
        print("\nMigration failed. Please check the errors and try again.")
        sys.exit(1)
    
    # Step 2: Verify migration
    verification_success = verify_migration()
    
    if not verification_success:
        print("\nMigration verification failed. Please check the data.")
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("MIGRATION COMPLETED SUCCESSFULLY!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Run the SQL migration script to create the database schema")
    print("2. Update the application code to use the new multilingual system")
    print("3. Replace placeholder Uzbek translations with actual translations")
    print("4. Test the system thoroughly")


if __name__ == "__main__":
    main()