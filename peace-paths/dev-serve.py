#!/usr/bin/env python3
"""
Local dev server that serves the Peace Room app with AI-generated data.

Usage:
    python dev-serve.py          # serve from app/peace-room/
    python dev-serve.py --data PATH  # serve with custom solutions.json

Serves the app from app/peace-room/ and creates a data.json that
points to the latest solutions.json from the AI pipeline.
"""
import argparse
import http.server
import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
APP_DIR = PROJECT_ROOT / "app" / "peace-room"
DATA_FILE = APP_DIR / "solutions.json"
DATA_JSON = APP_DIR / "data.json"


def sync_data():
    """Copy solutions.json -> data.json so the frontend loads AI data."""
    if not DATA_FILE.exists():
        print(f"  ! {DATA_FILE} not found — run ai-analyze-prod.py first")
        return False
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    DATA_JSON.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"  synced {DATA_FILE} -> {DATA_JSON}")
    print(f"  {len(data.get('solutions', []))} solutions, "
          f"{sum(len(s.get('events', [])) for s in data.get('solutions', []))} events")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-sync", action="store_true", help="Don't sync data.json")
    args = parser.parse_args()

    if not args.no_sync:
        if not sync_data():
            sys.exit(1)

    print(f"\n  Serving Peace Room on http://localhost:{args.port}")
    print(f"  App dir: {APP_DIR}")
    print(f"  Press Ctrl+C to stop\n")

    os.chdir(APP_DIR)
    handler = http.server.SimpleHTTPRequestHandler
    try:
        with http.server.HTTPServer(("", args.port), handler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")


if __name__ == "__main__":
    main()
