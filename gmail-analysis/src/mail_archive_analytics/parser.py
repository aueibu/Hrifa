from __future__ import annotations

import hashlib
import re
from collections.abc import Iterator
from datetime import datetime, timezone
from email.header import decode_header
from email.parser import BytesParser
from email.policy import compat32
from email.utils import getaddresses, parsedate_to_datetime
from pathlib import Path

from .config import Settings

AUTOMATED_TERMS = ("no-reply", "noreply", "do-not-reply", "notification", "alert")


def decode_header(value: str | None) -> str:
    if not value:
        return ""
    try:
        return "".join(
            part.decode(charset or "utf-8", errors="replace") if isinstance(part, bytes) else part
            for part, charset in decode_header(value)
        ).strip()
    except Exception:
        return str(value).strip()


def addresses(value: str | None) -> list[tuple[str, str]]:
    return [(decode_header(name), address.lower().strip()) for name, address in getaddresses([value or ""]) if address]


def root_domain(address: str) -> str:
    domain = address.rsplit("@", 1)[-1].lower() if "@" in address else ""
    try:
        import tldextract
        extracted = tldextract.TLDExtract(suffix_list_urls=None)(domain)
        return ".".join(x for x in (extracted.domain, extracted.suffix) if x) or domain
    except ImportError:
        parts = domain.split(".")
        return ".".join(parts[-2:]) if len(parts) >= 2 else domain


def parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)
    except (TypeError, ValueError, IndexError, OverflowError):
        return None


def normalized_subject(subject: str) -> str:
    return re.sub(r"^(?:(?:re|fwd?|fw)\s*:\s*)+", "", subject, flags=re.I).strip().lower()


def parse_message(message, source_file: Path, source_index: int, settings: Settings) -> tuple[dict, list[dict]]:
    raw_from = decode_header(message.get("From"))
    pair = addresses(message.get("From"))
    from_name, from_address = pair[0] if pair else ("", "")
    labels = [x.strip() for x in (message.get("X-Gmail-Labels") or "").split(",") if x.strip()]
    label_lower = {x.lower() for x in labels}
    date = parse_date(message.get("Date"))
    to_addresses = addresses(message.get("To")) + addresses(message.get("Cc")) + addresses(message.get("Bcc"))
    is_sent = "sent" in label_lower or from_address in settings.user_addresses
    is_draft = "draft" in label_lower
    is_spam = "spam" in label_lower
    is_trash = "trash" in label_lower
    is_received = not is_sent
    if from_address in settings.user_addresses and any(a not in settings.user_addresses for _, a in to_addresses):
        direction = "sent"
    elif is_sent:
        direction = "self_sent" if all(a in settings.user_addresses for _, a in to_addresses) else "sent"
    elif from_address:
        direction = "received"
    else:
        direction = "ambiguous"
    attachments: list[dict] = []
    plain_length = html_length = 0
    for part in message.walk():
        if part.is_multipart():
            continue
        disposition = (part.get_content_disposition() or "").lower()
        filename = decode_header(part.get_filename())
        payload = part.get_payload(decode=True) or b""
        if disposition == "attachment" or filename:
            attachments.append({
                "message_id": message.get("X-GM-MSGID") or message.get("Message-ID") or f"{source_file.name}:{source_index}",
                "sender": from_address, "date": date.isoformat() if date else "", "filename": filename,
                "extension": Path(filename).suffix.lower(), "mime_type": part.get_content_type(), "size_bytes": len(payload),
            })
        elif part.get_content_type() == "text/plain":
            plain_length += len(payload)
        elif part.get_content_type() == "text/html":
            html_length += len(payload)
    subject = decode_header(message.get("Subject"))
    body_hash = ""
    if settings.body_hashing:
        body_hash = hashlib.sha256((message.get("Message-ID", "") + subject + str(plain_length) + str(html_length)).encode()).hexdigest()
    record = {
        "message_id": message.get("X-GM-MSGID") or message.get("Message-ID") or f"{source_file.name}:{source_index}",
        "thread_id": message.get("X-GM-THRID", ""), "source_file": str(source_file), "source_index": source_index,
        "subject": subject if settings.store_subjects else "", "normalized_subject": normalized_subject(subject),
        "date_raw": decode_header(message.get("Date")), "date_parsed": date.isoformat() if date else "",
        "year": date.year if date else None, "month": date.month if date else None,
        "year_month": date.strftime("%Y-%m") if date else "", "weekday": date.strftime("%A") if date else "", "hour": date.hour if date else None,
        "from_raw": raw_from, "from_name": from_name, "from_address": from_address, "from_domain": root_domain(from_address),
        "reply_to": decode_header(message.get("Reply-To")), "to_raw": decode_header(message.get("To")), "cc_raw": decode_header(message.get("Cc")), "bcc_raw": decode_header(message.get("Bcc")), "recipient_count": len(to_addresses),
        "direction": direction, "is_sent": is_sent, "is_received": is_received, "is_draft": is_draft, "is_spam": is_spam, "is_trash": is_trash, "gmail_labels": "; ".join(labels),
        "has_attachment": bool(attachments), "attachment_count": len(attachments), "attachment_total_bytes": sum(a["size_bytes"] for a in attachments),
        "message_estimated_bytes": len(message.as_bytes()), "body_plain_length": plain_length, "body_html_length": html_length, "body_total_length": plain_length + html_length,
        "has_unsubscribe_header": bool(message.get("List-Unsubscribe")), "list_unsubscribe": decode_header(message.get("List-Unsubscribe")), "list_id": decode_header(message.get("List-ID")), "precedence": decode_header(message.get("Precedence")).lower(), "auto_submitted": decode_header(message.get("Auto-Submitted")).lower(), "x_auto_response_suppress": decode_header(message.get("X-Auto-Response-Suppress")),
        "in_reply_to": decode_header(message.get("In-Reply-To")), "references": decode_header(message.get("References")), "body_hash": body_hash,
        "parse_status": "parsed", "parse_error": "",
    }
    return record, attachments


def _stream_mbox(path: Path):
    """Yield parsed messages with their byte offset without indexing the whole MBOX first."""
    with path.open("rb") as handle:
        chunks: list[bytes] = []
        first = True
        for line in handle:
            if line.startswith(b"From "):
                if first:
                    first = False
                    continue
                if chunks:
                    yield BytesParser(policy=compat32).parsebytes(b"".join(chunks)), handle.tell()
                    chunks = []
            chunks.append(line)
        if chunks:
            yield BytesParser(policy=compat32).parsebytes(b"".join(chunks)), handle.tell()


def parse_mboxes(files: list[Path], settings: Settings, log, progress=None) -> Iterator[tuple[dict, list[dict]]]:
    total_bytes = sum(path.stat().st_size for path in files)
    completed_bytes = 0
    parsed_count = 0
    for path in files:
        file_size = path.stat().st_size
        try:
            for index, (message, offset) in enumerate(_stream_mbox(path)):
                try:
                    record = parse_message(message, path, index, settings)
                    parsed_count += 1
                    if progress and parsed_count % 100 == 0:
                        progress(parsed_count, completed_bytes + offset, total_bytes, path, offset, file_size)
                    yield record
                except Exception as exc:
                    log.exception("Message %s:%s partially skipped: %s", path, index, exc)
            completed_bytes += file_size
            if progress:
                progress(parsed_count, completed_bytes, total_bytes, path, file_size, file_size)
        except Exception as exc:
            log.exception("Could not read %s: %s", path, exc)
