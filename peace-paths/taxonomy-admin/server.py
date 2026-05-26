#!/usr/bin/env python3
"""
Taxonomy Admin Server
=====================
Serves the taxonomy admin UI and provides API endpoints for:
- Loading article counts per category
- Saving taxonomy.json
- Deploying (AI re-classify + upload)

Run: python server.py
Defaults to http://localhost:8777
"""

import http.server
import json
import os
import subprocess
import sys
import threading
from urllib.parse import urlparse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
TAXONOMY_FILE = os.path.join(PROJECT_DIR, "taxonomy.json")
ANALYZER = os.path.join(PROJECT_DIR, "ai-analyze-prod.py")

PORT = int(os.environ.get("TAXONOMY_PORT", "8777"))

class TaxonomyHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress logs

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/api/status':
            self._respond({"taxonomyExists": os.path.exists(TAXONOMY_FILE), "analyzerExists": os.path.exists(ANALYZER)})
            return

        # Serve static files
        if path == '/' or path == '/index.html':
            filepath = os.path.join(SCRIPT_DIR, "index.html")
        elif path.startswith('/'):
            filepath = os.path.join(SCRIPT_DIR, path.lstrip('/'))
        else:
            self.send_error(404)
            return

        if os.path.isfile(filepath):
            try:
                with open(filepath, 'rb') as f:
                    data = f.read()
                ext = os.path.splitext(filepath)[1]
                ct = {"html": "text/html", "css": "text/css", "js": "application/javascript", "json": "application/json"}.get(ext, "application/octet-stream")
                self.send_response(200)
                self.send_header("Content-Type", f"{ct}; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                self.send_error(500, str(e))
        else:
            self.send_error(404, f"Not found: {path}")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length else b""

        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            data = {}

        if path == '/api/articles':
            self._handle_articles(data)
        elif path == '/api/save':
            self._handle_save(data)
        elif path == '/api/deploy':
            self._handle_deploy(data)
        else:
            self.send_error(404)

    def _handle_articles(self, data):
        """Fetch RSS articles and assign them to categories using keyword fallback.
        Returns article counts per category without full AI classification.
        """
        try:
            # Import and run the RSS fetcher + keyword classifier from ai-analyze-prod
            sys.path.insert(0, PROJECT_DIR)
            import importlib.util
            spec = importlib.util.spec_from_file_location("analyzer", ANALYZER)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)

            articles = mod.fetch_all_feeds(age_hours=None)
            if not articles:
                self._respond({"error": "No articles fetched", "assignments": {}})
                return

            # Use keyword fallback for quick counts (no AI needed)
            classifications = mod.keyword_classify(articles)

            assignments = {}
            for i, cls in enumerate(classifications):
                assignments[str(i + 1)] = cls.get("solution", "unclassified")

            self._respond({"articles": len(articles), "assignments": assignments})
        except Exception as e:
            self._respond({"error": str(e), "assignments": {}})

    def _handle_save(self, data):
        """Save taxonomy.json from the admin UI."""
        categories = data.get("categories", [])
        if not categories:
            self._respond({"error": "No categories provided"})
            return

        try:
            taxonomy_data = {
                "categories": categories,
                "assignments": data.get("assignments", {})
            }
            with open(TAXONOMY_FILE, "w", encoding="utf-8") as f:
                json.dump(taxonomy_data, f, indent=2, ensure_ascii=False)
            self._respond({"ok": True, "categories": len(categories)})
        except Exception as e:
            self._respond({"error": str(e)})

    def _handle_deploy(self, data):
        """Run ai-analyze-prod.py with --use-taxonomy and deploy."""
        if not os.path.exists(TAXONOMY_FILE):
            self._respond({"error": "taxonomy.json not found. Save first."})
            return

        mode = data.get("mode", "daily")
        try:
            cmd = [sys.executable, ANALYZER, "--use-taxonomy", TAXONOMY_FILE, f"--{mode}"]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=600, cwd=PROJECT_DIR)

            if result.returncode != 0:
                self._respond({"error": result.stderr[-500:], "output": result.stdout[-500:]})
                return

            # Parse output for summary
            output = result.stdout
            lines = output.split('\n')
            articles_count = 0
            categories_count = 0
            for line in lines:
                if "articles" in line and "->" in line:
                    parts = line.split("->")
                    if len(parts) >= 2:
                        articles_count = int(parts[0].strip().split()[-1])
                        categories_count = int(parts[1].strip().split()[-1])

            self._respond({
                "ok": True,
                "articles": articles_count,
                "categories": categories_count,
                "summary": output[-300:]
            })
        except subprocess.TimeoutExpired:
            self._respond({"error": "Deployment timed out (>10 min)"})
        except Exception as e:
            self._respond({"error": str(e)})

    def _respond(self, data):
        body = json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)


def main():
    server = http.server.HTTPServer(("0.0.0.0", PORT), TaxonomyHandler)
    print(f"Taxonomy Admin running at http://localhost:{PORT}")
    print(f"  UI: http://localhost:{PORT}")
    print(f"  API: POST /api/save, /api/deploy, /api/articles")
    print(f"  Press Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.shutdown()


if __name__ == "__main__":
    main()
