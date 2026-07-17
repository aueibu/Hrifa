from pathlib import Path

from mail_archive_analytics.config import Settings
from mail_archive_analytics.parser import parse_message
from mail_archive_analytics.classification import classify
from email import message_from_string


def test_gmail_newsletter_with_attachment():
    msg = message_from_string("""From: Dictionary.com <wordoftheday@dictionary.com>
To: me@example.com
Date: Tue, 14 Jul 2026 10:00:00 +0000
Subject: Word of the Day
X-Gmail-Labels: Inbox, WOTD
List-Unsubscribe: <https://example.com/unsub>
Precedence: bulk
Content-Type: multipart/mixed; boundary=x

--x
Content-Type: text/plain

Hello
--x
Content-Type: application/pdf
Content-Disposition: attachment; filename=word.pdf
Content-Transfer-Encoding: base64

YWJj
--x--
""")
    record, attachments = parse_message(msg, Path("test.mbox"), 0, Settings())
    classified = classify(record)
    assert classified["from_address"] == "wordoftheday@dictionary.com"
    assert classified["from_domain"] == "dictionary.com"
    assert classified["category_estimate"] == "newsletter"
    assert len(attachments) == 1
