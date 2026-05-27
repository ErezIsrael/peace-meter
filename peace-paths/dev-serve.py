#!/usr/bin/env python3
"""
Local dev server for Peace Meter.
Serves the Peace Room app from app/peace-room/ and the Admin panel.

Usage:
    python dev-serve.py          # default port 8766
    python dev-serve.py --port 8766

Admin panel: http://localhost:8766/admin/
"""
import argparse
import http.server
import json
import os
import string
import re
import sys
import subprocess
import threading
import time
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
APP_DIR = PROJECT_ROOT / "app" / "peace-room"
ADMIN_DIR = PROJECT_ROOT / "peace-paths" / "admin"
DATA_FILE = APP_DIR / "solutions.json"
LIVE_DATA_JSON = APP_DIR / "data.json"  # deployed to Cloudflare via /peace-room/data.json
TEST_DATA_JSON = APP_DIR / "test-data.json"  # local dev only
SOLUTIONS_JSON = PROJECT_ROOT / "peace-paths" / "solutions.json"
SCRIPT = PROJECT_ROOT / "peace-paths" / "ai-analyze-prod.py"
TAXONOMY_FILE = PROJECT_ROOT / "peace-paths" / "taxonomy.json"

# Track analysis job state
analysis_status = {"running": False, "pid": None, "started": None, "log": "", "proc": None}


def sync_data():
    """Copy solutions.json -> data.json and test-data.json.

    NOTE: Admin panel is NOT synced to APP_DIR — it is served directly from
    ADMIN_DIR by the dev server only. This keeps it out of Cloudflare Pages deploys.

    Skips sync if data.json was recently deployed (has activeSolutions key).
    """
    if not DATA_FILE.exists():
        print(f"  ! {DATA_FILE} not found")
        return False
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))

    # Sync to live data.json (skip if deployed)
    if LIVE_DATA_JSON.exists():
        try:
            existing = json.loads(LIVE_DATA_JSON.read_text(encoding="utf-8"))
            if "activeSolutions" in existing:
                print(f"  skipping sync — {LIVE_DATA_JSON} was deployed")
        except Exception:
            LIVE_DATA_JSON.write_text(json.dumps(data, indent=2), encoding="utf-8")
            print(f"  synced {DATA_FILE} -> {LIVE_DATA_JSON}")
    else:
        LIVE_DATA_JSON.write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(f"  synced {DATA_FILE} -> {LIVE_DATA_JSON}")

    # Sync to test-data.json, merging with deployed test categories
    if TEST_DATA_JSON.exists():
        try:
            test_existing = json.loads(TEST_DATA_JSON.read_text(encoding="utf-8"))
            test_map = {s["id"]: s for s in test_existing.get("solutions", [])}
            new_map = {s["id"]: s for s in data.get("solutions", [])}
            # Merge: analysis data from solutions.json overrides test data,
            # but test-only categories (from taxonomy deploy) are preserved
            for tid, tsol in test_map.items():
                if tid in new_map:
                    # Merge analysis data into test category
                    for k in ("phaseIndex", "direction", "keyMetric", "summary", "events"):
                        if new_map[tid].get(k):
                            test_map[tid][k] = new_map[tid][k]
            # Add any new solutions from analysis not in test
            for nid, nsol in new_map.items():
                if nid not in test_map:
                    test_map[nid] = nsol
            test_data = {
                "solutions": list(test_map.values()),
                "activeSolutions": list(test_map.keys()),
                "overallMomentum": data.get("overallMomentum", {}),
                "lastUpdated": data.get("lastUpdated", ""),
                "source": data.get("source", ""),
                "feedCount": data.get("feedCount", 0),
            }
            TEST_DATA_JSON.write_text(json.dumps(test_data, indent=2, ensure_ascii=False), encoding="utf-8")
            print(f"  synced {DATA_FILE} -> {TEST_DATA_JSON} ({len(test_map)} solutions)")
        except Exception:
            TEST_DATA_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    else:
        TEST_DATA_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"  {len(data.get('solutions', []))} solutions, "
          f"{sum(len(s.get('events', [])) for s in data.get('solutions', []))} events")
    return True


def run_analysis(mode="--fast"):
    """Run ai-analyze-prod.py in the background."""
    global analysis_status
    env = os.environ.copy()
    env.setdefault("LLAMA_CPP_URL", "http://192.168.2.121:8080")
    cmd = [sys.executable, str(SCRIPT), mode]
    log_lines = []
    try:
        print(f"\n  [Analysis] Starting: {' '.join(cmd)}")
        proc = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        analysis_status = {"running": True, "pid": proc.pid, "started": str(datetime.now()), "log": "", "proc": proc}
        # Hard timeout: 30 minutes — kill if analysis hangs
        TIMEOUT = 30 * 60
        deadline = time.time() + TIMEOUT
        # Read raw bytes and decode as UTF-8 to avoid surrogate issues
        for raw_line in iter(proc.stdout.readline, b""):
            if time.time() > deadline:
                print(f"\n  [Analysis] TIMEOUT after {TIMEOUT}s, killing PID {proc.pid}")
                proc.kill()
                break
            text = raw_line.decode("utf-8", errors="replace").rstrip()
            log_lines.append(text)
            print(f"  [Analysis] {text}")
            analysis_status["log"] = "\n".join(log_lines)
        proc.wait()
        analysis_status["running"] = False
        analysis_status["log"] = "\n".join(log_lines)
        print(f"\n  [Analysis] Done (exit code {proc.returncode})")
        sync_data()
    except Exception as e:
        analysis_status["running"] = False
        analysis_status["log"] = "\n".join(log_lines) + f"\nError: {e}"
        print(f"  [Analysis] Error: {e}")


def infer_keywords(name, description):
    """Generate keyword candidates from a category's name and description."""
    text = (name + " " + description).lower()
    words = text.split()
    # Filter to meaningful words >= 3 chars, skip common stop words
    stops = {"the","and","for","are","but","not","all","with","its","from","this","that",
             "new","also","including","reports","across","various","between","ongoing",
             "efforts","role","potential","growing","increasing","impact","issues",
             "related","both","while","over","under","into","after","before","upon",
             "covering","articles"}
    seen = set()
    result = []
    for w in words:
        clean = w.strip(string.punctuation)
        if len(clean) >= 3 and clean not in stops and clean not in seen:
            seen.add(clean)
            result.append(clean)
    return result

def load_taxonomy():
    """Load AI-proposed categories from taxonomy.json."""
    if not TAXONOMY_FILE.exists():
        return []
    data = json.loads(TAXONOMY_FILE.read_text(encoding="utf-8"))
    result = []
    for cat in data.get("categories", []):
        kws = cat.get("keywords") or infer_keywords(cat["name"], cat.get("description", ""))
        result.append({
            "id": cat["id"],
            "icon": cat.get("icon", "📊"),
            "name": cat["name"],
            "description": cat.get("description", ""),
            "phases": cat.get("phases") or ["Emerged", "Developing", "Gaining Traction", "Maturing", "Resolved"],
            "keywords": kws,
        })
    return result


def decode_icon(raw):
    """Decode Python unicode escape sequences in icon strings."""
    BACKSLASH = chr(92)
    if not raw:
        return "\U0001f4cc"
    # Check if it contains Python escape sequences (literal backslash-U or backslash-u)
    if (BACKSLASH + "U") in raw or (BACKSLASH + "u") in raw:
        result = raw
        # Manual replacement of \uXXXX
        tag_u = BACKSLASH + "u"
        while tag_u in result:
            idx = result.index(tag_u)
            hex_str = result[idx + 2:idx + 6]
            if len(hex_str) == 4 and all(c in '0123456789abcdefABCDEF' for c in hex_str):
                result = result[:idx] + chr(int(hex_str, 16)) + result[idx + 6:]
            else:
                break  # not a valid \uXXXX, stop
        # Manual replacement of \UXXXXXXXX
        tag_U = BACKSLASH + "U"
        while tag_U in result:
            idx = result.index(tag_U)
            hex_str = result[idx + 2:idx + 10]
            if len(hex_str) == 8 and all(c in '0123456789abcdefABCDEF' for c in hex_str):
                result = result[:idx] + chr(int(hex_str, 16)) + result[idx + 10:]
            else:
                break
        return result
    # Already real unicode characters — return as-is
    return raw


def parse_script_categories():
    """Extract SOLUTIONS and KEYWORD_MAP from ai-analyze-prod.py by reading and parsing the dicts."""
    script = SCRIPT.read_text(encoding="utf-8")


    # Extract SOLUTIONS dict
    sol_match = re.search(r'SOLUTIONS\s*=\s*\{(.*?)\n\}', script, re.DOTALL)
    solutions = {}
    if sol_match:
        sol_block = sol_match.group(1)
        # Parse each category block
        for m in re.finditer(r'"([\w-]+)"\s*:\s*\{([^}]+)\}', sol_block, re.DOTALL):
            cat_id = m.group(1)
            block = m.group(2)
            icon = re.search(r'"icon"\s*:\s*"([^"]+)"', block)
            name = re.search(r'"name"\s*:\s*"([^"]+)"', block)
            phases = re.search(r'"phases"\s*:\s*\[([^\]]+)\]', block)
            desc = re.search(r'"description"\s*:\s*"([^"]+)"', block)
            solutions[cat_id] = {
                "id": cat_id,
                "icon": decode_icon(icon.group(1)) if icon else "\U0001f4cc",
                "name": name.group(1) if name else cat_id,
                "phases": [p.strip().strip('"\'') for p in phases.group(1).split(',')] if phases else [],
                "description": desc.group(1) if desc else "",
                "keywords": [],
            }

    # Extract KEYWORD_MAP
    kw_match = re.search(r'KEYWORD_MAP\s*=\s*\{(.*?)\n\}', script, re.DOTALL)
    if kw_match:
        kw_block = kw_match.group(1)
        for m in re.finditer(r'"([\w-]+)"\s*:\s*\[([^\]]+)\]', kw_block):
            cat_id = m.group(1)
            kws = [decode_icon(k.strip().strip('"\'')) for k in m.group(2).split(',')]
            if cat_id in solutions:
                solutions[cat_id]["keywords"] = kws


    return list(solutions.values())


def encode_icon_for_python(icon):
    """Encode an emoji/icon for safe writing into Python source code."""
    BACKSLASH = chr(92)
    result = []
    for ch in icon:
        cp = ord(ch)
        if cp < 128:
            result.append(ch)
        elif cp < 0x10000:
            result.append(BACKSLASH + f"u{cp:04x}")
        else:
            result.append(BACKSLASH + f"U{cp:08x}")
    return ''.join(result)


def write_script_categories(categories):
    """Reconstruct SOLUTIONS and KEYWORD_MAP dicts and patch ai-analyze-prod.py."""
    text = SCRIPT.read_text(encoding="utf-8")

    # Build SOLUTIONS dict string
    sol_parts = []
    for c in categories:
        phases_json = json.dumps(c.get("phases", []), ensure_ascii=False)
        icon_safe = encode_icon_for_python(c.get("icon", "\U0001f4cc"))
        sol_parts.append(
            f'    "{c["id"]}": {{\n'
            f'        "icon": "{icon_safe}", "name": "{c["name"]}",\n'
            f'        "phases": {phases_json},\n'
            f'        "description": "{c["description"]}",\n'
            f'    }},'
        )
    new_sol = "SOLUTIONS = {\n" + "\n".join(sol_parts) + "\n}\n"

    # Build KEYWORD_MAP dict string
    kw_parts = []
    for c in categories:
        kws = c.get("keywords", [])
        if kws:
            # Decode Python unicode escapes in keywords (e.g. \u00fc -> ü)
            clean_kws = []
            for k in kws:
                decoded = decode_icon(k)  # reuse decode_icon for \u/\U escapes
                clean_kws.append(decoded)
            kw_json = json.dumps(clean_kws, ensure_ascii=False)
            kw_parts.append(f'    "{c["id"]}": {kw_json},')
    new_kw = "KEYWORD_MAP = {\n" + "\n".join(kw_parts) + "\n}"

    # Patch SOLUTIONS — find the match and replace manually (avoid re.sub \U escape issues)
    m = re.search(r'SOLUTIONS\s*=\s*\{.*?\n\}', text, flags=re.DOTALL)
    if m:
        text = text[:m.start()] + new_sol + text[m.end():]
    # Patch KEYWORD_MAP
    m2 = re.search(r'KEYWORD_MAP\s*=\s*\{.*?\n\}', text, flags=re.DOTALL)
    if m2:
        text = text[:m2.start()] + new_kw + text[m2.end():]

    SCRIPT.write_text(text, encoding="utf-8")
    print(f"  [Admin] Wrote {len(categories)} categories to ai-analyze-prod.py")


class DevHandler(http.server.BaseHTTPRequestHandler):
    MIMES = {
        '.html': 'text/html', '.js': 'application/javascript',
        '.css': 'text/css', '.json': 'application/json',
        '.png': 'image/png', '.svg': 'image/svg+xml',
    }

    def do_GET(self):
        # Admin API
        if self.path == "/api/admin/categories":

            cats = parse_script_categories()
            self._json_response(cats)
            return
        if self.path == "/api/admin/taxonomy":
            cats = load_taxonomy()
            self._json_response(cats)
            return
        if self.path == "/api/analysis/status":
            # Strip proc object before serializing
            status = {k: v for k, v in analysis_status.items() if k != "proc"}
            self._json_response(status)
            return
        if self.path.startswith("/api/analysis/run"):
            mode = self.path.split("mode=")[1] if "mode=" in self.path else "--fast"
            # If previous process died but flag is still set, reset
            if analysis_status["running"]:
                proc = analysis_status.get("proc")
                if proc and proc.poll() is not None:
                    analysis_status["running"] = False
            if analysis_status["running"]:
                self._json_response({"error": "analysis already running"})
            else:
                t = threading.Thread(target=run_analysis, args=(mode,), daemon=True)
                t.start()
                self._json_response({"message": f"analysis started (mode={mode})"})
            return

        # Admin page — serve directly from ADMIN_DIR (local only, never deployed)
        if self.path.startswith("/admin"):
            self._serve_admin(self.path)
            return

        # favicon.ico — suppress browser request
        if self.path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return

        # Static files from APP_DIR
        self._serve_static(self.path)

    def log_message(self, format, *args):
        # Print all requests for debugging
        print(f"  [HTTP] {args[0]}")

    def _serve_admin(self, path):
        """Serve admin files directly from ADMIN_DIR (local dev only)."""
        path = path.split('?')[0]
        if path == '/admin' or path == '/admin/':
            path = '/index.html'
        fpath = ADMIN_DIR / path.removeprefix('/admin').lstrip('/')
        if fpath.is_file():
            ext = fpath.suffix
            ct = self.MIMES.get(ext, 'application/octet-stream')
            body = fpath.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', ct)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404, f"Not found: {path}")

    def _serve_static(self, path):
        # Strip query string
        path = path.split('?')[0]
        # Map '/' or directory paths to index.html
        if path == '/':
            path = '/index.html'
        # Serve test-data.json as /data.json so the local app reads test data
        if path == '/data.json' and TEST_DATA_JSON.exists():
            fpath = TEST_DATA_JSON
        else:
            fpath = APP_DIR / path.removeprefix('/')
        if fpath.is_dir():
            fpath = fpath / 'index.html'
        if not fpath.is_file():
            # Fallback: fonts live under PROJECT_ROOT/app/fonts/
            if path.startswith('/fonts/'):
                fpath = PROJECT_ROOT / 'app' / 'fonts' / path.removeprefix('/fonts/').lstrip('/')
            elif path.startswith('/app/'):
                fpath = PROJECT_ROOT / path.removeprefix('/')
        if not fpath.is_file():
            # Fallback: top-level files (index.html, styles.css, app.js)
            fpath = PROJECT_ROOT / 'peace-paths' / path.removeprefix('/')
        if fpath.is_file():
            ext = fpath.suffix
            ct = self.MIMES.get(ext, 'application/octet-stream')
            body = fpath.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', ct)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404, f"Not found: {path}")

    def do_POST(self):
        if self.path == "/api/analysis/cancel":
            proc = analysis_status.get("proc")
            if proc and proc.poll() is None:
                proc.kill()
                analysis_status["running"] = False
                analysis_status["log"] += "\n[Cancelled by user]"
                self._json_response({"ok": True, "message": "Analysis cancelled"})
            else:
                analysis_status["running"] = False
                self._json_response({"ok": True, "message": "No analysis running"})
            return
        if self.path == "/api/admin/categories":
            data = self._read_json()
            parse_script_categories()  # validate readability
            try:
                categories = parse_script_categories()
                # Check for duplicate ID
                if any(c["id"] == data["id"] for c in categories):
                    self._json_error(f"Category '{data['id']}' already exists")
                    return
                categories.append(data)
                write_script_categories(categories)
                self._json_response({"ok": True})
            except Exception as e:
                print(f"  [ERROR] POST /api/admin/categories: {e}", flush=True)
                self._json_error(str(e))
            return
        if self.path == "/api/admin/categories/bulk-import":
            data = self._read_json()
            try:
                existing = parse_script_categories()
                existing_ids = {c["id"] for c in existing}
                imported = []
                for cat in data.get("categories", []):
                    if cat["id"] not in existing_ids:
                        existing.append(cat)
                        existing_ids.add(cat["id"])
                        imported.append(cat["id"])
                if imported:
                    write_script_categories(existing)
                self._json_response({"ok": True, "imported": imported})
            except Exception as e:
                self._json_error(str(e))
            return
        if self.path == "/api/admin/deploy":
            data = self._read_json()
            target = data.get("target", "")  # 'test' or 'live'
            selected = data.get("selected")  # list of IDs, or None for all
            try:
                result = deploy_categories(target, selected_ids=selected)
                self._json_response(result)
            except Exception as e:
                self._json_error(str(e))
            return
        if self.path == "/api/admin/categories/bulk-delete":
            data = self._read_json()
            ids = data.get("ids", [])
            try:
                categories = parse_script_categories()
                before = len(categories)
                categories = [c for c in categories if c["id"] not in set(ids)]
                deleted = before - len(categories)
                write_script_categories(categories)
                self._json_response({"ok": True, "deleted": deleted, "ids": ids})
            except Exception as e:
                self._json_error(str(e))
            return
        if self.path == "/api/admin/taxonomy/bulk-delete":
            data = self._read_json()
            ids = data.get("ids", [])
            try:
                raw = json.loads(TAXONOMY_FILE.read_text(encoding="utf-8"))
                cats = raw.get("categories", [])
                before = len(cats)
                cats = [c for c in cats if c["id"] not in set(ids)]
                deleted = before - len(cats)
                raw["categories"] = cats
                TAXONOMY_FILE.write_text(json.dumps(raw, indent=2, ensure_ascii=False), encoding="utf-8")
                self._json_response({"ok": True, "deleted": deleted, "ids": ids})
            except Exception as e:
                self._json_error(str(e))
            return
        if self.path == "/api/admin/categories/move":
            data = self._read_json()
            cat_id = data.get("id")
            try:
                tax = load_taxonomy()
                tax_cat = next((c for c in tax if c["id"] == cat_id), None)
                if not tax_cat:
                    self._json_error(f"Taxonomy category '{cat_id}' not found")
                    return
                existing = parse_script_categories()
                if any(c["id"] == cat_id for c in existing):
                    self._json_error(f"Category '{cat_id}' already exists in SOLUTIONS")
                    return
                # Taxonomy categories lack phases/keywords — add defaults
                tax_cat["phases"] = tax_cat.get("phases") or ["Emerged", "Developing", "Gaining Traction", "Maturing", "Resolved"]
                tax_cat["keywords"] = tax_cat.get("keywords") or []
                existing.append(tax_cat)
                write_script_categories(existing)
                self._json_response({"ok": True, "imported": cat_id})
            except Exception as e:
                self._json_error(str(e))
            return
        self._json_error("Not found")

    def do_PUT(self):
        if self.path.startswith("/api/admin/categories/"):
            cat_id = self.path.split("/")[-1]
            data = self._read_json()
            data["id"] = cat_id  # ensure ID matches URL
            try:
                categories = parse_script_categories()
                for i, c in enumerate(categories):
                    if c["id"] == cat_id:
                        categories[i] = data
                        break
                else:
                    self._json_error(f"Category '{cat_id}' not found")
                    return
                write_script_categories(categories)
                self._json_response({"ok": True})
            except Exception as e:
                self._json_error(str(e))
            return
        self._json_error("Not found")

    def do_DELETE(self):
        if self.path.startswith("/api/admin/categories/"):
            cat_id = self.path.split("/")[-1]
            try:
                categories = parse_script_categories()
                categories = [c for c in categories if c["id"] != cat_id]
                write_script_categories(categories)
                self._json_response({"ok": True})
            except Exception as e:
                self._json_error(str(e))
            return
        self._json_error("Not found")

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length))

    def _json_response(self, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json_error(self, msg, code=400):
        self._json_response({"error": msg})




def deploy_categories(target, selected_ids=None):
    """Deploy selected (or all) categories to test or live environment.

    Handles both current SOLUTIONS categories and taxonomy-suggested categories.
    Suggested categories that are selected will be included directly from taxonomy.

    target: 'test' -> writes to test-data.json (local dev only)
    target: 'live' -> writes to data.json (deployed to Cloudflare)
    selected_ids: if provided, only deploy those categories; otherwise deploy all.
    """
    dest = TEST_DATA_JSON if target == "test" else LIVE_DATA_JSON
    current_cats = parse_script_categories()
    taxonomy_cats = load_taxonomy()
    current_ids = {c["id"] for c in current_cats}

    if selected_ids:
        sel_set = set(selected_ids)
        # Gather current categories that are selected
        categories = [c for c in current_cats if c["id"] in sel_set]
        # Identify taxonomy-suggested categories to import into SOLUTIONS
        suggested_to_import = []
        for tc in taxonomy_cats:
            if tc["id"] in sel_set and tc["id"] not in current_ids:
                suggested_to_import.append(tc)
                categories.append(tc)
        # Auto-import suggested categories into ai-analyze-prod.py so analysis works
        if suggested_to_import:
            current_cats.extend(suggested_to_import)
            write_script_categories(current_cats)
    else:
        categories = current_cats
    # Build solutions.json structure
    # Load existing analysis data to preserve keyMetric, summary, events, etc.
    # solutions.json (latest analysis) takes priority over the target data.json
    existing_solutions = {}
    for fpath in (SOLUTIONS_JSON, dest):
        if fpath.exists():
            try:
                existing = json.loads(fpath.read_text(encoding="utf-8"))
                for s in existing.get("solutions", []):
                    eid = s["id"]
                    if eid in existing_solutions:
                        # Merge: only fill in missing keys from data.json
                        for k in ("keyMetric", "summary", "events", "phaseIndex", "direction"):
                            if k not in existing_solutions[eid] or not existing_solutions[eid][k]:
                                if k in s and s[k]:
                                    existing_solutions[eid][k] = s[k]
                    else:
                        existing_solutions[eid] = s
            except Exception:
                pass

    solutions = []
    default_metric = {"label": "Events (7d)", "value": "0"}
    for c in categories:
        existing = existing_solutions.get(c["id"], {})
        solutions.append({
            "id": c["id"],
            "icon": c["icon"],
            "name": c["name"],
            "description": c["description"],
            "phases": c.get("phases", []),
            "keywords": c.get("keywords", []),
            "phaseIndex": existing.get("phaseIndex", 0),
            "direction": existing.get("direction", "unknown"),
            "keyMetric": existing.get("keyMetric") or default_metric,
            "summary": existing.get("summary", ""),
            "events": existing.get("events", []),
        })
    # Preserve overallMomentum, lastUpdated from solutions.json
    meta = {}
    if SOLUTIONS_JSON.exists():
        try:
            meta = json.loads(SOLUTIONS_JSON.read_text(encoding="utf-8"))
        except Exception:
            pass

    data = {
        "solutions": solutions,
        "activeSolutions": [s["id"] for s in solutions],
        "overallMomentum": meta.get("overallMomentum", {}),
        "lastUpdated": meta.get("lastUpdated", ""),
        "source": meta.get("source", ""),
        "feedCount": meta.get("feedCount", 0),
    }
    dest.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    imported = len([c for c in categories if c["id"] not in current_ids])
    print(f"  [Deploy] Wrote {len(solutions)} categories to {dest} ({target}) (imported {imported} from taxonomy)")
    return {"ok": True, "deployed": len(solutions), "imported": imported, "target": target}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--no-sync", action="store_true")
    args = parser.parse_args()

    # Fix Windows console encoding
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8")

    if not args.no_sync:
        if not sync_data():
            sys.exit(1)

    # Reset analysis state on startup (zombie processes from previous run)
    analysis_status["running"] = False
    analysis_status["pid"] = None
    analysis_status["log"] = ""
    analysis_status["proc"] = None

    print(f"\n  Serving Peace Room on http://localhost:{args.port}")
    print(f"  Admin panel: http://localhost:{args.port}/admin/")
    print(f"  Press Ctrl+C to stop\n")

    os.chdir(APP_DIR)
    try:
        with http.server.HTTPServer(("127.0.0.1", args.port), DevHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")


if __name__ == "__main__":
    main()
