"""
Safe-Tag Bridge Server v2
=========================
Run this in Termux. It creates a local API that lets you
apply code changes directly from Claude chat.

New in v2: /fetch endpoint to pull files from any URL directly.
"""

import os
import subprocess
import json
from datetime import datetime
from flask import Flask, request, jsonify
import urllib.request

app = Flask(__name__)

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
SECRET      = os.environ.get("BRIDGE_SECRET", "safetag123")
LOG_FILE    = os.path.join(PROJECT_DIR, "bridge.log")

def log(msg):
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")

def verify(req):
    return req.headers.get("X-Bridge-Secret") == SECRET

def git_push(message="Bridge update"):
    try:
        subprocess.run(["git", "add", "."],              cwd=PROJECT_DIR, check=True)
        subprocess.run(["git", "commit", "-m", message], cwd=PROJECT_DIR, check=True)
        subprocess.run(["git", "push"],                  cwd=PROJECT_DIR, check=True)
        return True, "Committed and pushed."
    except subprocess.CalledProcessError as e:
        return False, str(e)


# ── Health ────────────────────────────────────────────────────────────────
@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "Bridge v2 running!", "project": PROJECT_DIR, "time": datetime.now().isoformat()})


# ── Write one file ─────────────────────────────────────────────────────────
@app.route("/write", methods=["POST"])
def write_file():
    if not verify(request): return jsonify({"ok": False, "error": "Unauthorized"}), 401
    data    = request.json or {}
    path    = data.get("path", "")
    content = data.get("content", "")
    commit  = data.get("commit", False)
    message = data.get("message", f"Bridge: update {path}")
    if not path: return jsonify({"ok": False, "error": "No path"}), 400
    full = os.path.normpath(os.path.join(PROJECT_DIR, path))
    if not full.startswith(PROJECT_DIR): return jsonify({"ok": False, "error": "Path outside project"}), 403
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f: f.write(content)
    log(f"WRITE: {path} ({len(content)} bytes)")
    result = {"ok": True, "path": path, "bytes": len(content)}
    if commit:
        ok, msg = git_push(message)
        result["committed"] = ok
        result["git"] = msg
    return jsonify(result)


# ── Write many files ───────────────────────────────────────────────────────
@app.route("/write-many", methods=["POST"])
def write_many():
    if not verify(request): return jsonify({"ok": False, "error": "Unauthorized"}), 401
    data    = request.json or {}
    files   = data.get("files", [])
    commit  = data.get("commit", False)
    message = data.get("message", "Bridge: batch update")
    written = []
    for f in files:
        path, content = f.get("path",""), f.get("content","")
        if not path: continue
        full = os.path.normpath(os.path.join(PROJECT_DIR, path))
        if not full.startswith(PROJECT_DIR): continue
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as fh: fh.write(content)
        log(f"WRITE: {path} ({len(content)} bytes)")
        written.append(path)
    result = {"ok": True, "written": written}
    if commit:
        ok, msg = git_push(message)
        result["committed"] = ok
        result["git"] = msg
    return jsonify(result)


# ── NEW: Fetch file from URL ───────────────────────────────────────────────
@app.route("/fetch", methods=["POST"])
def fetch_url():
    """
    Fetch a file from a URL and save it to the project.
    Body: { "url": "https://...", "path": "templates/emergency.html", "commit": true }
    """
    if not verify(request): return jsonify({"ok": False, "error": "Unauthorized"}), 401
    data    = request.json or {}
    url     = data.get("url", "")
    path    = data.get("path", "")
    commit  = data.get("commit", False)
    message = data.get("message", f"Bridge: fetch {path}")
    if not url:  return jsonify({"ok": False, "error": "No URL"}), 400
    if not path: return jsonify({"ok": False, "error": "No path"}), 400
    full = os.path.normpath(os.path.join(PROJECT_DIR, path))
    if not full.startswith(PROJECT_DIR): return jsonify({"ok": False, "error": "Path outside project"}), 403
    try:
        log(f"FETCH: {url} -> {path}")
        with urllib.request.urlopen(url, timeout=15) as resp:
            content = resp.read().decode("utf-8")
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as f: f.write(content)
        log(f"FETCHED: {path} ({len(content)} bytes)")
        result = {"ok": True, "path": path, "bytes": len(content), "source": url}
        if commit:
            ok, msg = git_push(message)
            result["committed"] = ok
            result["git"] = msg
        return jsonify(result)
    except Exception as e:
        log(f"FETCH ERROR: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500


# ── NEW: Fetch many files from URLs ───────────────────────────────────────
@app.route("/fetch-many", methods=["POST"])
def fetch_many():
    """
    Fetch multiple files from URLs at once.
    Body: { "files": [{"url": "...", "path": "..."}], "commit": true }
    """
    if not verify(request): return jsonify({"ok": False, "error": "Unauthorized"}), 401
    data    = request.json or {}
    files   = data.get("files", [])
    commit  = data.get("commit", False)
    message = data.get("message", "Bridge: fetch many")
    fetched, errors = [], []
    for f in files:
        url, path = f.get("url",""), f.get("path","")
        if not url or not path: continue
        full = os.path.normpath(os.path.join(PROJECT_DIR, path))
        if not full.startswith(PROJECT_DIR): continue
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                content = resp.read().decode("utf-8")
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "w", encoding="utf-8") as fh: fh.write(content)
            log(f"FETCHED: {path} ({len(content)} bytes)")
            fetched.append(path)
        except Exception as e:
            log(f"FETCH ERROR {path}: {e}")
            errors.append({"path": path, "error": str(e)})
    result = {"ok": True, "fetched": fetched, "errors": errors}
    if commit:
        ok, msg = git_push(message)
        result["committed"] = ok
        result["git"] = msg
    return jsonify(result)


# ── Read ───────────────────────────────────────────────────────────────────
@app.route("/read", methods=["GET"])
def read_file():
    if not verify(request): return jsonify({"ok": False, "error": "Unauthorized"}), 401
    path = request.args.get("path", "")
    full = os.path.normpath(os.path.join(PROJECT_DIR, path))
    if not full.startswith(PROJECT_DIR): return jsonify({"ok": False, "error": "Path outside project"}), 403
    if not os.path.exists(full): return jsonify({"ok": False, "error": "Not found"}), 404
    with open(full, "r", encoding="utf-8") as f: content = f.read()
    return jsonify({"ok": True, "path": path, "content": content})


# ── Run ────────────────────────────────────────────────────────────────────
@app.route("/run", methods=["POST"])
def run_command():
    if not verify(request): return jsonify({"ok": False, "error": "Unauthorized"}), 401
    cmd = (request.json or {}).get("cmd", "")
    allowed = ["git ", "pip install", "pip3 install", "python ", "python3 ", "flask ", "ls", "pwd", "cat ", "mkdir ", "mv ", "cp "]
    if not any(cmd.startswith(a) for a in allowed):
        return jsonify({"ok": False, "error": f"Command not allowed: {cmd}"}), 403
    log(f"RUN: {cmd}")
    result = subprocess.run(cmd, shell=True, cwd=PROJECT_DIR, capture_output=True, text=True, timeout=60)
    return jsonify({"ok": result.returncode == 0, "stdout": result.stdout, "stderr": result.stderr, "code": result.returncode})


# ── Commit ─────────────────────────────────────────────────────────────────
@app.route("/commit", methods=["POST"])
def commit():
    if not verify(request): return jsonify({"ok": False, "error": "Unauthorized"}), 401
    message = (request.json or {}).get("message", "Bridge: manual commit")
    ok, msg = git_push(message)
    return jsonify({"ok": ok, "message": msg})


# ── List files ─────────────────────────────────────────────────────────────
@app.route("/ls", methods=["GET"])
def list_files():
    if not verify(request): return jsonify({"ok": False, "error": "Unauthorized"}), 401
    files = []
    for root, dirs, filenames in os.walk(PROJECT_DIR):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for filename in filenames:
            if not filename.startswith('.'):
                files.append(os.path.relpath(os.path.join(root, filename), PROJECT_DIR))
    return jsonify({"ok": True, "files": sorted(files)})


if __name__ == "__main__":
    print("=" * 50)
    print("  Safe-Tag Bridge Server v2")
    print("=" * 50)
    print(f"  Project : {PROJECT_DIR}")
    print(f"  Secret  : {SECRET}")
    print(f"  Port    : 6000")
    print()
    print("  New: /fetch and /fetch-many endpoints!")
    print("  Claude can now push files via GitHub Gist URLs")
    print("=" * 50)
    app.run(host="0.0.0.0", port=6000, debug=False)
