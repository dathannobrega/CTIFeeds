"""Exclusion list model."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Column, DateTime, Integer, String, UniqueConstraint

from . import Base


def _utc_now() -> datetime:
    """UTC sem fuso (a coluna é ``DateTime`` simples, como antes)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Exclusion(Base):
    """Model storing indicators excluded from published feeds."""

    __tablename__ = "exclusions"
    __table_args__ = (
        UniqueConstraint("indicator_type", "value", name="uq_indicator_value"),
    )

    id: Any = Column(Integer, primary_key=True)
    indicator_type: Any = Column(String(16), nullable=False)
    value: Any = Column(String(512), nullable=False)
    created_at: Any = Column(DateTime, nullable=False, default=_utc_now)

    def to_dict(self) -> dict[str, Any]:
        """Serialize the exclusion record."""
        return {
            "id": self.id,
            "indicator_type": self.indicator_type,
            "value": self.value,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
