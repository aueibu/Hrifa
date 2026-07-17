# Gmail Archive Analytics — Codex Handoff

## 1. Project Goal

Build a local-first application that analyzes a Gmail archive exported through Google Takeout.

The application should ingest one or more `.mbox` files and produce an analytical overview of the mailbox, including:

* total message count
* sender frequency
* sender-domain frequency
* message volume over time
* largest senders by message count
* largest senders by estimated storage
* first and last appearance of each sender
* newsletter and automated-message estimates
* human-correspondence estimates
* attachment counts and attachment sizes
* sent-versus-received message volume
* subscription longevity
* mailbox growth over time
* potentially forgotten services and accounts

The application must run locally. It must not upload, transmit, or expose email contents to any external service.

---

## 2. Primary Use Case

The user has approximately 15,000 Gmail messages and discovered that around 4,700 belong to a Dictionary.com Word of the Day label.

The purpose of the application is to reveal similar patterns across the entire mailbox.

Representative questions:

* Which senders account for the largest percentage of my archive?
* Which domains send me the most mail?
* How much of my archive is automated?
* How much consists of direct human correspondence?
* Which subscriptions have existed for the longest time?
* Which services have not contacted me in years?
* When did major periods of mailbox activity begin or end?
* Which messages occupy the most storage?
* Which senders or categories could be safely reviewed for deletion?
* How has my email volume changed over the years?

This is primarily an archival-analysis and digital-presence-reclamation tool, not an email client.

---

## 3. Technical Direction

Use Python for ingestion and analysis.

Recommended stack:

* Python 3.11+
* `mailbox` from the Python standard library for MBOX parsing
* `email` from the Python standard library for MIME parsing
* `pandas` for tabular analysis
* `numpy` where useful
* `plotly` for interactive charts
* `jinja2` for HTML report generation
* `tldextract` for domain normalization
* `python-dateutil` for date parsing
* `beautifulsoup4` for optional HTML-body inspection
* `pyarrow` for Parquet output
* `typer` or `argparse` for the command-line interface

Preferred initial delivery:

1. command-line ingestion and analysis tool
2. generated standalone HTML dashboard
3. CSV and Parquet analytical datasets
4. optional local web interface later

Avoid requiring a database in the first version unless scale or performance demands it.

For approximately 15,000 messages, an in-memory Pandas workflow should be sufficient.

---

## 4. Privacy Requirements

The application must:

* operate entirely offline
* make no network requests
* contain no analytics or telemetry
* avoid embedding remote fonts, scripts, images, or CDNs
* use locally bundled JavaScript for charts where possible
* never transmit message metadata or content
* never require Gmail API authorization
* never require Google account credentials
* clearly state that analysis is local-only

The default reports should avoid displaying full email bodies.

The application may inspect headers and limited body characteristics internally, but full body text should not be written into analytical exports unless the user explicitly enables that option.

---

## 5. Input

Support:

* one `.mbox` file
* multiple `.mbox` files
* a directory containing `.mbox` files
* Google Takeout archives after manual extraction
* optionally `.zip` or `.tgz` Takeout archives in a later phase

Example CLI:

```bash
python -m mail_archive_analytics analyze "/path/to/Takeout/Mail/All mail Including Spam and Trash.mbox"
```

Multiple inputs:

```bash
python -m mail_archive_analytics analyze \
  "/path/to/archive1.mbox" \
  "/path/to/archive2.mbox"
```

Directory input:

```bash
python -m mail_archive_analytics analyze "/path/to/Takeout/Mail/"
```

Output:

```text
output/
├── dashboard.html
├── summary.json
├── messages.parquet
├── senders.csv
├── domains.csv
├── timeline_monthly.csv
├── subscriptions.csv
├── attachments.csv
└── logs/
    └── ingestion.log
```

---

## 6. Core Message Schema

Create one normalized record per message.

Suggested fields:

```text
message_id
thread_id
source_file
source_index
subject
normalized_subject
date_raw
date_parsed
year
month
year_month
weekday
hour
from_raw
from_name
from_address
from_domain
reply_to
to_raw
cc_raw
bcc_raw
recipient_count
direction
is_sent
is_received
is_draft
is_spam
is_trash
gmail_labels
has_attachment
attachment_count
attachment_total_bytes
message_estimated_bytes
body_plain_length
body_html_length
body_total_length
has_unsubscribe_header
list_unsubscribe
list_id
precedence
auto_submitted
x_auto_response_suppress
bulk_indicator_score
automated_score
newsletter_score
human_score
category_estimate
parse_status
parse_error
```

Do not depend on every field being available.

Malformed messages should be logged and skipped or partially parsed rather than crashing the entire run.

---

## 7. Gmail-Specific Metadata

Google Takeout MBOX files may include Gmail-specific headers such as:

```text
X-Gmail-Labels
X-GM-THRID
X-GM-MSGID
```

Parse and preserve these when present.

Use Gmail labels to identify:

* Sent
* Inbox
* Draft
* Spam
* Trash
* Starred
* Important
* user-created labels such as `WOTD`

Store the full label list for each message.

Allow reports by Gmail label.

Example:

| Label    | Messages | Percent |
| -------- | -------: | ------: |
| WOTD     |    4,700 |   31.3% |
| Sent     |    1,900 |   12.7% |
| Receipts |      860 |    5.7% |

Account for messages with multiple labels.

Label percentages therefore may sum to more than 100%.

---

## 8. Sender Normalization

Normalize sender addresses carefully.

Examples:

```text
"Dictionary.com" <wordoftheday@dictionary.com>
wordoftheday@dictionary.com
Dictionary.com <WordOfTheDay@dictionary.com>
```

These should generally map to:

```text
from_name: Dictionary.com
from_address: wordoftheday@dictionary.com
from_domain: dictionary.com
```

Normalization rules:

* lowercase email addresses
* trim surrounding whitespace
* decode MIME-encoded names
* remove obvious formatting inconsistencies
* extract registrable domain using `tldextract`
* preserve original raw header
* do not merge unrelated addresses solely because their display names match

Create separate rankings for:

* exact sender address
* sender display name
* root domain

---

## 9. Direction Detection

Determine whether each message is:

* received
* sent
* self-sent
* ambiguous

Possible signals:

* Gmail `Sent` label
* sender address matches one of the user’s known addresses
* `Delivered-To`
* `X-Original-To`
* `From`
* recipient headers

Provide a configuration file or CLI option for known user addresses:

```yaml
user_addresses:
  - primary@example.com
  - oldaddress@example.com
```

Example:

```bash
python -m mail_archive_analytics analyze archive.mbox \
  --user-address primary@example.com \
  --user-address oldaddress@example.com
```

---

## 10. Automated, Newsletter, and Human Classification

Implement a transparent heuristic scoring system.

Do not present classification as certain.

### 10.1 Newsletter Signals

Increase newsletter score when:

* `List-Unsubscribe` exists
* `List-ID` exists
* `Precedence: bulk`
* sender name contains newsletter-like terms
* subject repeatedly follows a template
* sender sends at a regular cadence
* message is sent to a large or generic list
* body contains unsubscribe language
* sender address contains terms such as:

  * newsletter
  * digest
  * updates
  * news
  * wordoftheday
  * daily
  * weekly

### 10.2 Automated Signals

Increase automated score when:

* `Auto-Submitted` exists
* `Precedence` is `bulk`, `list`, or `junk`
* sender is `no-reply`, `noreply`, `do-not-reply`, or similar
* subject contains:

  * receipt
  * confirmation
  * verification
  * alert
  * notification
  * password reset
  * statement
  * invoice
  * order
  * shipping
* repeated subject structures appear
* sender volume is high
* message cadence is highly regular
* sender address is machine-oriented

### 10.3 Human Signals

Increase human score when:

* message belongs to a conversational thread
* sender and recipient exchange messages in both directions
* `In-Reply-To` or `References` exists
* subject begins with `Re:` or `Fwd:` only as a weak signal
* sender has a personal-looking address
* messages from that sender show varied subjects and irregular cadence
* sent and received correspondence both exist
* messages contain no bulk or list headers

### 10.4 Classification Output

Suggested categories:

```text
human_correspondence
newsletter
transactional
account_security
commerce
social_notification
work_or_institutional
automated_other
unknown
```

For each message, store:

```text
category_estimate
category_confidence
classification_reasons
```

Example:

```json
{
  "category_estimate": "newsletter",
  "category_confidence": 0.94,
  "classification_reasons": [
    "List-Unsubscribe header",
    "List-ID header",
    "daily cadence",
    "Precedence: bulk"
  ]
}
```

The dashboard should explain that these are heuristic estimates.

---

## 11. Core Metrics

Produce at least the following metrics.

### Mailbox Summary

* total messages
* total received
* total sent
* total drafts
* total spam
* total trash
* total unique sender addresses
* total unique sender domains
* total unique labels
* oldest message date
* newest message date
* total estimated archive size
* total attachment size
* number of messages with attachments
* average messages per month
* median messages per month

### Composition

* percentage automated
* percentage newsletter
* percentage transactional
* percentage estimated human
* percentage unknown
* sent versus received ratio
* attachment-bearing message percentage

### Concentration

* top sender percentage
* top 5 senders percentage
* top 10 senders percentage
* top domain percentage
* top 10 domains percentage
* Herfindahl-style sender concentration metric
* number of senders responsible for 50% of all received mail
* number of senders responsible for 80% of all received mail

This should reveal facts such as:

> Dictionary.com accounts for 31% of the entire archive.

---

## 12. Sender Analysis

Create a sender table with:

```text
sender_address
sender_name
domain
message_count
received_count
sent_count
first_seen
last_seen
active_days
active_months
average_messages_per_month
median_gap_days
estimated_total_bytes
attachment_total_bytes
newsletter_score
automated_score
human_score
dominant_category
gmail_labels
```

Allow sorting by:

* message count
* total estimated bytes
* attachment bytes
* first seen
* last seen
* longevity
* frequency
* automation score
* newsletter score
* human score

Provide cumulative percentage.

Example:

| Rank | Sender           | Messages | Percent | Cumulative |
| ---: | ---------------- | -------: | ------: | ---------: |
|    1 | Dictionary.com   |    4,700 |   31.3% |      31.3% |
|    2 | Example Retailer |      930 |    6.2% |      37.5% |
|    3 | Social Platform  |      780 |    5.2% |      42.7% |

---

## 13. Domain Analysis

Aggregate by registrable domain.

Examples:

```text
dictionary.com
amazon.com
google.com
github.com
substack.com
```

Do not keep subdomains separate by default.

Provide an option to inspect subdomains.

Metrics:

* message count
* unique sender addresses
* first seen
* last seen
* estimated bytes
* attachments
* category distribution
* sent versus received counts
* active months
* average monthly volume

---

## 14. Timeline Analysis

Produce:

* messages per year
* messages per month
* sent messages per month
* received messages per month
* newsletters per month
* automated messages per month
* estimated human messages per month
* cumulative mailbox growth
* new sender domains first appearing by month
* inactive sender domains disappearing by month

Charts:

1. total messages by year
2. monthly message volume
3. cumulative archive growth
4. sent versus received over time
5. automated versus human over time
6. top sender share over time
7. attachment volume over time

Allow filtering by:

* sender
* domain
* label
* category
* date range
* direction

---

## 15. Subscription Analysis

Create a likely-subscriptions table.

Suggested fields:

```text
sender
domain
message_count
first_seen
last_seen
subscription_age_days
active_months
median_gap_days
estimated_cadence
has_unsubscribe
latest_message_date
currently_active
probable_frequency
```

Frequency estimates:

```text
daily
weekdays
weekly
biweekly
monthly
irregular
inactive
unknown
```

Use median and modal inter-message gaps.

Examples:

* median gap approximately 1 day → daily
* approximately 7 days → weekly
* approximately 30 days → monthly

Mark subscriptions as inactive when no message has appeared within a configurable threshold, such as 12 months.

---

## 16. Digital Presence Inventory

Generate a tentative service/account inventory from sender domains and recurring transactional mail.

Possible categories:

* shopping
* finance
* social media
* utilities
* travel
* education
* employment
* newsletters
* software
* cloud services
* streaming
* healthcare
* government
* forums
* account security

This table is intended to help identify forgotten accounts and services.

Suggested fields:

```text
service_name
domain
category
message_count
first_seen
last_seen
account_signal_count
security_signal_count
purchase_signal_count
possible_active_account
confidence
evidence
```

Signals include subjects such as:

```text
welcome
verify your email
account created
password reset
security alert
sign-in
subscription
billing
invoice
receipt
order
renewal
```

Do not infer that an account definitely exists merely from one message.

Use language such as:

```text
possible account
likely account
historical service relationship
```

---

## 17. Attachment Analysis

For each attachment, extract:

```text
message_id
sender
date
filename
extension
mime_type
size_bytes
category_estimate
```

Aggregate:

* most common extensions
* largest attachment senders
* attachment size by year
* total attachment storage
* messages with exceptionally large attachments
* duplicate filenames
* optionally duplicate content hashes

Avoid extracting attachments to disk by default.

Add optional command:

```bash
python -m mail_archive_analytics extract-attachments archive.mbox \
  --output extracted_attachments/
```

This should require explicit action.

---

## 18. Duplicate Detection

Detect probable duplicates using combinations of:

* Gmail message ID
* `Message-ID`
* normalized sender
* normalized subject
* parsed date
* body hash
* attachment hash

Report:

* exact duplicates
* near duplicates
* repeated newsletter templates

Do not delete anything.

Only produce a duplicate report.

---

## 19. Dashboard Requirements

Generate a standalone HTML dashboard.

The dashboard should contain:

### Overview

* total messages
* archive date range
* unique senders
* unique domains
* estimated automated percentage
* estimated human percentage
* attachment size
* top sender share

### Mailbox Composition

* category distribution
* Gmail label distribution
* sent versus received
* automated versus human estimate

### Sender Concentration

* top senders table
* Pareto chart
* cumulative sender percentage

### Domain Ecology

* top domains
* domain category breakdown
* domain activity over time

### Timeline

* yearly and monthly volume
* cumulative growth
* new senders appearing
* inactive senders disappearing

### Subscriptions

* longest-running subscriptions
* most frequent subscriptions
* inactive subscriptions
* subscriptions with unsubscribe headers

### Digital Presence

* probable services and accounts
* first and last contact dates
* dormant services
* account-security messages

### Storage

* estimated total message size
* largest senders by storage
* attachment totals
* largest attachments

### Data Quality

* parsing failures
* messages with invalid dates
* unknown senders
* classification uncertainty

---

## 20. Dashboard Interactivity

Provide client-side filters where practical:

* date range
* sender
* domain
* label
* category
* direction
* automated versus human
* attachment presence

Tables should support:

* sorting
* searching
* pagination
* CSV export where practical

Do not include message body previews by default.

Allow the user to drill into a sender and see:

* first and last message date
* monthly volume
* common subject patterns
* labels
* category estimates
* attachment totals
* whether unsubscribe headers exist
* representative subject lines

Representative subject lines should be limited in number and locally displayed.

---

## 21. Deletion-Review Recommendations

The tool must not delete messages.

It may generate review candidates based on transparent rules.

Examples:

* sender has more than 500 messages
* sender is over 90% likely automated
* no replies from the user
* no messages read or starred, where metadata permits
* no messages in the last three years
* newsletter with unsubscribe header
* messages occupy substantial storage
* messages are duplicated

Suggested output:

| Sender         | Messages | Last Seen  | Estimated Type | Review Reason    |
| -------------- | -------: | ---------- | -------------- | ---------------- |
| Dictionary.com |    4,700 | 2026-07-15 | Newsletter     | 31% of archive   |
| Old Retailer   |      620 | 2018-03-04 | Commerce       | Inactive 8 years |
| Social Alerts  |      910 | 2021-09-12 | Automated      | No human replies |

Also generate Gmail search queries for review.

Example:

```text
from:wordoftheday@dictionary.com
```

Or:

```text
from:(wordoftheday@dictionary.com) older_than:5y
```

The application should only suggest queries. It must not connect to Gmail or perform deletions.

---

## 22. Configuration

Support a YAML configuration file.

Example:

```yaml
user_addresses:
  - user@example.com
  - old-address@example.com

classification:
  inactive_subscription_months: 12
  human_confidence_threshold: 0.70
  newsletter_confidence_threshold: 0.70
  automated_confidence_threshold: 0.70

privacy:
  store_subjects: true
  store_body_text: false
  body_hashing: true
  redact_email_local_parts: false

report:
  top_senders: 100
  top_domains: 100
  sample_subjects_per_sender: 5
  include_spam: true
  include_trash: true
```

---

## 23. CLI Design

Suggested commands:

```bash
mail-analytics analyze INPUT...
```

```bash
mail-analytics inspect-sender archive.parquet sender@example.com
```

```bash
mail-analytics inspect-domain archive.parquet dictionary.com
```

```bash
mail-analytics report archive.parquet
```

```bash
mail-analytics export-csv archive.parquet
```

```bash
mail-analytics validate INPUT...
```

Example:

```bash
mail-analytics analyze "/path/to/All mail.mbox" \
  --output "./gmail-analysis" \
  --user-address "me@example.com"
```

Useful options:

```text
--output
--config
--user-address
--include-spam
--exclude-spam
--include-trash
--exclude-trash
--store-subjects
--redact-addresses
--no-body-inspection
--force
--verbose
```

---

## 24. Processing Stages

Use a staged pipeline.

### Stage 1: Discovery

* resolve input files
* identify MBOX files
* count file sizes
* validate readability

### Stage 2: Parsing

* parse each message
* decode headers
* extract Gmail labels
* parse MIME structure
* estimate message size
* inspect attachment metadata
* parse date safely

### Stage 3: Normalization

* normalize sender
* normalize domain
* normalize subject
* determine direction
* derive temporal fields

### Stage 4: Feature Extraction

* list headers
* automation signals
* unsubscribe signals
* cadence features
* threading features
* attachment features

### Stage 5: Classification

* score newsletter likelihood
* score automation likelihood
* score human correspondence likelihood
* assign category estimate
* preserve classification reasons

### Stage 6: Aggregation

* sender summaries
* domain summaries
* label summaries
* monthly timeline
* subscription summaries
* digital-presence inventory

### Stage 7: Export

* Parquet
* CSV
* JSON summary
* HTML dashboard

---

## 25. Performance

The first version should comfortably process at least:

* 100,000 messages
* multi-gigabyte MBOX archives
* malformed MIME messages without terminating

Use streaming where practical.

Do not load full attachment binary contents into memory unless needed.

For body analysis:

* inspect text parts incrementally
* limit body inspection to a configurable maximum number of characters
* hash large bodies without retaining them
* avoid rendering HTML

Display progress during parsing.

Example:

```text
Parsing messages: 8,420 / 15,037
```

Use progress bars through `tqdm` or Rich.

---

## 26. Error Handling

Handle:

* invalid dates
* missing sender
* malformed MIME boundaries
* unknown encodings
* encoded-word failures
* duplicated message IDs
* corrupt MBOX separators
* extremely large messages
* messages with no text body
* attachment filenames with invalid characters

Write errors to:

```text
logs/ingestion.log
```

Continue processing whenever safely possible.

At the end, report:

```text
Parsed successfully: 14,982
Partially parsed: 43
Skipped: 12
```

---

## 27. Testing

Create tests for:

* standard Gmail message
* message with Gmail labels
* multipart HTML message
* message with attachment
* newsletter with `List-Unsubscribe`
* automated no-reply message
* direct human reply thread
* sent message
* malformed date
* malformed sender header
* encoded sender name
* multiple recipients
* duplicate message
* non-ASCII subject
* empty body
* multiple MBOX inputs

Include small synthetic `.mbox` fixtures.

Do not include real personal emails in the repository.

---

## 28. Repository Structure

Suggested structure:

```text
gmail-archive-analytics/
├── README.md
├── pyproject.toml
├── requirements.txt
├── LICENSE
├── .gitignore
├── src/
│   └── mail_archive_analytics/
│       ├── __init__.py
│       ├── cli.py
│       ├── config.py
│       ├── discovery.py
│       ├── parser.py
│       ├── mime_utils.py
│       ├── normalization.py
│       ├── classification.py
│       ├── aggregation.py
│       ├── subscriptions.py
│       ├── accounts.py
│       ├── attachments.py
│       ├── duplicates.py
│       ├── exports.py
│       ├── report.py
│       └── models.py
├── templates/
│   └── dashboard.html.j2
├── static/
│   ├── dashboard.js
│   └── dashboard.css
├── tests/
│   ├── fixtures/
│   ├── test_parser.py
│   ├── test_normalization.py
│   ├── test_classification.py
│   └── test_aggregation.py
└── examples/
    └── config.example.yaml
```

---

## 29. README Requirements

The README should explain:

1. how to export Gmail using Google Takeout
2. how to extract the archive
3. how to install the application
4. how to run analysis
5. where output files are created
6. privacy guarantees
7. classification limitations
8. how to interpret the dashboard
9. how to use generated Gmail search queries
10. that the application never deletes email

Example setup:

```bash
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
```

macOS/Linux:

```bash
source .venv/bin/activate
```

Install:

```bash
pip install -e .
```

Analyze:

```bash
mail-analytics analyze "/path/to/All mail Including Spam and Trash.mbox"
```

---

## 30. First-Version Acceptance Criteria

The initial version is complete when it can:

1. parse a Google Takeout Gmail MBOX
2. process at least 15,000 messages without crashing
3. extract sender, domain, date, subject, labels, direction, and attachment metadata
4. rank senders and domains by message count
5. calculate first and last appearance
6. graph monthly and yearly volume
7. estimate automated, newsletter, and human correspondence
8. identify likely subscriptions
9. generate Gmail search queries for high-volume senders
10. export CSV and Parquet datasets
11. generate a standalone local HTML dashboard
12. make no network requests
13. preserve parsing errors in a log
14. avoid storing full body text by default

---

## 31. Suggested Implementation Phases

### Phase 1 — Reliable MBOX Parsing

Implement:

* file discovery
* message parsing
* header decoding
* Gmail labels
* sender normalization
* date parsing
* CSV and Parquet export

### Phase 2 — Core Analytics

Implement:

* sender rankings
* domain rankings
* label rankings
* timelines
* storage estimates
* attachment summaries

### Phase 3 — Classification

Implement:

* newsletter heuristics
* automated-message heuristics
* human-correspondence heuristics
* transparent confidence scores
* classification reasons

### Phase 4 — HTML Dashboard

Implement:

* summary cards
* charts
* searchable tables
* filters
* sender drill-downs
* Gmail review-query generation

### Phase 5 — Digital Presence Inventory

Implement:

* probable account detection
* service categorization
* dormant-service identification
* account-security and billing signal analysis

---

## 32. Future Enhancements

Do not implement these before the core application works.

Potential later features:

* desktop GUI using Tauri, Electron, or PySide
* local web application using FastAPI
* SQLite or DuckDB backend
* incremental re-analysis
* comparison between multiple archive snapshots
* semantic clustering of subjects
* contact-network visualization
* reply-network graph
* life-period segmentation
* local natural-language querying
* Gmail API integration
* local unsubscribe audit
* attachment extraction interface
* duplicate-message cleanup assistance
* export of deletion candidates as Gmail searches
* sender allowlist and denylist
* manual classification corrections
* user-defined categories

Any future Gmail API integration must remain optional and should require a separate privacy review.

---

## 33. Design Principles

Prioritize:

* privacy
* transparency
* reproducibility
* inspectable heuristics
* useful aggregation
* graceful handling of malformed data
* local ownership of analytical outputs

Avoid:

* opaque machine-learning classification
* cloud dependencies
* premature deletion features
* displaying private body text unnecessarily
* treating heuristic categories as definitive
* overcomplicated infrastructure

The application should help the user understand the composition and history of the archive before making decisions about deletion, retention, subscriptions, or account closure.
