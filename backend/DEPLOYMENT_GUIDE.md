# Deployment Guide: Multilingual Problem System

## Quick Start

### 1. Database Migration

Run the SQL migration script to create the new database schema:

```bash
# Connect to your PostgreSQL database and run:
psql -d your_database_name -f migrations/001_multilingual_problems.sql
```

### 2. Data Migration

Migrate existing problems to the new multilingual system:

```bash
python scripts/migrate_to_multilingual.py
```

### 3. Deploy Backend Code

Deploy the updated backend code with the new models and services.

### 4. Test the System

Run comprehensive tests to verify everything works:

```bash
python tests/test_multilingual_system.py all
```

## Detailed Deployment Steps

### Step 1: Database Setup

1. **Backup your database** before running migrations
2. **Run the migration script**:
   ```sql
   -- This creates the problem_translations table and adds leetcode_id to problems
   \i migrations/001_multilingual_problems.sql
   ```
3. **Verify the schema**:
   ```sql
   -- Check if tables were created
   \dt problem_translations
   \d problems
   ```

### Step 2: Application Code Deployment

1. **Update your Python dependencies** if needed
2. **Deploy the updated code**:
   - New models: `problem_translation.py`
   - Updated services: `problem_service.py`
   - Updated API routes: `problems.py`
   - Updated schemas: `schemas.py`
3. **Restart your application servers**

### Step 3: Data Migration

1. **Run the migration script**:
   ```bash
   python scripts/migrate_to_multilingual.py
   ```
2. **Verify migration**:
   ```bash
   # Check if translations were created
   python tests/test_multilingual_system.py migration
   ```

### Step 4: Testing

1. **Run all tests**:
   ```bash
   python tests/test_multilingual_system.py all
   ```
2. **Manual API testing**:
   ```bash
   # Test Uzbek (default)
   curl "http://localhost:8000/problems/two-sum"
   
   # Test English
   curl "http://localhost:8000/problems/two-sum?lang=en"
   
   # Test fallback
   curl "http://localhost:8000/problems/nonexistent?lang=uz"
   ```

### Step 5: Content Population

1. **Add sample problems**:
   ```bash
   python scripts/add_problem_with_translations.py samples
   ```
2. **Add new problems interactively**:
   ```bash
   python scripts/add_problem_with_translations.py interactive
   ```

## API Usage Examples

### Getting Problem List

```bash
# Get all problems (language_code included in response)
curl "http://localhost:8000/problems"

# Search problems
curl "http://localhost:8000/search?q=array"
```

### Getting Specific Problem

```bash
# Get problem in Uzbek (default)
curl "http://localhost:8000/problems/two-sum"

# Get problem in English
curl "http://localhost:8000/problems/two-sum?lang=en"

# Get problem with refresh (bypass cache)
curl "http://localhost:8000/problems/two-sum?refresh=true"
```

### Example Response (Uzbek)

```json
{
  "id": "two-sum",
  "slug": "two-sum", 
  "title": "Ikki son yig‘indisi",
  "order_index": 1,
  "difficulty": "easy",
  "description": "Berilgan butun sonlar massividagi ikki sonning yig‘indisi berilgan maqsad qiymatga teng bo'ladigan ikki son indekslarini toping.",
  "starter_code": "def two_sum(nums, target):\n    # Sizning yechimingiz\n    pass",
  "function_name": "two_sum",
  "input_format": "Birinchi qatorda massiv uzunligi n va maqsad qiymat target...",
  "output_format": "Massivda yig‘indisi target ga teng bo'ladigan ikki son indekslarini chop eting.",
  "constraints": [
    "2 <= n <= 10^4",
    "-10^9 <= nums[i] <= 10^9", 
    "-10^9 <= target <= 10^9",
    "Bitta javob mavjud"
  ],
  "tags": ["array", "hash-table"],
  "time_limit_seconds": 2.0,
  "memory_limit_mb": 256,
  "visible_testcases": [...],
  "hidden_testcase_count": 30,
  "language_code": "uz"
}
```

### Example Response (English)

```json
{
  "id": "two-sum",
  "slug": "two-sum",
  "title": "Two Sum",
  "order_index": 1,
  "difficulty": "easy",
  "description": "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.",
  "starter_code": "def two_sum(nums, target):\n    # Your solution here\n    pass",
  "function_name": "two_sum",
  "input_format": "First line contains n and target. Second line contains n integers...",
  "output_format": "Return indices of the two numbers that add up to target.",
  "constraints": [
    "2 <= n <= 10^4",
    "-10^9 <= nums[i] <= 10^9",
    "-10^9 <= target <= 10^9", 
    "Exactly one solution exists"
  ],
  "tags": ["array", "hash-table"],
  "time_limit_seconds": 2.0,
  "memory_limit_mb": 256,
  "visible_testcases": [...],
  "hidden_testcase_count": 30,
  "language_code": "en"
}
```

## Monitoring and Maintenance

### Database Monitoring

```sql
-- Monitor translation coverage
SELECT 
    COUNT(DISTINCT p.id) as total_problems,
    COUNT(DISTINCT CASE WHEN pt.language_code = 'uz' THEN pt.problem_id END) as uz_translations,
    COUNT(DISTINCT CASE WHEN pt.language_code = 'en' THEN pt.problem_id END) as en_translations,
    ROUND(
        COUNT(DISTINCT CASE WHEN pt.language_code = 'uz' THEN pt.problem_id END) * 100.0 / COUNT(DISTINCT p.id), 
        2
    ) as uz_coverage_percent
FROM problems p
LEFT JOIN problem_translations pt ON p.id = pt.problem_id;

-- Check for problems without translations
SELECT p.slug, p.title 
FROM problems p
LEFT JOIN problem_translations pt ON p.id = pt.problem_id
WHERE pt.id IS NULL;
```

### Performance Monitoring

```sql
-- Monitor query performance
EXPLAIN ANALYZE 
SELECT * FROM problem_translations 
WHERE problem_id = 'two-sum' AND language_code = 'uz';

-- Check index usage
SELECT 
    schemaname,
    tablename, 
    indexname,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE tablename IN ('problem_translations', 'problems');
```

### Application Monitoring

Monitor these key metrics:

1. **API Response Time**: Should be < 200ms for cached requests
2. **Translation Coverage**: Aim for 100% coverage
3. **Cache Hit Rate**: Should be > 90% for good performance
4. **Error Rate**: Should be < 1%

## Troubleshooting

### Common Issues

#### 1. Database Migration Errors

**Problem**: Migration script fails
**Solution**: 
- Check PostgreSQL version compatibility
- Verify user permissions
- Check for existing constraints

#### 2. Missing Translations

**Problem**: API returns English when Uzbek requested
**Solution**:
- Check if translation exists in database
- Verify language_code format ('uz' not 'uzb')
- Check fallback mechanism

#### 3. Performance Issues

**Problem**: Slow API responses
**Solution**:
- Verify database indexes are created
- Check cache configuration
- Monitor database connection pool

#### 4. Backward Compatibility Issues

**Problem**: Existing code breaks
**Solution**:
- Verify all existing endpoints still work
- Check that original problem content is preserved
- Test cache compatibility

### Debug Commands

```bash
# Check database schema
python -c "from app.database import SessionLocal; from app.models.problem_translation import ProblemTranslation; print('Table exists:', ProblemTranslation.__table__.exists())"

# Test API locally
curl "http://localhost:8000/problems/two-sum?lang=uz" | jq '.language_code'

# Check translation count
python -c "from app.database import SessionLocal; from app.models.problem_translation import ProblemTranslation; print('Translations:', SessionLocal().query(ProblemTranslation).count())"
```

## Rollback Plan

If issues occur, you can rollback in these steps:

### 1. Database Rollback

```sql
-- Remove new columns and tables (if needed)
ALTER TABLE problems DROP COLUMN IF EXISTS leetcode_id;
DROP TABLE IF EXISTS problem_translations;
```

### 2. Code Rollback

- Revert to previous version of backend code
- Restart application servers
- Verify existing functionality works

### 3. Data Rollback

- Original problem content is preserved
- No data loss in rollback
- Translations can be recreated later

## Production Deployment Checklist

- [ ] Database migration completed successfully
- [ ] Data migration verified
- [ ] All tests pass
- [ ] API endpoints tested manually
- [ ] Performance benchmarks met
- [ ] Monitoring dashboards updated
- [ ] Documentation updated
- [ ] Team trained on new features
- [ ] Rollback plan tested
- [ ] Production deployment scheduled

## Support and Maintenance

### Regular Tasks

1. **Weekly**: Monitor translation coverage and quality
2. **Monthly**: Review performance metrics and optimize
3. **Quarterly**: Add new problems and translations
4. **As needed**: Fix translation issues and improve quality

### Team Responsibilities

- **Backend Team**: Maintain API and database performance
- **Content Team**: Manage translations and add new problems
- **DevOps Team**: Monitor infrastructure and deployment
- **QA Team**: Test new features and regression testing

This multilingual system is designed to be robust, scalable, and maintainable for production use with millions of users.