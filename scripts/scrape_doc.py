#!/usr/bin/env python3
"""
Scrape the Columbia Directory of Classes into seed data for `courses` + `sections`.

    python3 scripts/scrape_doc.py --term Fall2026 --out data/
    python3 scripts/scrape_doc.py --term Fall2026 --subjects COMS,MATH,ECON --out data/

Source: https://doc.sis.columbia.edu
Structure (all static HTML, no JS):
    /sel/subjects.html               index of every {subject, term} listing page
    /subj/{SUBJ}/_{Term}{Year}.html  one page per subject per term, all sections
    /subj/{SUBJ}/{NUM}-{TERM}-{SEC}/ per-section detail page (adds description)

NOTE: the Directory no longer publishes meeting days/times/locations -- those moved
to Vergil, which requires a UNI login. Everything else we need is here.
"""

import argparse
import html
import json
import pathlib
import re
import sys
import time
import urllib.request

BASE = "https://doc.sis.columbia.edu"
UA = "seatmates-student-project/0.1 (Columbia course seed; contact: team)"
DELAY = 0.5  # be polite -- this is a university server, not an API

# Fall 2026 -> 20263. Directory term codes are <year><1=Spring|2=Summer|3=Fall>.
SEASON_DIGIT = {"Spring": "1", "Summer": "2", "Fall": "3"}


def get(url, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception as e:
            if attempt == retries - 1:
                print(f"  !! {url}: {e}", file=sys.stderr)
                return None
            time.sleep(2 * (attempt + 1))


def term_code(term):
    m = re.fullmatch(r"([A-Za-z]+)(\d{4})", term)
    if not m or m.group(1).capitalize() not in SEASON_DIGIT:
        sys.exit(f"bad --term {term!r}; want e.g. Fall2026")
    season, year = m.group(1).capitalize(), m.group(2)
    return f"{year}{SEASON_DIGIT[season]}"


def list_subjects(term):
    """Every subject with a listing page for this term."""
    page = get(f"{BASE}/sel/subjects.html")
    if not page:
        sys.exit("could not fetch subject index")
    found = re.findall(r'href="\.\./subj/([A-Z_]{2,4})/_' + re.escape(term) + r'\.html"', page)
    return sorted(set(found))


# One course header, then one <tr> per section until the next header.
#
# Numbers come in two flavors and BOTH appear on the same page for the same course:
# the header shows the current form students know from SSOL ("MATH UN1101") while the
# section URL uses the legacy form (".../V1101-20263-001/"). They are not derivable
# from each other, so we keep the header number as the searchable code and the URL
# number only for building detail links.
#
# Don't pattern-match the number itself -- formats vary far more than they look like
# they do (W3157, UN1101, GU4032, N03P_) and a too-strict pattern fails *silently*,
# yielding an empty subject rather than an error. Take the last token of the header
# instead, and let parse_subject_page report any header it couldn't turn into rows.
COURSE_RE = re.compile(
    r"<th colspan=2>\s*(?P<head>[^<]+?)\s*<br>\s*(?P<title>[^<]+?)\s*</th>", re.I
)
SECTION_RE = re.compile(
    r'<td><a href="[^"]*?/(?P<num>[A-Za-z0-9_]+)-(?P<term>\d{5})-(?P<sec>\w+)/">'
    r"\s*Section\s*(?P=sec)\s*</a></td>(?P<body>.*?)</tr>",
    re.I | re.S,
)
# "Fall 2026 Computer Science W3157" -> dept "Computer Science", number "W3157"
HEAD_RE = re.compile(r"^\s*[A-Za-z]+\s+\d{4}\s+(?P<rest>.+?)\s*$")
FIELD_RE = re.compile(r"<dt>\s*([^<]+?)\s*:?\s*</dt>\s*<dd>\s*(.*?)\s*</dd>", re.I | re.S)


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def parse_subject_page(page, subj, term):
    """-> (section dicts, list of headers that produced no rows)."""
    out, orphans = [], []
    headers = list(COURSE_RE.finditer(page))
    for i, h in enumerate(headers):
        start = h.end()
        end = headers[i + 1].start() if i + 1 < len(headers) else len(page)

        head = clean(h.group("head"))
        m = HEAD_RE.match(head)
        rest = m.group("rest") if m else head
        dept, _, number = rest.rpartition(" ")
        dept, number = clean(dept), number.strip()
        title = clean(h.group("title"))

        found = list(SECTION_RE.finditer(page[start:end]))
        if not found:
            orphans.append(head)
        for s in found:
            fields = {clean(k).lower(): clean(v) for k, v in FIELD_RE.findall(s.group("body"))}
            enrolled = cap = None
            if m := re.search(r"(\d+)\s+students?\s+\((\d+)\s+max\)", fields.get("enrollment", "")):
                enrolled, cap = int(m.group(1)), int(m.group(2))
            out.append(
                {
                    "term": term,
                    "subject": subj.rstrip("_"),
                    "number": number,
                    "legacy_number": s.group("num"),  # differs from `number`; URL-only
                    "code": f"{subj.rstrip('_')} {number}",
                    "title": title,
                    "department": dept,
                    "section": s.group("sec"),
                    "call_number": fields.get("call number"),
                    "points": fields.get("points"),
                    "instructor": fields.get("instructor"),
                    "enrolled": enrolled,
                    "capacity": cap,
                    "detail_url": f"{BASE}/subj/{subj}/{s.group('num')}-{term}-{s.group('sec')}/",
                }
            )
    return out, orphans


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--term", default="Fall2026", help="e.g. Fall2026")
    ap.add_argument("--subjects", help="comma-separated subset, e.g. COMS,MATH")
    ap.add_argument("--out", default="data", help="output directory")
    ap.add_argument("--delay", type=float, default=DELAY)
    args = ap.parse_args()

    tc = term_code(args.term)
    subjects = (
        [s.strip().upper() for s in args.subjects.split(",")]
        if args.subjects
        else list_subjects(args.term)
    )
    print(f"{args.term} ({tc}): {len(subjects)} subjects", file=sys.stderr)

    rows, failed, skipped = [], [], []
    for i, subj in enumerate(subjects, 1):
        page = get(f"{BASE}/subj/{subj}/_{args.term}.html")
        if not page:
            failed.append(subj)
            continue
        got, orphans = parse_subject_page(page, subj, tc)
        rows.extend(got)
        skipped.extend(f"{subj}: {o}" for o in orphans)
        note = f"  ({len(orphans)} header(s) unparsed)" if orphans else ""
        print(f"[{i}/{len(subjects)}] {subj:<5} {len(got):>4} sections{note}", file=sys.stderr)
        time.sleep(args.delay)

    # Split into the two tables the app actually uses.
    courses = {}
    for r in rows:
        courses.setdefault((r["term"], r["code"]), {
            "term": r["term"], "code": r["code"], "subject": r["subject"],
            "number": r["number"], "title": r["title"], "department": r["department"],
        })

    outdir = pathlib.Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)
    (outdir / f"courses_{tc}.json").write_text(json.dumps(list(courses.values()), indent=2))
    (outdir / f"sections_{tc}.json").write_text(json.dumps(rows, indent=2))
    if skipped:
        (outdir / f"skipped_{tc}.txt").write_text("\n".join(skipped))

    print(f"\n{len(courses)} courses / {len(rows)} sections -> {outdir}/", file=sys.stderr)
    if failed:
        print(f"FETCH FAILED ({len(failed)}): {', '.join(failed)}", file=sys.stderr)
    if skipped:
        print(f"UNPARSED HEADERS ({len(skipped)}): see skipped_{tc}.txt", file=sys.stderr)


if __name__ == "__main__":
    main()
