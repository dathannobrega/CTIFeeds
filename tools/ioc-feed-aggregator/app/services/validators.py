"""Validation utilities for indicator values."""
from __future__ import annotations

import ipaddress
import re
from urllib.parse import urlparse

INDICATOR_TYPES = ("url", "domain", "ipv4")

# Formas comuns de "defang" usadas em relatórios de CTI: evil[.]com, hxxp://, 1.2.3[.]4.
_REFANG_RULES = (
    (re.compile(r"\[\s*\.\s*\]|\(\s*\.\s*\)|\{\s*\.\s*\}|\[dot\]|\(dot\)", re.IGNORECASE), "."),
    (re.compile(r"\[\s*:\s*\]"), ":"),
    (re.compile(r"\[\s*/\s*\]"), "/"),
    (re.compile(r"^hxxp", re.IGNORECASE), "http"),
    (re.compile(r"^fxp", re.IGNORECASE), "ftp"),
)


def normalise_indicator(indicator_type: str, value: str) -> str | None:
    """Normalise and validate indicator value according to its type."""
    cleaned = value.strip()
    if not cleaned:
        return None
    if indicator_type == "ipv4":
        try:
            ip = ipaddress.ip_address(cleaned)
        except ValueError:
            return None
        if ip.version == 4:
            return str(ip)
        return None
    if indicator_type == "domain":
        if " " in cleaned or "/" in cleaned:
            return None
        return cleaned.lower()
    if indicator_type == "url":
        parsed = urlparse(cleaned)
        if not parsed.scheme or not parsed.netloc:
            return None
        return cleaned
    return None


def refang(value: str) -> str:
    """Desfaz o defang de um indicador colado de um relatório."""
    cleaned = value.strip()
    for pattern, replacement in _REFANG_RULES:
        cleaned = pattern.sub(replacement, cleaned)
    return cleaned


def detect_indicator_type(value: str) -> str | None:
    """Detecta o tipo provável de um indicador (``url``, ``domain`` ou ``ipv4``)."""
    cleaned = value.strip()
    if not cleaned or any(char.isspace() for char in cleaned):
        return None
    try:
        ip = ipaddress.ip_address(cleaned)
    except ValueError:
        pass
    else:
        return "ipv4" if ip.version == 4 else None
    if "://" in cleaned:
        return "url"
    if "/" in cleaned:
        return None
    return "domain"
