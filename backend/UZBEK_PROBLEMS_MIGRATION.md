# Uzbek-only Problems Migration Runbook

This migration converts the live `problems` table to Uzbek-only content in place.
Frontend changes are not required because the UI already reads `problem.title` and `problem.description`.

## Files

- SQL prep: `backend/migrations/003_problems_uzbek_in_place.sql`
- Migration script: `backend/scripts/migrate_problems_to_uzbek.py`
- Compatibility wrapper: `backend/scripts/migrate_to_uzbek_only.py`

## What the migration guarantees

- Existing `problems.id` values stay unchanged
- Existing `problems.slug` values stay unchanged
- Data is updated with `UPDATE`, not `INSERT`
- Backup table is created before rewrite
- Commits happen in batches of 100 rows by default
- UI reflects Uzbek immediately because `title` and `description` are overwritten in place

## Translation source priority

The migration script resolves Uzbek content in this order:

1. `problem_translations.language_code = 'uz'`
2. `app.services.problem_catalog.build_problem_catalog()`
3. Curated manual fallback dictionary inside `migrate_problems_to_uzbek.py`

If a problem has no trustworthy Uzbek source, the script stops and prints the unresolved IDs/slugs.
It does not write placeholder text to production rows.

## Execution

1. Apply schema preparation SQL.

```sql
\i backend/migrations/003_problems_uzbek_in_place.sql
```

2. Run a dry-run first.

```powershell
python backend\scripts\migrate_problems_to_uzbek.py --dry-run
```

3. Run the real migration.

```powershell
python backend\scripts\migrate_problems_to_uzbek.py
```

4. If you need a non-default batch size:

```powershell
python backend\scripts\migrate_problems_to_uzbek.py --batch-size 100
```

5. If you need to recreate `problems_backup` from current live data before a rerun:

```powershell
python backend\scripts\migrate_problems_to_uzbek.py --recreate-backup --dry-run
```

## Rollback

Recommended rollback is in-place restore from the backup table:

```powershell
python backend\scripts\migrate_problems_to_uzbek.py --rollback
```

This is safer than `DROP TABLE problems; ALTER TABLE problems_backup RENAME TO problems;` because `CREATE TABLE ... AS SELECT ...` does not preserve the original indexes, foreign keys, defaults, or constraints.
Rollback requires an existing pre-migration `problems_backup` table and must not be combined with `--recreate-backup`.

## Validation SQL

Important: `title ~ '[A-Za-z]'` is not a safe validator for Uzbek Latin text because valid Uzbek titles also contain `A-Z` letters.
Use keyword-based validation instead.

Check that backup exists:

```sql
SELECT to_regclass('public.problems_backup') AS backup_table;
```

Check that record count matches backup:

```sql
SELECT
    (SELECT COUNT(*) FROM problems) AS live_count,
    (SELECT COUNT(*) FROM problems_backup) AS backup_count;
```

Check that slugs were not changed:

```sql
SELECT p.id, p.slug AS live_slug, b.slug AS backup_slug
FROM problems p
JOIN problems_backup b ON b.id = p.id
WHERE p.slug <> b.slug
LIMIT 10;
```

Check that `title_uz` and `description_uz` mirror the live Uzbek content:

```sql
SELECT id, slug
FROM problems
WHERE title IS DISTINCT FROM title_uz
   OR description IS DISTINCT FROM description_uz
LIMIT 10;
```

Check for suspicious English keywords in titles:

```sql
SELECT id, slug, title
FROM problems
WHERE title ~* '\m(two|sum|balanced|brackets|longest|substring|median|array|reverse|integer|roman|container|water|stock|anagram|merge|window|character)\M'
LIMIT 10;
```

Check for suspicious English keywords in descriptions:

```sql
SELECT id, slug
FROM problems
WHERE COALESCE(description, '') ~* '\m(given|return|input|output|example|constraints|array|string|integer|number|sum|search|substring|palindrome|parentheses|regex|roman|median|convert|reverse|sorted|list|match|container|water|stock|anagram|merge|window|character)\M'
LIMIT 10;
```

Check for empty or missing Uzbek content:

```sql
SELECT id, slug
FROM problems
WHERE NULLIF(BTRIM(title), '') IS NULL
   OR NULLIF(BTRIM(description), '') IS NULL
LIMIT 10;
```

## Uzbek translation examples

| LeetCode ID | Slug | English title | Uzbek title |
| --- | --- | --- | --- |
| 1 | `two-sum` | Two Sum | Ikki son yig'indisi |
| 2 | `add-two-numbers` | Add Two Numbers | Ikkita sonni qo'shish |
| 3 | `longest-substring-without-repeating-characters` | Longest Substring Without Repeating Characters | Takrorlanmaydigan eng uzun qism |
| 4 | `median-of-two-sorted-arrays` | Median of Two Sorted Arrays | Ikkita saralangan massiv medianasi |
| 5 | `longest-palindromic-substring` | Longest Palindromic Substring | Eng uzun palindrom qism |
| 6 | `zigzag-conversion` | Zigzag Conversion | Zigzag ko'rinishiga o'tkazish |
| 7 | `reverse-integer` | Reverse Integer | Butun sonni teskari aylantirish |
| 8 | `string-to-integer-atoi` | String to Integer (atoi) | Satrni butun songa aylantirish |
| 9 | `palindrome-number` | Palindrome Number | Palindrom son |
| 10 | `regular-expression-matching` | Regular Expression Matching | Muntazam ifodalarni moslashtirish |

## Operational notes

- Script rewrites only live problem content fields and `leetcode_id`
- Script clears local problem cache files after success
- Script attempts Redis cache invalidation when `REDIS_URL` is configured
- Script should be run with a valid `DATABASE_URL`
- If dry-run reports unresolved problems, add Uzbek source content first and rerun
