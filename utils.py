from pathlib import Path

def get_desktop_output_path(name):
    base = Path.home() / "Desktop" / name
    if not base.exists():
        return str(base)
    
    stem, suffix = base.stem, base.suffix
    i = 1
    while True:
        candidate = Path.home() / "Desktop" / f"{stem}_{i}{suffix}"
        if not candidate.exists():
            return str(candidate)
        i += 1
