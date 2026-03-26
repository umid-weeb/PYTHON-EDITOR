#!/usr/bin/env python3
"""
Deprecated compatibility wrapper.

Use migrate_problems_to_uzbek.py for the production-safe in-place migration.
This file is kept only so existing runbooks or shell history do not execute the
old placeholder migration logic by accident.
"""

from __future__ import annotations

import runpy
from pathlib import Path


if __name__ == "__main__":
    target = Path(__file__).with_name("migrate_problems_to_uzbek.py")
    runpy.run_path(str(target), run_name="__main__")
