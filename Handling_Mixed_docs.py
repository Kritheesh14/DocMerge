import os
import win32com.client
from pypdf import PdfWriter, PdfReader
from pathlib import Path

def merge_mixed(input_paths, output_pdf_path, status_callback=None):
    writer = PdfWriter()
    temp_pdfs = []

    try:
        for i, path in enumerate(input_paths):
            if status_callback:
                status_callback(f"Processing file {i+1}/{len(input_paths)}...", int((i / len(input_paths)) * 100))
            
            ext = Path(path).suffix.lower()
            
            if ext == '.pdf':
                temp_pdfs.append(path)
                
            elif ext in ['.pptx', '.ppt']:
                abs_pptx = os.path.abspath(path)
                abs_out_pdf = os.path.splitext(abs_pptx)[0] + "_temp.pdf"
                
                powerpoint = win32com.client.DispatchEx("PowerPoint.Application")
                presentation = powerpoint.Presentations.Open(abs_pptx, WithWindow=False)
                presentation.SaveAs(abs_out_pdf, FileFormat=32)
                presentation.Close()
                powerpoint.Quit()
                
                temp_pdfs.append(abs_out_pdf)

        for p in temp_pdfs:
            for page in PdfReader(p).pages:
                writer.add_page(page)
                
        with open(output_pdf_path, "wb") as f:
            writer.write(f)

    finally:
        for p in temp_pdfs:
            if "_temp.pdf" in p and os.path.exists(p):
                try:
                    os.remove(p)
                except:
                    pass
