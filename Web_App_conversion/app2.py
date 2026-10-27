import io
import os
import shutil
import tempfile
import uuid
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file, session

app = Flask(__name__)
app.secret_key = os.urandom(24)

UPLOAD_FOLDER = tempfile.mkdtemp(prefix="merger_")
ALLOWED_EXTENSIONS = {".pdf", ".pptx", ".ppt"}
MAX_FILES = 20

# Point-to-EMU conversion factor used when laying out converted PPTX slides
PT_TO_EMU = 12700


def allowed(filename):
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def session_dir(sid):
    d = Path(UPLOAD_FOLDER) / sid
    d.mkdir(parents=True, exist_ok=True)
    return d


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

        added.append({
            "id": safe_name,
            "name": f.filename,
            "ext": Path(f.filename).suffix.lower()
        })

    order_file.write_text("\n".join(files))

    return jsonify({
        "added": added,
        "total": len(files)
    })


@app.route("/files")
def list_files():
    sid = session.get("sid")

    if not sid:
        return jsonify({"files": []})

    sdir = session_dir(sid)
    order_file = sdir / "order.txt"

    if not order_file.exists():
        return jsonify({"files": []})

    result = []

    for line in order_file.read_text().splitlines():
        if "|||" not in line:
            continue

        safe, orig = line.split("|||", 1)

        result.append({
            "id": safe,
            "name": orig,
            "ext": Path(orig).suffix.lower()
        })

    return jsonify({"files": result})


@app.route("/reorder", methods=["POST"])
def reorder():
    sid = session.get("sid")

    if not sid:
        return jsonify({"ok": False}), 400

    sdir = session_dir(sid)
    order_file = sdir / "order.txt"

    new_ids = request.json.get("ids", [])

    if not order_file.exists():
        return jsonify({"ok": False}), 400

    mapping = {}

    for line in order_file.read_text().splitlines():
        if "|||" in line:
            safe, orig = line.split("|||", 1)
            mapping[safe] = orig

    new_lines = [
        f"{nid}|||{mapping[nid]}"
        for nid in new_ids
        if nid in mapping
    ]

    order_file.write_text("\n".join(new_lines))

    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
