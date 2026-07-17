from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class Settings:
    user_addresses: set[str] = field(default_factory=set)
    inactive_subscription_months: int = 12
    store_subjects: bool = True
    store_body_text: bool = False
    body_hashing: bool = True
    redact_email_local_parts: bool = False
    include_spam: bool = True
    include_trash: bool = True
    sample_subjects_per_sender: int = 5
    top_senders: int = 100
    top_domains: int = 100


def load_settings(path: str | None, user_addresses: list[str], **overrides: Any) -> Settings:
    data: dict[str, Any] = {}
    if path:
        try:
            import yaml
            data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
        except ImportError as exc:
            raise RuntimeError("PyYAML is required to read --config files.") from exc
    classification = data.get("classification", {})
    privacy = data.get("privacy", {})
    report = data.get("report", {})
    addresses = set(str(v).lower().strip() for v in data.get("user_addresses", []))
    addresses.update(v.lower().strip() for v in user_addresses if v.strip())
    settings = Settings(
        user_addresses=addresses,
        inactive_subscription_months=int(classification.get("inactive_subscription_months", 12)),
        store_subjects=bool(privacy.get("store_subjects", True)),
        store_body_text=bool(privacy.get("store_body_text", False)),
        body_hashing=bool(privacy.get("body_hashing", True)),
        redact_email_local_parts=bool(privacy.get("redact_email_local_parts", False)),
        include_spam=bool(report.get("include_spam", True)),
        include_trash=bool(report.get("include_trash", True)),
        sample_subjects_per_sender=int(report.get("sample_subjects_per_sender", 5)),
        top_senders=int(report.get("top_senders", 100)),
        top_domains=int(report.get("top_domains", 100)),
    )
    for key, value in overrides.items():
        if value is not None and hasattr(settings, key):
            setattr(settings, key, value)
    return settings
