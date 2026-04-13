import tkinter as tk
from tkinter import ttk

THEMES = {
    "Dark":      {"bg": "#121212", "fg": "#e0e0e0", "btn": "#2d2d2d", "entry": "#1e1e1e", "accent": "#0078d4", "border": "#333333"},
    "Light":     {"bg": "#ffffff", "fg": "#202124", "btn": "#f1f3f4", "entry": "#f8f9fa", "accent": "#1a73e8", "border": "#dadce0"},
    "Midnight":  {"bg": "#0b0e14", "fg": "#8f9bb3", "btn": "#1a212e", "entry": "#151a23", "accent": "#3366ff", "border": "#222b45"},
    "Emerald":   {"bg": "#061006", "fg": "#a3b3a3", "btn": "#102010", "entry": "#0b160b", "accent": "#009688", "border": "#1b301b"},
    "Amethyst":  {"bg": "#120d1a", "fg": "#b3a3cc", "btn": "#1f162e", "entry": "#181223", "accent": "#9b59b6", "border": "#2d2245"},
    "Crimson":   {"bg": "#1a0a0a", "fg": "#d6b4b4", "btn": "#2e1616", "entry": "#241212", "accent": "#e74c3c", "border": "#452222"},
    "Forest":    {"bg": "#0d1a12", "fg": "#b4d6c1", "btn": "#162e1f", "entry": "#12241a", "accent": "#2ecc71", "border": "#22452d"},
    "Ocean":     {"bg": "#0a161a", "fg": "#b4ccd6", "btn": "#16282e", "entry": "#122024", "accent": "#3498db", "border": "#223a45"},
    "Slate":     {"bg": "#1c232b", "fg": "#cbd5e0", "btn": "#2d3748", "entry": "#242d38", "accent": "#a0aec0", "border": "#4a5568"}
}

def apply_app_theme(root, theme_name, menubar=None, file_menu=None):
    c = THEMES.get(theme_name, THEMES["Dark"])
    s = ttk.Style()
    s.theme_use('clam')

    # --- 1. Refined Option Database ---
    # We remove the generic *Foreground which was causing the "black on black" text
    root.option_add("*Background", c["bg"])
    root.option_add("*Entry.background", c["entry"])
    root.option_add("*Entry.foreground", c["fg"])
    root.option_add("*Text.background", c["entry"])
    root.option_add("*Text.foreground", c["fg"])
    root.option_add("*TCombobox*Listbox*Background", c["entry"])
    root.option_add("*TCombobox*Listbox*Foreground", c["fg"])
    root.option_add("*TCombobox*Listbox*selectBackground", c["accent"])

    # --- 2. TTK Widget Styling ---
    s.configure("TFrame", background=c["bg"])
    s.configure("TLabel", background=c["bg"], foreground=c["fg"]) # This fixes ttk.Labels
    s.configure("TButton", background=c["btn"], foreground=c["fg"], borderwidth=1)
    s.map("TButton", background=[('active', c['accent'])])

    s.configure("TCombobox", fieldbackground=c["entry"], background=c["btn"], foreground=c["fg"])
    s.map("TCombobox", fieldbackground=[('readonly', c['entry'])], foreground=[('readonly', c['fg'])])

    s.configure("Treeview", background=c["entry"], foreground=c["fg"], fieldbackground=c["entry"])
    s.configure("Treeview.Heading", background=c["btn"], foreground=c["fg"])

    # TTK Radiobutton Styling
    s.configure("TRadiobutton", background=c["bg"], foreground=c["fg"])
    s.map("TRadiobutton",
          background=[('active', c['bg'])],
          foreground=[('active', c['accent'])])

    # --- 3. Manual Paint (The Safety Net) ---
    def manual_paint(parent):
        for child in parent.winfo_children():
            try:
                w_class = child.winfo_class()

                # Specifically target standard Labels to fix the text color
                if w_class == "Label":
                    child.configure(bg=c["bg"], fg=c["fg"])

                # Standard Frames and containers
                elif w_class in ("Frame", "Labelframe", "Toplevel", "Panedwindow"):
                    child.configure(bg=c["bg"])

                # Standard Entry/Text widgets
                elif w_class in ("Entry", "Text"):
                    child.configure(bg=c["entry"], fg=c["fg"], insertbackground=c["fg"])

                # Standard Buttons (if not using ttk.Button)
                elif w_class == "Button":
                    child.configure(bg=c["btn"], fg=c["fg"], activebackground=c["accent"])

                # Target standard Radiobuttons and Checkbuttons
                elif w_class in ("Radiobutton", "Checkbutton"):
                    child.configure(bg=c["bg"], fg=c["fg"],
                                    activebackground=c["bg"],
                                    activeforeground=c["accent"],
                                    selectcolor=c["entry"]) # The color of the dot/box background

                # Recursive call
                if child.winfo_children():
                    manual_paint(child)
            except Exception:
                pass

    # Apply to root
    root.configure(bg=c["bg"])

    # Apply to Menus
    if menubar:
        menubar.configure(bg=c["bg"], fg=c["fg"])
    if file_menu:
        file_menu.configure(bg=c["bg"], fg=c["fg"], activebackground=c["accent"])

    manual_paint(root)
