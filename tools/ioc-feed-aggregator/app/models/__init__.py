"""Database models package."""
from __future__ import annotations

from sqlalchemy.orm import declarative_base

Base = declarative_base()

from .exclusion import Exclusion  # noqa: E402  pylint: disable=wrong-import-position

__all__ = ["Base", "Exclusion"]
