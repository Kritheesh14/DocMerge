import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file, session

app = Flask(__name__)
app.secret_key = os.urandom(24)

UPLOAD_FOLDER = tempfile.mkdtemp(prefix="merger_")
ALLOWED_EXTENSIONS = {".pdf", ".pptx", ".ppt"}
MAX_FILES = 20


def allowed(filename):
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def session_dir(sid):
    d = Path(UPLOAD_FOLDER) / sid
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    if "sid" not in session:
        session["sid"] = str(uuid.uuid4())
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload():
    sid = session.get("sid", str(uuid.uuid4()))
    session["sid"] = sid
    sdir = session_dir(sid)

    # Load existing order list
    order_file = sdir / "order.txt"
    files = order_file.read_text().splitlines() if order_file.exists() else []

    if len(files) >= MAX_FILES:
        return jsonify({"error": f"Maximum {MAX_FILES} files allowed."}), 400

    uploaded = request.files.getlist("files")
    added = []
    for f in uploaded:
        if len(files) >= MAX_FILES:
            break
        if not f.filename or not allowed(f.filename):
            continue
        safe_name = f"{uuid.uuid4().hex}_{Path(f.filename).name}"
        dest = sdir / safe_name
        f.save(dest)
        entry = f"{safe_name}|||{f.filename}"
        files.append(entry)
        added.append({"id": safe_name, "name": f.filename,
                      "ext": Path(f.filename).suffix.lower()})

    order_file.write_text("\n".join(files))
    return jsonify({"added": added, "total": len(files)})

