import subprocess
import tempfile
import shutil
from pathlib import Path
import PDF_Handler

def pptx_to_pdf(pptx_path, out_dir):
    subprocess.run(["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", out_dir, pptx_path], check=True)
    return str(Path(out_dir) / f"{Path(pptx_path).stem}.pdf")

def merge_mixed(paths, output_path, status_callback=None):
    tmpdir = tempfile.mkdtemp()
    pdf_paths = []
    try:
        for i, p in enumerate(paths):
            if status_callback:
                status_callback(f"Converting {Path(p).name}...", (i / len(paths)) * 100)
            
            if Path(p).suffix.lower() == '.pdf':
                pdf_paths.append(p)
            else:
                pdf_paths.append(pptx_to_pdf(p, tmpdir))
        
        return PDF_Handler.merge_pdfs(pdf_paths, output_path, status_callback)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
