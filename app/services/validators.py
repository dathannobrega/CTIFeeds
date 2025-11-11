"""Validation utilities for indicator values."""
from __future__ import annotations

import ipaddress
from urllib.parse import urlparse


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
