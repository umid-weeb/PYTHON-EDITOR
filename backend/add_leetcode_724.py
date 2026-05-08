import os
import sys

# Add the backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from scripts.add_problem_with_translations import create_problem_with_translations

problem_data = {
    "id": "find-pivot-index",
    "slug": "find-pivot-index",
    "difficulty": "easy",
    "function_name": "pivotIndex",
    "tags": ["array", "prefix-sum"],
    "leetcode_id": 724
}

english_translation = {
    "title": "Find Pivot Index",
    "description": "Given an array of integers `nums`, calculate the pivot index of this array.\n\nThe pivot index is the index where the sum of all the numbers strictly to the left of the index is equal to the sum of all the numbers strictly to the index's right.\n\nIf the index is on the left edge of the array, then the left sum is 0 because there are no elements to the left. This also applies to the right edge of the array.\n\nReturn the leftmost pivot index. If no such index exists, return -1.",
    "input_format": "An array of integers `nums`.",
    "output_format": "An integer representing the leftmost pivot index, or -1 if none exists.",
    "constraints": "- 1 <= nums.length <= 10^4\n- -1000 <= nums[i] <= 1000",
    "starter_code": "class Solution:\n    def pivotIndex(self, nums: list[int]) -> int:\n        pass\n"
}

uzbek_translation = {
    "title": "Pivot indeksini topish",
    "description": "Butun sonlardan iborat `nums` massivi berilgan. Ushbu massivning pivot (markaziy) indeksini hisoblang.\n\nPivot indeksi shunday indekski, undan chap tomonda joylashgan barcha sonlar yig'indisi undan o'ng tomonda joylashgan barcha sonlar yig'indisiga teng bo'ladi.\n\nAgar indeks massivning eng chap chetida joylashgan bo'lsa, chap tomondagi yig'indi 0 ga teng deb hisoblanadi, chunki chap tomonda hech qanday element yo'q. Bu qoida massivning eng o'ng chetidagi indeks uchun ham o'rinlidir.\n\nEng chap tomondagi pivot indeksini qaytaring. Agar bunday indeks mavjud bo'lmasa, -1 qaytaring.",
    "input_format": "Butun sonlardan iborat `nums` massivi.",
    "output_format": "Eng chap tomondagi pivot indeksini ifodalovchi butun son, bunday indeks bo'lmasa -1 qaytaring.",
    "constraints": "- 1 <= nums.length <= 10^4\n- -1000 <= nums[i] <= 1000",
    "starter_code": "class Solution:\n    def pivotIndex(self, nums: list[int]) -> int:\n        # Sizning yechimingiz\n        pass\n"
}

success = create_problem_with_translations(problem_data, english_translation, uzbek_translation)
if success:
    print("Successfully added problem 724!")
else:
    print("Failed to add problem.")
