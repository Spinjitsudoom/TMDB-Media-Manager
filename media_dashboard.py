import os, re, json, tkinter as tk
from tkinter import filedialog, messagebox, ttk
from pathlib import Path
from tmdb_engine import TMDBEngine
from themes import apply_app_theme
from settings_manager import SettingsManager

class MediaManagerApp:
    def __init__(self, root):
        self.version = "v1.9.7"
        self.root = root
        self.root.title(f"Media Manager Ultimate {self.version}")
        self.root.geometry("1300x950")

        # 1. Initialize Settings Handler First
        self.settings_handler = SettingsManager(self)

        # 2. Load Defaults including API Key
        defaults = {"path": "C:/", "theme": "Dark", "pattern": " - ", "api_key": ""}
        if self.settings_handler.config_file.exists():
            try:
                with open(self.settings_handler.config_file, "r") as f:
                    defaults.update(json.load(f))
            except: pass

        # 3. Set Variables from Defaults
        self.api_key = defaults.get("api_key", "")
        self.root_dir = tk.StringVar(value=defaults["path"])
        self.current_theme = tk.StringVar(value=defaults["theme"])
        self.season_pattern = tk.StringVar(value=defaults["pattern"])

        # 4. Initialize Engine with the loaded key
        self.tmdb_engine = TMDBEngine(self.api_key)

        # UI State Variables
        self.match_mode = tk.StringVar(value="Numeric")
        self.f_start = tk.StringVar(value="1")
        self.f_offset = tk.IntVar(value=0)
        self.current_show_id = None
        self.current_season_num = None
        self.episodes_data, self.rename_history = [], []
        self.selected_show_path = tk.StringVar()
        self.selected_season_path = tk.StringVar()

        self.create_widgets()
        self.create_menu()
        self.apply_theme()

        if os.path.exists(self.root_dir.get()):
            self.refresh_shows()

    def refresh_tmdb_engine(self, new_key):
        """Called by SettingsManager when the API key is updated"""
        self.api_key = new_key
        self.tmdb_engine = TMDBEngine(self.api_key)

    def create_menu(self):
        self.menubar = tk.Menu(self.root)
        self.root.config(menu=self.menubar)
        self.file_menu = tk.Menu(self.menubar, tearoff=0)
        self.menubar.add_cascade(label="File", menu=self.file_menu)
        # Settings now handles the API Key input
        self.file_menu.add_command(label="Settings", command=self.settings_handler.open_settings)
        self.file_menu.add_command(label="Undo Last Rename", command=self.undo_rename)
        self.file_menu.add_separator()
        self.file_menu.add_command(label="Exit", command=self.root.quit)

    def apply_theme(self):
        apply_app_theme(self.root, self.current_theme.get(), self.menubar, self.file_menu)

    def create_widgets(self):
        t_f = tk.Frame(self.root, pady=10); t_f.pack(fill="x", padx=20)
        ttk.Button(t_f, text="Browse", width=8, command=self.browse_root).pack(side="left")
        tk.Entry(t_f, textvariable=self.root_dir).pack(side="left", fill="x", expand=True, padx=10)
        self.show_cb = ttk.Combobox(t_f, state="readonly", width=25); self.show_cb.pack(side="left", padx=5)
        self.show_cb.bind("<<ComboboxSelected>>", self.on_show_select)
        self.season_cb = ttk.Combobox(t_f, state="readonly", width=12); self.season_cb.pack(side="left")
        self.season_cb.bind("<<ComboboxSelected>>", self.on_season_select)

        c_b = tk.Frame(self.root, pady=5); c_b.pack(fill="x", padx=20)
        tk.Label(c_b, text="PAT:").pack(side="left")
        tk.Entry(c_b, textvariable=self.season_pattern, width=10).pack(side="left", padx=5)
        tk.Label(c_b, text="FILE Start:").pack(side="left", padx=(10,0))
        tk.Entry(c_b, textvariable=self.f_start, width=6).pack(side="left", padx=5)
        tk.Label(c_b, text="Offset:").pack(side="left", padx=(10,0))
        ttk.Button(c_b, text="-", width=2, command=lambda: self.adjust_val(-1)).pack(side="left")
        tk.Entry(c_b, textvariable=self.f_offset, width=4, justify="center").pack(side="left", padx=2)
        ttk.Button(c_b, text="+", width=2, command=lambda: self.adjust_val(1)).pack(side="left")

        m_f = tk.Frame(c_b); m_f.pack(side="right", padx=10)
        tk.Label(m_f, text="Matching:").pack(side="left")
        ttk.Radiobutton(m_f, text="Numeric", variable=self.match_mode, value="Numeric", command=self.preview_renames).pack(side="left")
        ttk.Radiobutton(m_f, text="Title", variable=self.match_mode, value="Title", command=self.preview_renames).pack(side="left")

        w_b = tk.Frame(self.root, pady=5); w_b.pack(fill="x", padx=20)
        ttk.Button(w_b, text="Search TMDb", command=self.search_tmdb).pack(side="right")
        self.search_entry = tk.Entry(w_b); self.search_entry.pack(side="right", fill="x", expand=True, padx=5)

        self.paned = tk.PanedWindow(self.root, orient=tk.HORIZONTAL, sashwidth=4)
        self.paned.pack(fill="both", expand=True, padx=20, pady=10)

        self.results_list = ttk.Treeview(self.paned, columns=("Title", "ID"), show="headings")
        self.results_list.heading("Title", text="TMDb SHOWS"); self.results_list.column("ID", width=80)
        self.results_list.bind("<Double-1>", self.on_show_id_select)
        self.paned.add(self.results_list, width=350)

        self.season_list = ttk.Treeview(self.paned, columns=("Name", "Eps", "Num"), show="headings")
        self.season_list.heading("Name", text="SEASONS"); self.season_list.heading("Eps", text="Count")
        self.season_list.column("Num", width=0, stretch=tk.NO)
        self.season_list.bind("<Double-1>", self.on_season_list_select)
        self.paned.add(self.season_list, width=300)

        p_frame = tk.Frame(self.root)
        p_frame.pack(fill="both", expand=True, padx=20, pady=10)
        self.preview_area = tk.Text(p_frame, height=12, font=("Courier", 10), wrap="none")
        self.preview_scrollbar = ttk.Scrollbar(p_frame, orient="vertical", command=self.preview_area.yview)
        self.preview_area.configure(yscrollcommand=self.preview_scrollbar.set)
        self.preview_scrollbar.pack(side="right", fill="y")
        self.preview_area.pack(side="left", fill="both", expand=True)

        b_f = tk.Frame(self.root, pady=10); b_f.pack(fill="x", padx=20)
        self.status = tk.Label(b_f, text="Ready", fg="gray"); self.status.pack(side="left")
        ttk.Button(b_f, text="EXECUTE RENAME", command=self.execute_rename).pack(side="right")
        ttk.Button(b_f, text="REFRESH", command=self.preview_renames).pack(side="right", padx=10)
        ttk.Button(b_f, text="UNDO", command=self.undo_rename).pack(side="right")

    def search_tmdb(self):
        if not self.api_key:
            messagebox.showwarning("API Key Missing", "Please enter your TMDb API Key in File > Settings first!")
            return

        query = self.search_entry.get() or self.show_cb.get()
        if not query: return
        self.results_list.delete(*self.results_list.get_children())
        self.season_list.delete(*self.season_list.get_children())
        try:
            results = self.tmdb_engine.search_shows(query)
            for show in results:
                self.results_list.insert("", "end", values=(f"{show['title']} ({show['year']})", show['id']))
        except Exception as e: messagebox.showerror("Error", f"Search Failed: {str(e)}")

    def on_show_id_select(self, e):
        sel = self.results_list.selection()
        if not sel: return
        self.current_show_id = self.results_list.item(sel[0], "values")[1]
        self.season_list.delete(*self.season_list.get_children())
        seasons = self.tmdb_engine.get_seasons(self.current_show_id)
        for s in seasons:
            self.season_list.insert("", "end", values=(s['name'], s['episode_count'], s['num']))

    def on_season_list_select(self, e):
        sel = self.season_list.selection()
        if not sel: return
        self.current_season_num = int(self.season_list.item(sel[0], "values")[2])
        self.preview_renames()

    def preview_renames(self):
        if not self.current_show_id or self.current_season_num is None: return
        p = self.selected_season_path.get()
        if not p or not os.path.exists(p): return

        if self.match_mode.get() == "Numeric":
            self.episodes_data, log = self.tmdb_engine.generate_preview(
                self.current_show_id, self.current_season_num, int(self.f_start.get()),
                self.f_offset.get(), self.season_pattern.get(), p
            )
        else:
            self.episodes_data, log = self.tmdb_engine.generate_title_match_preview(
                self.current_show_id, self.current_season_num, self.f_offset.get(), p
            )

        files_in_folder = len([f for f in os.listdir(p) if os.path.isfile(os.path.join(p, f))])
        matched_count = len(self.episodes_data)
        self.preview_area.delete("1.0", tk.END)
        summary = f"Files Found: {files_in_folder} | Matched for Rename: {matched_count}\n{'-'*50}\n"
        self.preview_area.insert(tk.END, summary + log)
        self.status.config(text=f"Found {files_in_folder} files | {matched_count} matches", fg="gray")

    def execute_rename(self):
        if not self.episodes_data: return
        path, history, renamed_count = self.selected_season_path.get(), [], 0
        try:
            for old, new in self.episodes_data:
                if old == new: continue
                old_p, new_p = os.path.join(path, old), os.path.join(path, new)
                if os.path.exists(old_p):
                    os.rename(old_p, new_p)
                    history.append((new_p, old_p))
                    renamed_count += 1
            self.rename_history = history
            if renamed_count > 0:
                messagebox.showinfo("Success", f"Task Complete!\nSuccessfully renamed {renamed_count} files.")
            else:
                messagebox.showinfo("No Changes", "All files already match TMDb.")
            self.preview_renames()
        except Exception as e: messagebox.showerror("Error", str(e))

    def adjust_val(self, delta):
        self.f_offset.set(self.f_offset.get() + delta); self.preview_renames()

    def browse_root(self):
        path = filedialog.askdirectory()
        if path: self.root_dir.set(path); self.refresh_shows()

    def refresh_shows(self):
        p = self.root_dir.get()
        if os.path.exists(p):
            shows = sorted([d for d in os.listdir(p) if os.path.isdir(os.path.join(p, d))])
            self.show_cb['values'] = shows
            if shows: self.show_cb.set(shows[0]); self.on_show_select(None)

    def on_show_select(self, e):
        p = os.path.join(self.root_dir.get(), self.show_cb.get())
        self.selected_show_path.set(p); self.search_entry.delete(0, tk.END); self.search_entry.insert(0, self.show_cb.get())
        if os.path.exists(p):
            seasons = sorted([d for d in os.listdir(p) if os.path.isdir(os.path.join(p, d))])
            self.season_cb['values'] = seasons
            if seasons: self.season_cb.set(seasons[0]); self.on_season_select(None)
            self.search_tmdb()

    def on_season_select(self, e):
        self.selected_season_path.set(os.path.join(self.selected_show_path.get(), self.season_cb.get()))
        self.preview_renames()

    def undo_rename(self):
        if not self.rename_history: return
        for c, o in self.rename_history:
            if os.path.exists(c): os.rename(c, o)
        self.rename_history = []; messagebox.showinfo("Undo", "Reverted!")

if __name__ == "__main__":
    root = tk.Tk(); app = MediaManagerApp(root); root.mainloop()
