import json
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from pathlib import Path
from themes import apply_app_theme, THEMES

class SettingsManager:
    def __init__(self, app):
        self.app = app
        self.config_file = Path("config.json")

    def open_settings(self):
        # 1. Create the Toplevel window
        self.settings_win = tk.Toplevel(self.app.root)
        self.settings_win.title("APPLICATION SETTINGS")
        self.settings_win.geometry("500x550") # Increased height for API field
        self.settings_win.resizable(False, False)

        # 2. Grab the current theme colors
        current_theme_name = self.app.current_theme.get()
        c = THEMES.get(current_theme_name, THEMES["Dark"])
        self.settings_win.configure(bg=c["bg"])

        # 3. Create a container frame
        main_frame = tk.Frame(self.settings_win, bg=c["bg"], padx=30, pady=30)
        main_frame.pack(fill="both", expand=True)

        # --- Title ---
        tk.Label(main_frame, text="APPLICATION SETTINGS",
                 font=("Segoe UI", 14, "bold"), bg=c["bg"], fg=c["fg"]).pack(pady=(0, 25))

        # --- TMDb API Key (New Section) ---
        tk.Label(main_frame, text="TMDb API Key (v3):", anchor="w",
                 bg=c["bg"], fg=c["fg"]).pack(fill="x")

        # Load the key from the app's current state
        self.api_key_var = tk.StringVar(value=self.app.api_key)
        self.api_entry = tk.Entry(main_frame, textvariable=self.api_key_var, show="*") # Masked for privacy
        self.api_entry.pack(fill="x", pady=(5, 15))

        # Toggle visibility button
        self.show_key = False
        def toggle_api_visibility():
            self.show_key = not self.show_key
            self.api_entry.config(show="" if self.show_key else "*")
            show_btn.config(text="Hide" if self.show_key else "Show")

        show_btn = ttk.Button(main_frame, text="Show", width=6, command=toggle_api_visibility)
        show_btn.pack(anchor="e", pady=(0, 10))

        # --- Default Path ---
        tk.Label(main_frame, text="Default Media Path:", anchor="w",
                 bg=c["bg"], fg=c["fg"]).pack(fill="x")

        path_frame = tk.Frame(main_frame, bg=c["bg"])
        path_frame.pack(fill="x", pady=(5, 15))

        self.path_var = tk.StringVar(value=self.app.root_dir.get())
        self.path_entry = tk.Entry(path_frame, textvariable=self.path_var)
        self.path_entry.pack(side="left", fill="x", expand=True, padx=(0, 10))

        ttk.Button(path_frame, text="Browse", width=10,
                   command=self.browse_path).pack(side="right")

        # --- Default Pattern ---
        tk.Label(main_frame, text="Default Pattern (Saved):", anchor="w",
                 bg=c["bg"], fg=c["fg"]).pack(fill="x")

        self.pattern_var = tk.StringVar(value=self.app.season_pattern.get())
        self.pattern_entry = tk.Entry(main_frame, textvariable=self.pattern_var)
        self.pattern_entry.pack(fill="x", pady=(5, 15))

        # --- UI Theme Selection ---
        tk.Label(main_frame, text="UI Theme:", anchor="w",
                 bg=c["bg"], fg=c["fg"]).pack(fill="x")

        self.theme_var = tk.StringVar(value=current_theme_name)
        theme_cb = ttk.Combobox(main_frame, textvariable=self.theme_var, state="readonly")
        theme_cb['values'] = list(THEMES.keys())
        theme_cb.pack(fill="x", pady=(5, 25))

        # --- Footer ---
        btn_frame = tk.Frame(main_frame, bg=c["bg"])
        btn_frame.pack(fill="x", side="bottom")

        ttk.Button(btn_frame, text="Save Settings",
                   command=self.save_settings).pack(side="right")

        # 4. Apply Theme after widgets are packed
        self.settings_win.after(10, lambda: apply_app_theme(self.settings_win, current_theme_name, None, None))

    def browse_path(self):
        new_path = filedialog.askdirectory(initialdir=self.path_var.get())
        if new_path:
            self.path_var.set(new_path)

    def save_settings(self):
        new_settings = {
            "api_key": self.api_key_var.get().strip(), # Save the new key
            "path": self.path_var.get(),
            "pattern": self.pattern_var.get(),
            "theme": self.theme_var.get()
        }

        try:
            with open(self.config_file, "w") as f:
                json.dump(new_settings, f, indent=4)

            # Update app variables
            self.app.root_dir.set(new_settings["path"])
            self.app.season_pattern.set(new_settings["pattern"])
            self.app.current_theme.set(new_settings["theme"])

            # CRITICAL: Re-initialize the TMDB engine with the new key
            self.app.refresh_tmdb_engine(new_settings["api_key"])

            # Apply to main window
            apply_app_theme(self.app.root, new_settings["theme"], self.app.menubar, self.app.file_menu)

            messagebox.showinfo("Success", "Settings saved and API Engine updated!")
            self.settings_win.destroy()
        except Exception as e:
            messagebox.showerror("Error", f"Failed to save settings: {str(e)}")
