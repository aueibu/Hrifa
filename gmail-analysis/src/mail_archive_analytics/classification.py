from __future__ import annotations

import re

NEWS_TERMS = ("newsletter", "digest", "updates", "news", "wordoftheday", "daily", "weekly")
AUTO_TERMS = ("no-reply", "noreply", "do-not-reply", "receipt", "confirmation", "verification", "alert", "notification", "password reset", "statement", "invoice", "order", "shipping")
SECURITY_TERMS = ("password", "security", "verify", "sign-in", "login")
COMMERCE_TERMS = ("receipt", "invoice", "order", "shipping", "billing", "purchase")


def classify(record: dict) -> dict:
    newsletter = automated = human = 0
    reasons: list[str] = []
    address = record.get("from_address", "").lower()
    subject = record.get("subject", "").lower()
    headers = " ".join(str(record.get(k, "")) for k in ("precedence", "auto_submitted", "list_id", "list_unsubscribe")).lower()
    if record.get("has_unsubscribe_header"):
        newsletter += 4; reasons.append("List-Unsubscribe header")
    if record.get("list_id"):
        newsletter += 3; reasons.append("List-ID header")
    if record.get("precedence") in ("bulk", "list", "junk"):
        newsletter += 2; automated += 2; reasons.append(f"Precedence: {record['precedence']}")
    if any(term in address for term in NEWS_TERMS):
        newsletter += 2; reasons.append("newsletter-like sender address")
    if any(term in address for term in AUTO_TERMS):
        automated += 3; reasons.append("machine-oriented sender address")
    if record.get("auto_submitted"):
        automated += 4; reasons.append("Auto-Submitted header")
    if any(term in subject for term in AUTO_TERMS):
        automated += 2; reasons.append("automated subject signal")
    if record.get("in_reply_to") or record.get("references"):
        human += 3; reasons.append("conversation threading header")
    if re.match(r"^(re|fw|fwd):", subject):
        human += 1; reasons.append("reply-like subject")
    if not headers and not any(term in address for term in AUTO_TERMS):
        human += 1
    if any(term in subject for term in SECURITY_TERMS):
        category = "account_security"
    elif any(term in subject for term in COMMERCE_TERMS):
        category = "commerce"
    elif newsletter >= max(automated, human) and newsletter >= 3:
        category = "newsletter"
    elif automated >= human and automated >= 2:
        category = "transactional" if any(term in subject for term in AUTO_TERMS) else "automated_other"
    elif human >= 2:
        category = "human_correspondence"
    else:
        category = "unknown"
    winning = {"newsletter": newsletter, "human_correspondence": human}.get(category, automated if category != "unknown" else 0)
    confidence = round(min(0.98, 0.35 + winning * 0.13), 2) if winning else 0.2
    record.update({"bulk_indicator_score": newsletter + automated, "automated_score": automated, "newsletter_score": newsletter, "human_score": human, "category_estimate": category, "category_confidence": confidence, "classification_reasons": "; ".join(reasons)})
    return record
