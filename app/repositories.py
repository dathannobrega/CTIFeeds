"""Repository layer encapsulating database access."""
from __future__ import annotations

from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import Exclusion


class ExclusionRepository:
    """Repository responsible for CRUD operations on exclusions."""

    def __init__(self, session: Session):
        self._session = session

    def list_all(self) -> Iterable[Exclusion]:
        statement = select(Exclusion).order_by(Exclusion.created_at.desc())
        return self._session.scalars(statement).all()

    def add(self, indicator_type: str, value: str) -> Exclusion:
        exclusion = Exclusion(indicator_type=indicator_type, value=value)
        self._session.add(exclusion)
        try:
            self._session.flush()
        except IntegrityError as error:
            raise ValueError("Indicator already excluded") from error
        return exclusion

    def remove(self, indicator_type: str, value: str) -> Optional[Exclusion]:
        statement = select(Exclusion).where(
            Exclusion.indicator_type == indicator_type,
            Exclusion.value == value,
        )
        exclusion = self._session.scalars(statement).first()
        if exclusion:
            self._session.delete(exclusion)
        return exclusion

    def list_values_by_type(self, indicator_type: str) -> set[str]:
        statement = select(Exclusion.value).where(Exclusion.indicator_type == indicator_type)
        return {row[0] for row in self._session.execute(statement)}
