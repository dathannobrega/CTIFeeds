"""Consulta de indicadores nos feeds publicados."""
from __future__ import annotations

import ipaddress
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlparse

from .feed_index import FeedIndex
from .validators import INDICATOR_TYPES, detect_indicator_type, normalise_indicator, refang

# (tipo, valor) -> data de inclusão na lista de exclusão, ou None se não estiver excluído.
ExclusionLookup = Callable[[str, str], Optional[str]]


def lookup_indicator(
    query: str,
    index: FeedIndex,
    excluded_at: ExclusionLookup,
    indicator_type: str | None = None,
) -> Dict[str, Any]:
    """Verifica se ``query`` está publicado, excluído ou relacionado a outro indicador listado."""
    value = refang(query)
    detected = indicator_type if indicator_type in INDICATOR_TYPES else detect_indicator_type(value)
    normalised = normalise_indicator(detected, value) if detected else None
    result: Dict[str, Any] = {
        "query": query,
        "type": detected,
        "value": normalised,
        "valid": normalised is not None,
        "listed": False,
        "excluded": False,
        "excluded_at": None,
        "related": [],
    }
    if normalised is None or detected is None:
        return result

    result["listed"] = index.contains(detected, normalised)
    excluded = excluded_at(detected, normalised)
    result["excluded"] = excluded is not None
    result["excluded_at"] = excluded
    result["related"] = _related(detected, normalised, index)
    return result


def _related(indicator_type: str, value: str, index: FeedIndex) -> List[Dict[str, str]]:
    related: List[Dict[str, str]] = []
    if indicator_type == "domain":
        related.extend(_parent_domains(value, index))
    elif indicator_type == "url":
        if value.endswith("/"):
            variant = value.rstrip("/")
        else:
            variant = f"{value}/"
        if variant != value and index.contains("url", variant):
            related.append({"type": "url", "value": variant, "relation": "url_variant"})
        host = (urlparse(value).hostname or "").lower()
        if host:
            if _is_ipv4(host):
                if index.contains("ipv4", host):
                    related.append({"type": "ipv4", "value": host, "relation": "url_host"})
            else:
                if index.contains("domain", host):
                    related.append({"type": "domain", "value": host, "relation": "url_host"})
                related.extend(_parent_domains(host, index))
    return related


def _parent_domains(domain: str, index: FeedIndex) -> List[Dict[str, str]]:
    """``a.b.evil.example`` também é suspeito se ``evil.example`` estiver listado."""
    labels = domain.rstrip(".").split(".")
    found = []
    for start in range(1, len(labels) - 1):
        parent = ".".join(labels[start:])
        if index.contains("domain", parent):
            found.append({"type": "domain", "value": parent, "relation": "parent_domain"})
    return found


def _is_ipv4(value: str) -> bool:
    try:
        return ipaddress.ip_address(value).version == 4
    except ValueError:
        return False
