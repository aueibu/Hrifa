from __future__ import annotations

import pandas as pd


def _join_unique(values) -> str:
    return "; ".join(sorted({str(v) for v in values if str(v)}))


def aggregate(messages: pd.DataFrame) -> dict[str, pd.DataFrame]:
    if messages.empty:
        return {name: pd.DataFrame() for name in ("senders", "domains", "labels", "timeline_monthly", "subscriptions", "accounts", "duplicates", "attachments")}
    messages["date_dt"] = pd.to_datetime(messages["date_parsed"], errors="coerce", utc=True)
    received = messages[messages["direction"] == "received"]
    senders = messages.groupby(["from_address", "from_name", "from_domain"], dropna=False).agg(
        message_count=("message_id", "size"), received_count=("is_received", "sum"), sent_count=("is_sent", "sum"), first_seen=("date_dt", "min"), last_seen=("date_dt", "max"), active_months=("year_month", "nunique"), estimated_total_bytes=("message_estimated_bytes", "sum"), attachment_total_bytes=("attachment_total_bytes", "sum"), newsletter_score=("newsletter_score", "mean"), automated_score=("automated_score", "mean"), human_score=("human_score", "mean"), dominant_category=("category_estimate", lambda s: s.mode().iat[0] if not s.mode().empty else "unknown"), gmail_labels=("gmail_labels", _join_unique)
    ).reset_index().rename(columns={"from_address": "sender_address", "from_name": "sender_name", "from_domain": "domain"})
    senders["percent"] = (senders.message_count / len(messages) * 100).round(2)
    senders = senders.sort_values("message_count", ascending=False).reset_index(drop=True)
    senders["cumulative_percent"] = senders.percent.cumsum().round(2)
    domains = messages.groupby("from_domain", dropna=False).agg(message_count=("message_id", "size"), unique_sender_addresses=("from_address", "nunique"), first_seen=("date_dt", "min"), last_seen=("date_dt", "max"), estimated_bytes=("message_estimated_bytes", "sum"), attachment_bytes=("attachment_total_bytes", "sum"), active_months=("year_month", "nunique"), sent_count=("is_sent", "sum"), received_count=("is_received", "sum")).reset_index().rename(columns={"from_domain": "domain"}).sort_values("message_count", ascending=False)
    labels = messages.assign(label=messages.gmail_labels.str.split("; ")).explode("label"); labels = labels[labels.label.notna() & (labels.label != "")].groupby("label").size().reset_index(name="message_count").sort_values("message_count", ascending=False)
    timeline = messages.groupby(["year_month", "direction", "category_estimate"], dropna=False).agg(messages=("message_id", "size"), estimated_bytes=("message_estimated_bytes", "sum"), attachment_bytes=("attachment_total_bytes", "sum")).reset_index()
    gaps = received.sort_values("date_dt").groupby("from_address").date_dt.apply(lambda x: x.diff().dt.total_seconds().div(86400).median()).rename("median_gap_days")
    subscriptions = senders.merge(gaps, left_on="sender_address", right_index=True, how="left")
    latest = messages.date_dt.max(); subscriptions["subscription_age_days"] = (subscriptions.last_seen - subscriptions.first_seen).dt.days
    subscriptions["currently_active"] = (latest - subscriptions.last_seen).dt.days <= 365
    subscriptions["has_unsubscribe"] = subscriptions.sender_address.isin(messages.loc[messages.has_unsubscribe_header, "from_address"])
    def frequency(g):
        if pd.isna(g): return "unknown"
        if g <= 1.5: return "daily"
        if g <= 8.5: return "weekly"
        if g <= 17: return "biweekly"
        if g <= 40: return "monthly"
        return "irregular"
    subscriptions["probable_frequency"] = subscriptions.median_gap_days.map(frequency)
    subscriptions = subscriptions[(subscriptions.has_unsubscribe) | (subscriptions.newsletter_score >= 2)].sort_values("message_count", ascending=False)
    signals = "welcome|verify|account|password|security|sign-in|subscription|billing|invoice|receipt|order|renewal"
    account_rows = messages[messages.subject.str.contains(signals, case=False, regex=True, na=False)].groupby("from_domain").agg(message_count=("message_id", "size"), first_seen=("date_dt", "min"), last_seen=("date_dt", "max"), evidence=("subject", lambda s: " | ".join(s.dropna().head(3)))).reset_index().rename(columns={"from_domain": "domain"})
    account_rows["category"] = "possible service relationship"; account_rows["confidence"] = (0.3 + account_rows.message_count.clip(upper=10) * .05).round(2)
    duplicates = messages[messages.duplicated("message_id", keep=False) | messages.duplicated("body_hash", keep=False)].sort_values("message_id")
    return {"senders": senders, "domains": domains, "labels": labels, "timeline_monthly": timeline, "subscriptions": subscriptions, "accounts": account_rows, "duplicates": duplicates}


def summary(messages: pd.DataFrame, tables: dict[str, pd.DataFrame]) -> dict:
    total = len(messages); dates = pd.to_datetime(messages.date_parsed, errors="coerce", utc=True)
    categories = messages.category_estimate.value_counts(normalize=True).mul(100).round(2).to_dict()
    counts = tables["senders"].message_count if not tables["senders"].empty else pd.Series(dtype=int)
    return {"local_only": True, "total_messages": total, "total_received": int(messages.is_received.sum()), "total_sent": int(messages.is_sent.sum()), "total_drafts": int(messages.is_draft.sum()), "total_spam": int(messages.is_spam.sum()), "total_trash": int(messages.is_trash.sum()), "unique_sender_addresses": int(messages.from_address.replace("", pd.NA).nunique()), "unique_sender_domains": int(messages.from_domain.replace("", pd.NA).nunique()), "unique_labels": int(len(tables["labels"])), "oldest_message_date": dates.min().isoformat() if dates.notna().any() else None, "newest_message_date": dates.max().isoformat() if dates.notna().any() else None, "estimated_archive_bytes": int(messages.message_estimated_bytes.sum()), "attachment_bytes": int(messages.attachment_total_bytes.sum()), "messages_with_attachments": int(messages.has_attachment.sum()), "category_percentages": categories, "top_sender_share_percent": float(counts.iloc[0] / total * 100) if total and len(counts) else 0, "sender_concentration_hhi": float(((counts / total) ** 2).sum()) if total else 0}
