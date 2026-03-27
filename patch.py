import sys

path = r'd:\Projects\PYTHON-EDITOR\backend\app\services\problem_catalog.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

target = """        problem = Problem(
            id=problem_seed.id,
            title=problem_seed.title,
            slug=problem_seed.slug,
            difficulty=problem_seed.difficulty,
            description=problem_seed.description,
            input_format=problem_seed.input_format,
            output_format=problem_seed.output_format,
            constraints_text=problem_seed.constraints_text,
            starter_code=problem_seed.starter_code,
            function_name=problem_seed.function_name,
            tags_json=json.dumps(problem_seed.tags, ensure_ascii=False),
        )
        db.add(problem)
        db.flush()

        for test_case in problem_seed.test_cases:
            db.add(
                TestCase(
                    problem_id=problem.id,
                    input=test_case.input,
                    expected_output=test_case.expected_output,
                    is_hidden=test_case.is_hidden,
                    sort_order=test_case.sort_order,
                )
            )

        inserted_count += 1

    db.commit()"""

replacement = """        try:
            with db.begin_nested():
                problem = Problem(
                    id=problem_seed.id,
                    title=problem_seed.title,
                    slug=problem_seed.slug,
                    difficulty=problem_seed.difficulty,
                    description=problem_seed.description,
                    input_format=problem_seed.input_format,
                    output_format=problem_seed.output_format,
                    constraints_text=problem_seed.constraints_text,
                    starter_code=problem_seed.starter_code,
                    function_name=problem_seed.function_name,
                    tags_json=json.dumps(problem_seed.tags, ensure_ascii=False),
                )
                db.add(problem)
                db.flush()

                for test_case in problem_seed.test_cases:
                    db.add(
                        TestCase(
                            problem_id=problem.id,
                            input=test_case.input,
                            expected_output=test_case.expected_output,
                            is_hidden=test_case.is_hidden,
                            sort_order=test_case.sort_order,
                        )
                    )

            inserted_count += 1
        except Exception as e:
            from sqlalchemy.exc import IntegrityError
            if isinstance(e, IntegrityError):
                logger.info("Skipping duplicate problem %s: already exists", problem_seed.slug)
            else:
                logger.warning("Failed to insert problem %s: %s", problem_seed.slug, e)
            skipped_count += 1

    db.commit()"""

if target in content:
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content.replace(target, replacement))
    print('SUCCESS')
else:
    print('FAILED: target not found')
