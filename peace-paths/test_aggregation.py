#!/usr/bin/env python3
"""
Test merge correctness:
  1. Events are deduplicated (no duplicates after merge)
  2. Events are appended correctly (old + new = all unique events per category)
  3. Phases and directions are recomputed from full event set
  4. Top-8 sort is correct after merge
"""
import json
import os
import sys
from datetime import datetime, timezone

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ai-analyze-prod.py")
code = open(SCRIPT, encoding="utf-8").read()
code = code.replace('if __name__ == "__main__":', 'if False:')
ns = {"__file__": SCRIPT}
exec(compile(code, SCRIPT, "exec"), ns)

build_output = ns["build_output"]
_merge_with_existing = ns["_merge_with_existing"]
fetch_all_feeds = ns["fetch_all_feeds"]
keyword_classify = ns["keyword_classify"]


def main():
    print("=" * 60)
    print("  Aggregation Test")
    print("=" * 60)

    # Step 1: Fetch + classify all
    print("\nStep 1: Fetching and classifying all articles...")
    all_articles = fetch_all_feeds()
    if not all_articles:
        print("No articles, aborting.")
        return
    all_classes = keyword_classify(all_articles)
    print(f"  {len(all_articles)} articles, {len(all_classes)} classified")

    # Step 2: Split by 1h cutoff
    print("\nStep 2: Splitting by 1h cutoff...")
    now = datetime.now(timezone.utc)
    cutoff = now.timestamp() - 3600
    old_a, new_a, old_c, new_c = [], [], [], []
    for a, c in zip(all_articles, all_classes):
        try:
            dt = datetime.fromisoformat(a["date"]).replace(tzinfo=timezone.utc)
            if dt.timestamp() >= cutoff:
                new_a.append(a); new_c.append(c)
            else:
                old_a.append(a); old_c.append(c)
        except Exception:
            old_a.append(a); old_c.append(c)
    print(f"  Old: {len(old_a)}, New: {len(new_a)}")

    if not new_a:
        print("  SKIP: No articles in last hour.")
        return

    # Step 3: Build daily from old
    print("\nStep 3: Building daily from old articles...")
    old_data = build_output(old_a, old_c)
    print(f"  {len(old_data['solutions'])} solutions")

    # Step 4: Build fast from new
    print("\nStep 4: Building fast from new articles...")
    new_data = build_output(new_a, new_c)
    print(f"  {len(new_data['solutions'])} solutions")

    # Step 5: Merge
    print("\nStep 5: Merging new into old...")
    merged = _merge_with_existing(new_data, old_data)
    print(f"  {len(merged['solutions'])} solutions")

    # Step 6: Build full baseline
    print("\nStep 6: Building full baseline...")
    full = build_output(all_articles, all_classes)

    # ─── TESTS ───
    print("\n" + "=" * 60)
    print("  Running Tests")
    print("=" * 60)
    errors = []

    # Test 1: No duplicate events within any solution
    print("\n  Test 1: No duplicate events...")
    for s in merged["solutions"]:
        texts = [e["text"] for e in s["events"]]
        if len(texts) != len(set(texts)):
            errors.append(f"    {s['id']}: {len(texts) - len(set(texts))} duplicate events")
    if not errors:
        print("    PASS: No duplicates")

    # Test 2: All events from old + new are present (union, deduplicated)
    print("\n  Test 2: Event completeness...")
    full_events = {e["text"] for s in full["solutions"] for e in s["events"]}
    merged_events = {e["text"] for s in merged["solutions"] for e in s["events"]}

    # Only check events that are in top-8 of both
    merged_ids = {s["id"] for s in merged["solutions"]}
    full_ids = {s["id"] for s in full["solutions"]}
    common_ids = merged_ids & full_ids

    for sid in common_ids:
        m_events = {e["text"] for s in merged["solutions"] if s["id"] == sid for e in s["events"]}
        f_events = {e["text"] for s in full["solutions"] if s["id"] == sid for e in s["events"]}
        missing = f_events - m_events
        extra = m_events - f_events
        if missing:
            errors.append(f"    {sid}: {len(missing)} events missing in merged")
        if extra:
            errors.append(f"    {sid}: {len(extra)} events extra in merged")
    if not errors:
        print("    PASS: All events present in common categories")

    # Test 3: Phase and direction match for common categories
    print("\n  Test 3: Phase and direction consistency...")
    ms = {s["id"]: s for s in merged["solutions"]}
    fs = {s["id"]: s for s in full["solutions"]}
    for sid in common_ids:
        if ms[sid]["phaseIndex"] != fs[sid]["phaseIndex"]:
            errors.append(f"    {sid}: phase merged={ms[sid]['phaseIndex']} full={fs[sid]['phaseIndex']}")
        if ms[sid]["direction"] != fs[sid]["direction"]:
            errors.append(f"    {sid}: direction merged={ms[sid]['direction']} full={fs[sid]['direction']}")
    if not errors:
        print("    PASS: Phases and directions match")

    # Test 4: Top-8 is correct (sorted by event count desc)
    print("\n  Test 4: Top-8 sort order...")
    counts = [len(s["events"]) for s in merged["solutions"]]
    if counts == sorted(counts, reverse=True):
        print("    PASS: Solutions sorted by event count desc")
    else:
        errors.append("    Solutions not sorted by event count")

    # Summary
    print(f"\n  Merged: {len(merged['solutions'])} solutions, "
          f"{sum(len(s['events']) for s in merged['solutions'])} events")
    print(f"  Full:   {len(full['solutions'])} solutions, "
          f"{sum(len(s['events']) for s in full['solutions'])} events")

    # Show category comparison
    print(f"\n  Category overlap: {len(common_ids)}/{len(merged_ids)} merged, {len(common_ids)}/{len(full_ids)} full")
    only_merged = merged_ids - full_ids
    only_full = full_ids - merged_ids
    if only_merged:
        print(f"    Only in merged: {only_merged}")
    if only_full:
        print(f"    Only in full:   {only_full}")

    if errors:
        print(f"\n  FAIL: {len(errors)} issues:")
        for e in errors:
            print(e)
        sys.exit(1)
    else:
        print("\n  ALL TESTS PASSED!")


if __name__ == "__main__":
    main()
