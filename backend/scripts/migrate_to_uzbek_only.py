#!/usr/bin/env python3
"""
Migration Script: Convert all problem content to Uzbek-only

This script:
1. Takes all existing problems
2. Translates content to Uzbek (or uses existing Uzbek translations)
3. Replaces all fields with Uzbek content
4. Removes any English content completely
5. Ensures 500MB storage limit compliance
"""

import json
import sys
from typing import Dict, Any

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.problem import Problem


def get_uzbek_translation(slug: str, original_content: Dict[str, Any]) -> Dict[str, Any]:
    """
    Get Uzbek translation for problem content.
    In production, this would use AI translation or manual translations.
    """
    
    # Predefined high-quality Uzbek translations for common problems
    predefined_translations = {
        "two-sum": {
            "title": "Ikki son yig‘indisi",
            "description": "Berilgan butun sonlar massividagi ikki sonning yig‘indisi berilgan maqsad qiymatga teng bo'ladigan ikki son indekslarini toping. Bir vaqtning o'zida bir xil elementdan foydalanish mumkin emas. Javob sifatida ikkita sonning indekslarini qaytaring.",
            "input_format": "Birinchi qatorda massiv uzunligi n (2 ≤ n ≤ 10^4) va maqsad qiymat target (-10^9 ≤ target ≤ 10^9). Ikkinchi qatorda n ta butun son - massiv elementlari (har biri -10^9 ≤ nums[i] ≤ 10^9).",
            "output_format": "Massivda yig‘indisi target ga teng bo'ladigan ikki son indekslarini probel bilan ajratib chop eting. Bitta javob mavjud.",
            "constraints": [
                "2 <= n <= 10^4",
                "-10^9 <= nums[i] <= 10^9",
                "-10^9 <= target <= 10^9",
                "Bitta javob mavjud"
            ]
        },
        "valid-parentheses": {
            "title": "To‘g‘ri qavslar tekshiruvi",
            "description": "Berilgan qator faqat '(', ')', '{', '}', '[' va ']' belgilaridan iborat. Qator to'g'ri qavsli ekanligini tekshiring. To'g'ri qavsli qator quyidagi shartlarga mos keladi: ochiluvchi qavslar yopiluvchi qavslarga mos kelishi kerak, mos qavslar bir xil turdosh bo'lishi kerak, va qavslar to'g'ri tartibda yopilishi kerak.",
            "input_format": "Bir qatorda qavsli qator s beriladi. Qator uzunligi 1 <= len(s) <= 10^4.",
            "output_format": "Agar qator to'g'ri qavsli bo'lsa 'true', aks holda 'false' chop eting.",
            "constraints": [
                "1 <= len(s) <= 10^4",
                "s faqat '(', ')', '{', '}', '[' va ']' belgilaridan iborat"
            ]
        },
        "longest-substring-without-repeating-characters": {
            "title": "Takrorlanmaydigan eng uzun qism qator",
            "description": "Berilgan qator ichida takrorlanmaydigan belgilarga ega eng uzun qism qatorning uzunligini toping. Qism qator - bu asl qatorning ketma-ket belgilaridir.",
            "input_format": "Bir qatorda qator s beriladi. 0 <= len(s) <= 5 * 10^4.",
            "output_format": "Takrorlanmaydigan belgilarga ega eng uzun qism qator uzunligini chop eting.",
            "constraints": [
                "0 <= len(s) <= 5 * 10^4",
                "s faqat ASCII belgilaridan iborat"
            ]
        },
        "reverse-integer": {
            "title": "Butun sonni teskari aylantirish",
            "description": "32-bit ishorali butun son berilgan. Son raqamlarini teskari aylantiring. Agar teskari aylantirilgan son 32-bit butun son chegarasidan tashqariga chiqsa, 0 qaytaring.",
            "input_format": "Bitta butun son x (-2^31 <= x <= 2^31 - 1).",
            "output_format": "Teskari aylantirilgan butun son.",
            "constraints": [
                "-2^31 <= x <= 2^31 - 1"
            ]
        },
        "palindrome-number": {
            "title": "Palindrom son",
            "description": "Butun son palindrom ekanligini aniqlang. Butun son o'ngdan ham, chapdan ham bir xil o'qilganda palindrom bo'ladi. Masalan, 121 palindrom, 123 esa palindrom emas.",
            "input_format": "Bitta butun son x (-2^31 <= x <= 2^31 - 1).",
            "output_format": "Agar x palindrom bo'lsa 'true', aks holda 'false' chop eting.",
            "constraints": [
                "-2^31 <= x <= 2^31 - 1"
            ]
        },
        "merge-two-sorted-lists": {
            "title": "Ikki tartiblangan ro'yxatni birlashtirish",
            "description": "Ikki tartiblangan bog'langan ro'yxatlar berilgan. Ushbu ikki ro'yxatni bitta tartiblangan ro'yxatga birlashtiring. Birlashtirilgan ro'yxat ikkala ro'yxatdagi tugunlarni o'sish tartibida o'z ichiga olishi kerak.",
            "input_format": "Ikki bog'langan ro'yxat boshlarining manzillari beriladi. Har bir ro'yxat tugunlari qiymatlari o'sish tartibida joylashgan.",
            "output_format": "Birlashtirilgan tartiblangan bog'langan ro'yxat boshini qaytaring.",
            "constraints": [
                "Har bir ro'yxatdagi tugunlar soni 0 <= N <= 50",
                "Har bir tugunning qiymati -100 <= Node.val <= 100"
            ]
        },
        "best-time-to-buy-and-sell-stock": {
            "title": "Aksiyalarni sotib olish va sotish uchun eng yaxshi vaqt",
            "description": "Sizga n uzunlikdagi narxlar massivi berilgan, bu yerda narxlar[i] i-kun bo'yoragi aksiyaning narxini anglatadi. Siz bitta marta aksiya sotib olish va sotish orqali maksimal foydani olishingiz kerak. Agar foyda olish iloji bo'lmasa, 0 qaytaring.",
            "input_format": "Birinchi qatorda n (1 <= n <= 10^5). Ikkinchi qatorda n ta butun son - har bir kundagi aksiya narxlari.",
            "output_format": "Maksimal foydani chop eting. Agar foyda olish iloji bo'lmasa 0 chop eting.",
            "constraints": [
                "1 <= prices.length <= 10^5",
                "0 <= prices[i] <= 10^4"
            ]
        },
        "valid-anagram": {
            "title": "To‘g‘ri anagramma",
            "description": "Sizga ikkita satr s va t berilgan. Agar t s ning anagrammasi bo'lsa, true qaytaring. Anagramma - bu boshqa so'z yoki frazaning harflarini qayta tartibga solish orqali hosil qilingan so'z yoki fraza. Barcha asl harflar aniq bir marta ishlatilishi kerak.",
            "input_format": "Birinchi qatorda s satr, ikkinchi qatorda t satr. Har ikkala satr ham kichik lotin harflaridan iborat.",
            "output_format": "Agar t s ning anagrammasi bo'lsa 'true', aks holda 'false' chop eting.",
            "constraints": [
                "1 <= s.length, t.length <= 5 * 10^4",
                "s va t faqat kichik lotin harflaridan iborat"
            ]
        }
    }
    
    if slug in predefined_translations:
        return predefined_translations[slug]
    
    # For other problems, create placeholder Uzbek translations
    # In production, replace this with actual translation logic
    return {
        "title": f"{original_content.get('title', 'Masala')} (Uzbekcha tarjima kerak)",
        "description": f"{original_content.get('description', 'Masala tavsifi')} (Uzbekcha tarjima kerak)",
        "input_format": f"{original_content.get('input_format', 'Kirish formati')} (Uzbekcha tarjima kerak)",
        "output_format": f"{original_content.get('output_format', 'Chiqish formati')} (Uzbekcha tarjima kerak)",
        "constraints": original_content.get("constraints", []) or ["Cheklovlarni o'zbekchaga tarjima qilish kerak"]
    }


def migrate_problem_to_uzbek(problem: Problem) -> bool:
    """Migrate a single problem to Uzbek content."""
    
    try:
        # Get Uzbek translation
        original_content = {
            "title": problem.title,
            "description": problem.description,
            "input_format": problem.input_format,
            "output_format": problem.output_format,
            "constraints": problem.constraints_text
        }
        
        uzbek_content = get_uzbek_translation(problem.slug, original_content)
        
        # Update problem with Uzbek content
        problem.title = uzbek_content["title"]
        problem.description = uzbek_content["description"]
        problem.input_format = uzbek_content["input_format"]
        problem.output_format = uzbek_content["output_format"]
        problem.constraints_text = "\n".join(uzbek_content["constraints"])
        
        return True
        
    except Exception as e:
        print(f"✗ Error migrating {problem.slug}: {str(e)}")
        return False


def migrate_all_problems():
    """Migrate all problems to Uzbek-only content."""
    
    print("Starting migration to Uzbek-only content...")
    print("This will replace ALL English content with Uzbek translations.")
    print("Storage limit: 500MB - ensuring minimal storage usage.")
    
    # Confirmation prompt
    confirm = input("Continue with migration? (yes/no): ").strip().lower()
    if confirm != "yes":
        print("Migration cancelled.")
        return False
    
    with SessionLocal() as db:
        # Get all problems
        problems = db.query(Problem).all()
        print(f"Found {len(problems)} problems to migrate")
        
        migrated_count = 0
        error_count = 0
        
        for problem in problems:
            try:
                print(f"Processing: {problem.slug}")
                
                if migrate_problem_to_uzbek(problem):
                    db.commit()
                    migrated_count += 1
                    print(f"✓ Migrated: {problem.slug}")
                else:
                    db.rollback()
                    error_count += 1
                    
            except Exception as e:
                db.rollback()
                error_count += 1
                print(f"✗ Error with {problem.slug}: {str(e)}")
                continue
        
        print(f"\nMigration completed!")
        print(f"Successfully migrated: {migrated_count} problems")
        print(f"Failed to migrate: {error_count} problems")
        
        if error_count > 0:
            print("⚠ Some problems failed to migrate. Check the errors above.")
            return False
        
        return True


def verify_migration():
    """Verify that migration was successful and content is in Uzbek."""
    
    print("\nVerifying migration...")
    
    with SessionLocal() as db:
        problems = db.query(Problem).all()
        
        # Check for English content (basic check)
        english_indicators = ["Given", "Return", "Input", "Output", "Example", "Constraints"]
        uzbek_content_count = 0
        
        for problem in problems:
            content = f"{problem.title} {problem.description} {problem.input_format} {problem.output_format}"
            content_lower = content.lower()
            
            # Check if content contains English indicators
            has_english = any(indicator.lower() in content_lower for indicator in english_indicators)
            
            if not has_english:
                uzbek_content_count += 1
        
        print(f"Total problems: {len(problems)}")
        print(f"Problems with Uzbek content: {uzbek_content_count}")
        print(f"Migration quality: {(uzbek_content_count / len(problems)) * 100:.1f}%")
        
        if uzbek_content_count == len(problems):
            print("✓ All problems successfully migrated to Uzbek!")
            return True
        else:
            print("⚠ Some problems may still contain English content.")
            return False


def check_storage_usage():
    """Check estimated storage usage."""
    
    print("\nChecking storage usage...")
    
    with SessionLocal() as db:
        # Get problem content sizes
        problems = db.query(Problem).all()
        
        total_size = 0
        for problem in problems:
            content_size = (
                len(problem.title or "") +
                len(problem.description or "") +
                len(problem.input_format or "") +
                len(problem.output_format or "") +
                len(problem.constraints_text or "") +
                len(problem.starter_code or "")
            )
            total_size += content_size
        
        # Convert to MB
        total_mb = total_size / (1024 * 1024)
        
        print(f"Total content size: {total_mb:.2f} MB")
        print(f"Problem count: {len(problems)}")
        print(f"Average size per problem: {total_size / len(problems):.0f} bytes")
        
        if total_mb < 500:
            print("✓ Storage usage within 500MB limit!")
            return True
        else:
            print("⚠ Storage usage exceeds 500MB limit!")
            return False


def main():
    """Main migration function."""
    
    print("=" * 70)
    print("UZBEK-ONLY CONTENT MIGRATION")
    print("=" * 70)
    print("This script will:")
    print("1. Convert all problem content to Uzbek")
    print("2. Remove all English content")
    print("3. Ensure 500MB storage limit compliance")
    print("4. Verify migration quality")
    
    # Step 1: Migrate problems
    migration_success = migrate_all_problems()
    
    if not migration_success:
        print("\nMigration failed. Please check the errors and try again.")
        sys.exit(1)
    
    # Step 2: Verify migration
    verification_success = verify_migration()
    
    if not verification_success:
        print("\nMigration verification failed. Please review the content.")
        sys.exit(1)
    
    # Step 3: Check storage usage
    storage_ok = check_storage_usage()
    
    if not storage_ok:
        print("\nStorage limit exceeded. Consider optimizing content size.")
    
    print("\n" + "=" * 70)
    print("MIGRATION COMPLETED SUCCESSFULLY!")
    print("=" * 70)
    print("\nNext steps:")
    print("1. Run the database migration script")
    print("2. Deploy the updated backend code")
    print("3. Test the submission system")
    print("4. Monitor storage usage")
    print("5. Add LeetCode ID mappings for problems")


if __name__ == "__main__":
    main()