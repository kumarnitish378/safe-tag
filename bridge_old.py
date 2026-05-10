"""
Safe-Tag Bridge Server
======================
Run this in Termux. It creates a local API that lets you
apply code changes directly from Claude chat.

Usage:
    python bridge.py

Then share your ngrok URL with Claude and I'll push code directly!
"""

import os
import subprocess
import hashlib
import json
from datetime import datetime
from flask import Flask, request, jsonify

app = Flask(__name__)

# ── Config ────────────────────────────────────────────────────────────────
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
SECRET      = os.environ.get("BRIDGE_SECRET", "safetag123")  # Change this!
LOG_FILE    = os.path.join(PROJECT_DIR, "bridge.log")

# ── Helpers ───────────────────────────────────────────────────────────────

def log(msg):
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def verify_secret(req):
    return req.headers.get("X-Bridge-Secret") == SECRET


def git_commit_push(message="Bridge update"):
    try:
        subprocess.run(["git", "add", "."],         cwd=PROJECT_DIR, check=True)
        subprocess.run(["git", "commit", "-m", message], cwd=PROJECT_DIR, check=True)
        subprocess.run(["git", "push"],              cwd=PROJECT_DIR, check=True)
        return True, "Committed and pushed."
    except subprocess.CalledProcessError as e:
        return False, str(e)


# ── Routes ────────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def health():
    return jsonify({
        "status": "Bridge is running!",
        "project": PROJECT_DIR,
        "time": datetime.now().isoformat()
    })


@app.route("/write", methods=["POST"])
def write_file():
    """
    Write or update a file in the project.
    Body: { "path": "templates/index.html", "content": "..." }
    """
    if not verify_secret(request):
        return jsonify({"ok": False, "error": "Unauthorized"}), 401

    data    = request.json or {}
    path    = data.get("path", "")
    content = data.get("content", "")
    commit  = data.get("commit", False)
    message = data.get("message", f"Bridge: update {path}")

    if not path:
        return jsonify({"ok": False, "error": "No path provided"}), 400

    # Safety: only allow writes inside project dir
    full_path = os.path.normpath(os.path.join(PROJECT_DIR, path))
    if not full_path.startswith(PROJECT_DIR):
        return jsonify({"ok": False, "error": "Path outside project!"}), 403

    # Create directories if needed
    os.makedirs(os.path.dirname(full_path), exist_ok=True)

    # Write file
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

    log(f"WRITE: {path} ({len(content)} bytes)")

    result = {"ok": True, "path": path, "bytes": len(content)}

    if commit:
        ok, msg = git_commit_push(message)
        result["committed"] = ok
        result["git_message"] = msg

    return jsonify(result)


@app.route("/write-many", methods=["POST"])
def write_many():
    """
    Write multiple files at once.
    Body: { "files": [{"path": "...", "content": "..."}], "commit": true }
    """
    if not verify_secret(request):
        return jsonify({"ok": False, "error": "Unauthorized"}), 401

    data    = request.json or {}
    files   = data.get("files", [])
    commit  = data.get("commit", False)
    message = data.get("message", "Bridge: batch update")

    written = []
    for f in files:
        path    = f.get("path", "")
        content = f.get("content", "")
        if not path:
            continue

        full_path = os.path.normpath(os.path.join(PROJECT_DIR, path))
        if not full_path.startswith(PROJECT_DIR):
            continue

        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as fh:
            fh.write(content)

        log(f"WRITE: {path} ({len(content)} bytes)")
        written.append(path)

    result = {"ok": True, "written": written}

    if commit:
        ok, msg = git_commit_push(message)
        result["committed"] = ok
        result["git_message"] = msg

    return jsonify(result)


@app.route("/read", methods=["GET"])
def read_file():
    """
    Read a file from the project.
    Query: ?path=app.py
    """
    if not verify_secret(request):
        return jsonify({"ok": False, "error": "Unauthorized"}), 401

    path      = request.args.get("path", "")
    full_path = os.path.normpath(os.path.join(PROJECT_DIR, path))

    if not full_path.startswith(PROJECT_DIR):
        return jsonify({"ok": False, "error": "Path outside project!"}), 403

    if not os.path.exists(full_path):
        return jsonify({"ok": False, "error": "File not found"}), 404

    with open(full_path, "r", encoding="utf-8") as f:
        content = f.read()

    return jsonify({"ok": True, "path": path, "content": content})


@app.route("/run", methods=["POST"])
def run_command():
    """
    Run a shell command in the project directory.
    Body: { "cmd": "pip install flask" }
    Only allows safe whitelisted commands.
    """
    if not verify_secret(request):
        return jsonify({"ok": False, "error": "Unauthorized"}), 401

    data = request.json or {}
    cmd  = data.get("cmd", "")

    # Whitelist safe commands only
    allowed = [
        "git ", "pip install", "python ", "flask ",
        "ls", "pwd", "cat ", "mkdir ", "mv ", "cp "
    ]
    if not any(cmd.startswith(a) for a in allowed):
        return jsonify({"ok": False, "error": f"Command not allowed: {cmd}"}), 403

    log(f"RUN: {cmd}")

    result = subprocess.run(
        cmd, shell=True, cwd=PROJECT_DIR,
        capture_output=True, text=True, timeout=30
    )

    return jsonify({
        "ok":     result.returncode == 0,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "code":   result.returncode
    })


@app.route("/commit", methods=["POST"])
def commit():
    """Force a git commit + push."""
    if not verify_secret(request):
        return jsonify({"ok": False, "error": "Unauthorized"}), 401

    message = (request.json or {}).get("message", "Bridge: manual commit")
    ok, msg = git_commit_push(message)
    return jsonify({"ok": ok, "message": msg})


@app.route("/ls", methods=["GET"])
def list_files():
    """List all files in the project."""
    if not verify_secret(request):
        return jsonify({"ok": False, "error": "Unauthorized"}), 401

    files = []
    for root, dirs, filenames in os.walk(PROJECT_DIR):
        # Skip hidden dirs
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for filename in filenames:
            if filename.startswith('.'):
                continue
            rel = os.path.relpath(os.path.join(root, filename), PROJECT_DIR)
            files.append(rel)

    return jsonify({"ok": True, "files": sorted(files)})


if __name__ == "__main__":
    print("=" * 50)
    print("  Safe-Tag Bridge Server")
    print("=" * 50)
    print(f"  Project : {PROJECT_DIR}")
    print(f"  Secret  : {SECRET}")
    print(f"  Port    : 6000")
    print()
    print("  Run ngrok in another Termux session:")
    print("  ./ngrok http 6000")
    print()
    print("  Then share the ngrok URL with Claude!")
    print("=" * 50)

    app.run(host="0.0.0.0", port=6000, debug=False)
