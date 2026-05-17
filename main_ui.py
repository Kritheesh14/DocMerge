import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import threading
from pathlib import Path

import PDF_Handler
import PPT_Handler
import Handling_Mixed_Docs
import utils

class DocumentMergerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Document Merger")
        self.root.geometry("900x680")
        self.root.configure(bg='#1C1F26')
        self.files = []
        
        self._setup_styles()
        self._build_ui()

    def _setup_styles(self):
        style = ttk.Style()
        style.theme_use('clam')
        
        style.configure("TFrame", background='#1C1F26')
        style.configure("TLabel", background='#1C1F26', foreground='#EBECF2', font=('Segoe UI', 10))
        style.configure("Header.TLabel", font=('Segoe UI', 18, 'bold'), foreground='#4F94FF')
        
        style.configure("TButton", padding=8, font=('Segoe UI', 10, 'bold'))
        style.map("TButton", 
                  background=[('active', '#2D323E'), ('!disabled', '#333845')], 
                  foreground=[('!disabled', '#EBECF2')])
        
        style.configure("Accent.TButton", background='#33C9AA', foreground='#0D0D0D')
        style.map("Accent.TButton", background=[('active', '#2BB095')])
        
        style.configure("TProgressbar", thickness=6, background='#4F94FF', troughcolor='#292E39', bordercolor='#1C1F26')

    def _build_ui(self):
        main_container = ttk.Frame(self.root, padding="20 16 20 16")
        main_container.pack(fill="both", expand=True)

        header_frame = ttk.Frame(main_container)
        header_frame.pack(fill="x", pady=(0, 10))
        ttk.Label(header_frame, text="🗂  PDF & PPTX Merger", style="Header.TLabel").pack(side="left")
        
        self.count_lbl = ttk.Label(header_frame, text="0 / 20 files", foreground='#8C94A6')
        self.count_lbl.pack(side="right")

        ttk.Label(main_container, 
                  text="Same format → merged in original format   |   Mixed → converted to PDF",
                  foreground='#8C94A6', font=('Segoe UI', 9)).pack(pady=(0, 10))

        list_frame = tk.Frame(main_container, bg='#292E39', bd=0)
        list_frame.pack(fill="both", expand=True, pady=10)

        self.listbox = tk.Listbox(list_frame, bg='#333845', fg='#EBECF2', 
                                  selectbackground='#4F94FF', selectforeground='white',
                                  font=('Segoe UI', 11), borderwidth=0, highlightthickness=0,
                                  activestyle='none')
        self.listbox.pack(side="left", fill="both", expand=True)

        scroll = ttk.Scrollbar(list_frame, orient="vertical", command=self.listbox.yview)
        scroll.pack(side="right", fill="y")
        self.listbox.config(yscrollcommand=scroll.set)

        btn_row = ttk.Frame(main_container)
        btn_row.pack(fill="x", pady=10)
        
        ttk.Button(btn_row, text="+ Add Files", command=self._add).pack(side="left", padx=(0, 5), expand=True, fill="x")
        ttk.Button(btn_row, text="Clear All", command=self._clear).pack(side="left", padx=(5, 0), expand=True, fill="x")

        self.progress = ttk.Progressbar(main_container, length=400, mode="determinate")
        self.progress.pack(fill="x", pady=5)

        self.status_var = tk.StringVar(value="Ready to process")
        self.status_lbl = ttk.Label(main_container, textvariable=self.status_var, font=('Segoe UI', 9))
        self.status_lbl.pack()

        self.btn_merge = ttk.Button(main_container, text="⚡  Merge Files", 
                                    style="Accent.TButton", command=self._start_merge)
        self.btn_merge.pack(fill="x", pady=(15, 0), ipady=8)

    def _add(self):
        paths = filedialog.askopenfilenames(filetypes=[("Documents", "*.pdf *.pptx *.ppt")])
        for p in paths:
            if p not in self.files and len(self.files) < 20:
                self.files.append(p)
                self.listbox.insert(tk.END, f"  {Path(p).name}")
        self.count_lbl.config(text=f"{len(self.files)} / 20 files")

    def _clear(self):
        self.files.clear()
        self.listbox.delete(0, tk.END)
        self.count_lbl.config(text="0 / 20 files")

    def _update_status(self, msg, val):
        self.status_var.set(msg)
        self.progress['value'] = val
        self.root.update_idletasks()

    def _start_merge(self):
        if len(self.files) < 2:
            messagebox.showwarning("Notice", "Please add at least 2 files to merge.")
            return
        self.btn_merge.state(['disabled'])
        threading.Thread(target=self._worker, daemon=True).start()

    def _worker(self):
        try:
            exts = {Path(f).suffix.lower() for f in self.files}
            if exts <= {'.pdf'}:
                default_name = "merged.pdf"
                file_types = [("PDF Document", "*.pdf")]
                mode = "pdf"
            elif exts <= {'.pptx', '.ppt'}:
                default_name = "merged.pptx"
                file_types = [("PowerPoint Presentation", "*.pptx")]
                mode = "pptx"
            else:
                default_name = "merged.pdf"
                file_types = [("PDF Document", "*.pdf")]
                mode = "mixed"

            out = filedialog.asksaveasfilename(
                title="Save Merged File As",
                initialfile=default_name,
                filetypes=file_types,
                defaultextension=f".{mode if mode != 'mixed' else 'pdf'}"
            )

            if not out:
                return

            if mode == "pdf":
                PDF_Handler.merge_pdfs(self.files, out, self._update_status)
            elif mode == "pptx":
                PPT_Handler.merge_pptx(self.files, out, self._update_status)
            else:
                Handling_Mixed_Docs.merge_mixed(self.files, out, self._update_status)
            
            messagebox.showinfo("Success", f"File successfully saved to:\n{out}")
        except Exception as e:
            messagebox.showerror("Error", str(e))
        finally:
            self._update_status("Ready to process", 0)
            self.btn_merge.state(['!disabled'])

if __name__ == "__main__":
    root = tk.Tk()
    app = DocumentMergerApp(root)
    root.mainloop()
