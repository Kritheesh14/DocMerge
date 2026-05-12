from pypdf import PdfWriter, PdfReader
from pathlib import Path

def merge_pdfs(paths, output_path, status_callback=None):
    writer = PdfWriter()
    for i, p in enumerate(paths):
        if status_callback:
            status_callback(f"Reading {Path(p).name}...", (i / len(paths)) * 100)
        
        reader = PdfReader(p)
        for page in reader.pages:
            writer.add_page(page)
            
    with open(output_path, "wb") as f:
        writer.write(f)
    return output_path
