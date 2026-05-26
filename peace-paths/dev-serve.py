#!/usr/bin/env python3
"""
Local dev server that serves the Peace Room app with AI-generated data.
Includes an endpoint to trigger the AI pipeline from the browser.

Usage:
    python dev-serve.py          # serve from app/peace-room/
    python dev-serve.py --port 8766
"""
import argparse
import http.server
import json
import os
import sys
import subprocess
import threading
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).parent.parent
APP_DIR = PROJECT_ROOT / "app" / "peace-room"
DATA_FILE = APP_DIR / "solutions.json"
DATA_JSON = APP_DIR / "data.json"
SCRIPT = PROJECT_ROOT / "peace-paths" / "ai-analyze-prod.py"

# Track analysis job state
analysis_job = None
analysis_status = {"running": False, "pid": None, "started": None, "log": ""}


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


def run_analysis(mode="--fast"):
    """Run ai-analyze-prod.py in the background."""
    global analysis_status
    env = os.environ.copy()
    env.setdefault("LLAMA_CPP_URL", "http://192.168.2.121:8080")
    cmd = [sys.executable, str(SCRIPT), mode]
    print(f"\n  [Analysis] Starting: {' '.join(cmd)}")
    log_lines = []
    try:
        proc = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        analysis_status = {"running": True, "pid": proc.pid, "started": str(datetime.now()), "log": ""}
        for line in proc.stdout:
            text = line.rstrip()
            log_lines.append(text)
            print(f"  [Analysis] {text}")
            analysis_status["log"] = "\n".join(log_lines)
        proc.wait()
        analysis_status["running"] = False
        analysis_status["log"] = "\n".join(log_lines)
        print(f"\n  [Analysis] Done (exit code {proc.returncode})")
        # Sync data so frontend picks it up
        sync_data()
    except Exception as e:
        analysis_status["running"] = False
        analysis_status["log"] = str(e)
        print(f"  [Analysis] Error: {e}")


class DevHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/analysis/status":
            self._json_response(analysis_status)
        elif self.path == "/api/analysis/run":
            mode = self.path.split("?")[1].split("=")[-1] if "?" in self.path else "--fast"
            if analysis_status["running"]:
                self._json_response({"error": "analysis already running"})
            else:
                t = threading.Thread(target=run_analysis, args=(mode,), daemon=True)
                t.start()
                self._json_response({"message": f"analysis started (mode={mode})"})
        else:
            super().do_GET()

    def _json_response(self, data):
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--no-sync", action="store_true", help="Don't sync data.json")
    args = parser.parse_args()

    if not args.no_sync:
        if not sync_data():
            sys.exit(1)

    # Show data source info
    data = json.loads(DATA_JSON.read_text(encoding="utf-8"))
    sample = data.get("solutions", [{}])[0].get("events", [])
    if sample and sample[0].get("ai_risk") == 5 and sample[0].get("ai_risk") is not None:
        print("  [WARNING]: Data is from KEYWORD FALLBACK (llama server unavailable)")

    print(f"\n  Serving Peace Room on http://localhost:{args.port}")
    print(f"  App dir: {APP_DIR}")
    print(f"  API: /api/analysis/run?mode=--fast  (trigger AI pipeline)")
    print(f"  Press Ctrl+C to stop\n")

    os.chdir(APP_DIR)
    try:
        with http.server.HTTPServer(("", args.port), DevHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")


if __name__ == "__main__":
    main()
