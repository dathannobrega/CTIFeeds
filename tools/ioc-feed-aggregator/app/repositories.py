"""Repository layer encapsulating database access."""
from __future__ import annotations

from typing import Iterable, Optional

from sqlalchemy import func, select
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
        if self.get(indicator_type, value) is not None:
            raise ValueError("Indicator already excluded")
        exclusion = Exclusion(indicator_type=indicator_type, value=value)
        self._session.add(exclusion)
        try:
            self._session.flush()
        except IntegrityError as error:
            # Corrida com outra requisição: desfaz a sessão para o commit seguinte não falhar.
            self._session.rollback()
            raise ValueError("Indicator already excluded") from error
        return exclusion

    def remove(self, indicator_type: str, value: str) -> Optional[Exclusion]:
        exclusion = self.get(indicator_type, value)
        if exclusion:
            self._session.delete(exclusion)
        return exclusion

    def list_values_by_type(self, indicator_type: str) -> set[str]:
        statement = select(Exclusion.value).where(Exclusion.indicator_type == indicator_type)
        return {row[0] for row in self._session.execute(statement)}

    def get(self, indicator_type: str, value: str) -> Optional[Exclusion]:
        statement = select(Exclusion).where(
            Exclusion.indicator_type == indicator_type,
            Exclusion.value == value,
        )
        return self._session.scalars(statement).first()

    def find_many(self, pairs: Iterable[tuple[str, str]]) -> dict[tuple[str, str], Exclusion]:
        """Busca várias exclusões de uma vez (consulta em lote)."""
        wanted = set(pairs)
        found: dict[tuple[str, str], Exclusion] = {}
        for indicator_type in {kind for kind, _ in wanted}:
            values = [value for kind, value in wanted if kind == indicator_type]
            for start in range(0, len(values), 500):
                statement = select(Exclusion).where(
                    Exclusion.indicator_type == indicator_type,
                    Exclusion.value.in_(values[start : start + 500]),
                )
                for exclusion in self._session.scalars(statement):
                    found[(exclusion.indicator_type, exclusion.value)] = exclusion
        return found

    def count_by_type(self) -> dict[str, int]:
        statement = select(Exclusion.indicator_type, func.count()).group_by(Exclusion.indicator_type)
        return {row[0]: row[1] for row in self._session.execute(statement)}
