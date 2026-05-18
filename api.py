"""FastAPI backend for Matchbox."""
from __future__ import annotations
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
import uuid
from pathlib import Path
from typing import Optional

from thefuzz import process, fuzz

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from tmdb_engine import TMDBEngine

app = FastAPI(title="Matchbox")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def _data_dir() -> Path:
    d = Path.home() / "Documents" / "Matchbox"
    d.mkdir(parents=True, exist_ok=True)
    return d

_DATA_DIR = _data_dir()
_CONFIG_FILE = _DATA_DIR / "config.json"
_CONFIG_DEFAULTS: dict = {
    "api_key": "", "path": "/", "pattern": " - ", "theme": "Slate",
    "whisper_model": "base", "whisper_language": "", "whisper_beam_size": 5, "whisper_vad": True,
    "custom_themes": [
        {"name": "Custom 1", "bg": "#13161e", "accent": "#3b82f6"},
        {"name": "Custom 2", "bg": "#0a0a0a", "accent": "#10b981"},
        {"name": "Custom 3", "bg": "#0c0814", "accent": "#a855f7"},
    ],
    "tv_template": "{e:02d}{sep}{title}",
    "movie_template": "{title} ({year})",
    "tv_path": "",
    "movie_path": "",
}


class ConfigManager:
    def load(self) -> dict:
        data = dict(_CONFIG_DEFAULTS)
        if _CONFIG_FILE.exists():
            try:
                data.update(json.loads(_CONFIG_FILE.read_text()))
            except Exception:
                pass
        return data

    def save(self, updates: dict) -> dict:
        data = self.load()
        data.update(updates)
        _CONFIG_FILE.write_text(json.dumps(data, indent=2))
        return data


cfg = ConfigManager()
_engine: Optional[TMDBEngine] = None
_rename_history: list[tuple[str, str]] = []

HISTORY_FILE = _DATA_DIR / ".rename_history.json"


def _load_history() -> list[tuple[str, str]]:
    try:
        if HISTORY_FILE.exists():
            data = json.loads(HISTORY_FILE.read_text())
            return [tuple(p) for p in data]  # type: ignore[misc]
    except Exception:
        pass
    return []


def _save_history(history: list[tuple[str, str]]) -> None:
    try:
        HISTORY_FILE.write_text(json.dumps(history[-200:]))  # keep last 200 pairs
    except Exception:
        pass


_rename_history = _load_history()

PRESETS_FILE = _DATA_DIR / "presets.json"


def _load_presets() -> list[dict]:
    try:
        if PRESETS_FILE.exists():
            return json.loads(PRESETS_FILE.read_text())
    except Exception:
        pass
    return []


def _save_presets(presets: list[dict]) -> None:
    try:
        PRESETS_FILE.write_text(json.dumps(presets, indent=2))
    except Exception:
        pass


MATCH_HISTORY_FILE = _DATA_DIR / "match_history.json"


def _load_match_history() -> dict:
    try:
        if MATCH_HISTORY_FILE.exists():
            return json.loads(MATCH_HISTORY_FILE.read_text())
    except Exception:
        pass
    return {}


def _save_match_history(h: dict) -> None:
    MATCH_HISTORY_FILE.write_text(json.dumps(h, indent=2))


TMDB_IMG_BASE = "https://image.tmdb.org/t/p"
VIDEO_EXTS = {".mkv", ".mp4", ".avi", ".m4v", ".mov", ".wmv", ".flv", ".ts", ".m2ts"}


def engine() -> TMDBEngine:
    global _engine
    config = cfg.load()
    if _engine is None or _engine.tmdb.api_key != config.get("api_key", ""):
        _engine = TMDBEngine(config["api_key"])
    return _engine


# ── Config ────────────────────────────────────────────────────────────────────

@app.get("/api/config")
def get_config():
    return cfg.load()


class ConfigUpdate(BaseModel):
    api_key: Optional[str] = None
    path: Optional[str] = None
    pattern: Optional[str] = None
    theme: Optional[str] = None
    whisper_model: Optional[str] = None
    whisper_language: Optional[str] = None
    whisper_beam_size: Optional[int] = None
    whisper_vad: Optional[bool] = None
    custom_themes: Optional[list] = None
    tv_template: Optional[str] = None
    movie_template: Optional[str] = None
    tv_path: Optional[str] = None
    movie_path: Optional[str] = None


@app.post("/api/config")
def save_config(body: ConfigUpdate):
    global _engine
    _engine = None
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    return cfg.save(updates)


# ── Presets ───────────────────────────────────────────────────────────────────

class PresetBody(BaseModel):
    name: str
    type: str       # 'remux' | 'subtitles'
    settings: dict


@app.get("/api/presets")
def get_presets(type: Optional[str] = Query(None)):
    presets = _load_presets()
    if type:
        presets = [p for p in presets if p.get("type") == type]
    return presets


@app.post("/api/presets")
def save_preset(body: PresetBody):
    presets = _load_presets()
    # Overwrite if same name + type already exists
    presets = [p for p in presets if not (p["name"] == body.name and p["type"] == body.type)]
    presets.append({"id": str(uuid.uuid4()), "name": body.name, "type": body.type, "settings": body.settings})
    _save_presets(presets)
    return [p for p in presets if p.get("type") == body.type]


@app.delete("/api/presets/{preset_id}")
def delete_preset(preset_id: str):
    presets = _load_presets()
    deleted_type = next((p["type"] for p in presets if p["id"] == preset_id), None)
    presets = [p for p in presets if p["id"] != preset_id]
    _save_presets(presets)
    return [p for p in presets if p.get("type") == deleted_type]


# ── Library ───────────────────────────────────────────────────────────────────

@app.get("/api/library")
def list_library(path: Optional[str] = Query(None)):
    config = cfg.load()
    root = path if (path and path != "/") else config.get("path", "/")
    base = Path(root)
    if not base.exists():
        return []
    return [
        {"name": d.name, "path": str(d)}
        for d in sorted(base.iterdir())
        if d.is_dir()
    ]


@app.get("/api/library/seasons")
def list_seasons(folder: str = Query(...)):
    p = Path(folder)
    if not p.exists() or not p.is_dir():
        raise HTTPException(400, "Invalid folder")
    subs = [d for d in sorted(p.iterdir()) if d.is_dir()]
    result = []
    for d in subs:
        files = [f for f in d.iterdir() if f.is_file() and f.suffix.lower() in VIDEO_EXTS]
        result.append({"name": d.name, "path": str(d), "file_count": len(files)})
    # also include files directly in the folder
    direct = [f for f in p.iterdir() if f.is_file() and f.suffix.lower() in VIDEO_EXTS]
    if direct:
        result.insert(0, {"name": p.name, "path": str(p), "file_count": len(direct)})
    return result


@app.get("/api/library/files")
def list_files(folder: str = Query(...)):
    p = Path(folder)
    if not p.exists():
        raise HTTPException(400, "Invalid folder")
    return sorted([
        f.name for f in p.iterdir()
        if f.is_file() and f.suffix.lower() in VIDEO_EXTS
    ])


# ── TMDB — TV ─────────────────────────────────────────────────────────────────

@app.get("/api/search")
def search_shows(q: str = Query(...)):
    return engine().search_shows(q)


# ── TMDB — Movies ─────────────────────────────────────────────────────────────

@app.get("/api/search/movies")
def search_movies(q: str = Query(...)):
    return engine().search_movies(q)


@app.get("/api/movie/{movie_id}")
def get_movie(movie_id: int):
    return engine().get_movie_details(movie_id)


@app.get("/api/show/{show_id}")
def get_show(show_id: int):
    details, seasons = engine().get_show_full(show_id)
    return {"details": details, "seasons": seasons}


@app.get("/api/show/{show_id}/season/{season_num}")
def get_season(show_id: int, season_num: int):
    details, episodes = engine().get_season_full(show_id, season_num)
    return {"details": details, "episodes": episodes}


# ── Image proxy ───────────────────────────────────────────────────────────────

@app.get("/api/image")
def proxy_image(path: str = Query(...), size: str = Query("w342")):
    url = f"{TMDB_IMG_BASE}/{size}{path}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Matchbox/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
            ct = resp.headers.get("Content-Type", "image/jpeg")
        return Response(content=data, media_type=ct)
    except Exception:
        raise HTTPException(404, "Image not found")


# ── Rename ────────────────────────────────────────────────────────────────────

class PreviewRequest(BaseModel):
    season_path: str
    mode: str = "numeric"       # "numeric" | "title" | "movie"
    # TV fields
    show_id: Optional[int] = None
    season_num: Optional[int] = None
    f_start: int = 1
    f_offset: int = 0
    pattern: Optional[str] = None
    # Movie field
    movie_id: Optional[int] = None


def _apply_template(tmpl: str, **fields) -> str:
    """Substitute {key} and {key:fmt} placeholders in a naming template."""
    def replace(m):
        key, fmt = m.group(1), m.group(2)
        val = fields.get(key)
        if val is None:
            return m.group(0)
        if fmt:
            try:
                return format(int(val), fmt)
            except Exception:
                return str(val)
        return str(val)
    return re.sub(r'\{(\w+)(?::([^}]*))?\}', replace, tmpl)


def _clean_filename(name: str) -> str:
    base = os.path.splitext(name)[0].replace(".", " ").replace("_", " ")
    return re.sub(r"(1080p|720p|x264|x265|HEVC|WEB-DL|BluRay|HDR|DV)", "", base, flags=re.I).strip()


def _extract_episode_num(filename: str) -> int | None:
    """Try to pull an episode number out of a filename for number-aware matching."""
    stem = Path(filename).stem
    # S01E07 / s01e07
    m = re.search(r'[Ss]\d{1,2}[Ee](\d{1,3})', stem)
    if m:
        return int(m.group(1))
    # Leading digits: "07 - Title" / "07.Title"
    m = re.match(r'^(\d{1,3})[\s._\-]', stem)
    if m:
        return int(m.group(1))
    # E07 anywhere
    m = re.search(r'[Ee](\d{1,3})(?:\b|$)', stem)
    if m:
        return int(m.group(1))
    # Trailing digits: "Title - 07"
    m = re.search(r'[\s._\-](\d{1,3})$', stem)
    if m:
        return int(m.group(1))
    return None


@app.post("/api/preview")
def preview(body: PreviewRequest):
    config = cfg.load()
    pattern = body.pattern if body.pattern is not None else config.get("pattern", " - ")
    tv_template = config.get("tv_template", "{e:02d}{sep}{title}")
    movie_template = config.get("movie_template", "{title} ({year})")
    eng = engine()

    base = Path(body.season_path)
    local_files = sorted([
        f for f in os.listdir(body.season_path)
        if os.path.isfile(base / f) and Path(f).suffix.lower() in VIDEO_EXTS
    ])

    # ── Movie mode ────────────────────────────────────────────────────────────
    if body.mode == "movie":
        if not body.movie_id:
            raise HTTPException(400, "movie_id required for movie mode")
        details = eng.get_movie_details(body.movie_id)
        title = eng._sanitize_title(details.get("title", "Unknown"))
        year = details.get("release_date", "")[:4]
        results = []
        for i, f in enumerate(local_files):
            ext = Path(f).suffix
            if len(local_files) == 1:
                label = _apply_template(movie_template, title=title, year=year, sep=pattern)
                new_file = f"{label}{ext}"
            else:
                label = _apply_template(movie_template, title=title, year=year, sep=pattern)
                new_file = f"{label} - Part {str(i + 1).zfill(2)}{ext}"
            results.append({
                "tmdb_num": i + 1,
                "tmdb_title": new_file.removesuffix(ext),
                "old_file": f,
                "new_file": new_file,
                "score": 100,
                "changed": f != new_file,
            })
        return {"episodes": results}

    # ── TV modes ──────────────────────────────────────────────────────────────
    if not body.show_id or body.season_num is None:
        raise HTTPException(400, "show_id and season_num required for TV mode")

    episodes = eng.get_episodes(body.show_id, body.season_num)
    results = []

    if body.mode == "title":
        tmdb_titles = [ep["name"] for ep in episodes]
        file_to_match: dict[str, tuple[str, int]] = {}
        for f in local_files:
            cleaned = _clean_filename(f)
            hit = process.extractOne(cleaned, tmdb_titles, scorer=fuzz.token_set_ratio)
            if hit and hit[1] > 30:
                title, score = hit[0], hit[1]
                prev = file_to_match.get(title)
                if prev is None or score > prev[1]:
                    file_to_match[title] = (f, score)

        for ep in episodes:
            match = file_to_match.get(ep["name"])
            if match:
                old_file, score = match
                clean_title = eng._sanitize_title(ep["name"])
                ext = Path(old_file).suffix
                new_file = _apply_template(tv_template, e=ep["num"] + body.f_offset, s=body.season_num, title=clean_title, sep=pattern) + ext
                results.append({
                    "tmdb_num": ep["num"],
                    "tmdb_title": ep["name"],
                    "old_file": old_file,
                    "new_file": new_file,
                    "score": score,
                    "changed": old_file != new_file,
                })
            else:
                results.append({
                    "tmdb_num": ep["num"],
                    "tmdb_title": ep["name"],
                    "old_file": None,
                    "new_file": None,
                    "score": 0,
                    "changed": False,
                })
    else:
        file_by_epnum: dict[int, str] = {}
        unnumbered: list[str] = []
        for f in local_files:
            n = _extract_episode_num(f)
            if n is not None and n not in file_by_epnum:
                file_by_epnum[n] = f
            else:
                unnumbered.append(f)

        unnumbered_it = iter(unnumbered)
        for ep in episodes:
            ep_num = ep["num"]
            if ep_num in file_by_epnum:
                old_file: str | None = file_by_epnum[ep_num]
            else:
                old_file = next(unnumbered_it, None)

            if old_file:
                clean_title = eng._sanitize_title(ep["name"])
                new_file = _apply_template(tv_template, e=ep_num + body.f_offset, s=body.season_num, title=clean_title, sep=pattern) + Path(old_file).suffix
                results.append({
                    "tmdb_num": ep_num,
                    "tmdb_title": ep["name"],
                    "old_file": old_file,
                    "new_file": new_file,
                    "score": 100,
                    "changed": old_file != new_file,
                })
            else:
                results.append({
                    "tmdb_num": ep_num,
                    "tmdb_title": ep["name"],
                    "old_file": None,
                    "new_file": None,
                    "score": 0,
                    "changed": False,
                })

    results.sort(key=lambda x: x["tmdb_num"])
    return {"episodes": results}


class RenameRequest(BaseModel):
    season_path: str
    pairs: list[dict]


@app.post("/api/rename")
def do_rename(body: RenameRequest):
    global _rename_history
    base = Path(body.season_path)
    done, errors = [], []
    history_batch: list[tuple[str, str]] = []

    # Collect pairs that actually need renaming
    valid: list[tuple[Path, Path]] = []
    for pair in body.pairs:
        old_path = base / pair["old"]
        new_path = base / pair["new"]
        if old_path.name == new_path.name:
            continue
        if not old_path.exists():
            errors.append(f"Not found: {pair['old']}")
            continue
        valid.append((old_path, new_path))

    # Phase 1: move each file to a temp name so within-batch collisions can't block us
    staged: list[tuple[Path, Path, Path]] = []  # (temp, new, original_old)
    for old_path, new_path in valid:
        temp_path = old_path.with_name(f".mbx_tmp_{old_path.name}")
        try:
            old_path.rename(temp_path)
            staged.append((temp_path, new_path, old_path))
        except Exception as e:
            errors.append(f"{old_path.name}: {e}")

    # Phase 2: move each temp file to its final name
    for temp_path, new_path, original_old in staged:
        if new_path.exists():
            # Allow case-only renames to overwrite (e.g. lowercase → Title Case).
            # Path.rename() is atomic on Linux and will replace the target.
            is_case_rename = new_path.name.lower() == original_old.name.lower()
            if not is_case_rename:
                try:
                    temp_path.rename(original_old)  # restore
                except Exception:
                    pass
                errors.append(f"Already exists: {new_path.name}")
                continue
        try:
            temp_path.rename(new_path)
            history_batch.append((str(new_path), str(original_old)))
            done.append(new_path.name)
        except Exception as e:
            errors.append(f"{original_old.name}: {e}")

    _rename_history.extend(history_batch)
    _save_history(_rename_history)
    return {"renamed": done, "errors": errors, "can_undo": bool(history_batch)}


@app.get("/api/undo/preview")
def undo_preview():
    return {"pairs": [
        {"current": Path(new_path).name, "original": Path(old_path).name}
        for new_path, old_path in reversed(_rename_history)
    ]}


@app.post("/api/undo")
def undo_rename():
    global _rename_history
    if not _rename_history:
        raise HTTPException(400, "Nothing to undo")
    restored, errors = [], []
    while _rename_history:
        new_path, old_path = _rename_history.pop()
        try:
            Path(new_path).rename(Path(old_path))
            restored.append(Path(old_path).name)
        except Exception as e:
            errors.append(f"{e}")
    _save_history(_rename_history)
    return {"restored": restored, "errors": errors}


# ── Remux ─────────────────────────────────────────────────────────────────────

class RemuxRequest(BaseModel):
    folder_path: str
    files: list[str]
    target_format: str       # "mkv", "mp4", "m4v", "avi"
    delete_original: bool = False
    default_audio_track: Optional[int] = None     # 1-based audio track position
    default_subtitle_track: Optional[int] = None  # 1-based subtitle track position


@app.get("/api/remux/check")
def check_ffmpeg():
    try:
        r = subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        return {"available": r.returncode == 0}
    except Exception:
        return {"available": False}


class AudioTracksRequest(BaseModel):
    folder_path: str
    files: list[str]


def _probe_streams(path: Path, stream_type: str) -> list:
    p = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", stream_type,
         "-show_entries", "stream=index,codec_name:stream_tags=language,title",
         "-of", "json", str(path)],
        capture_output=True, text=True, timeout=15,
    )
    if p.returncode != 0:
        return []
    streams = json.loads(p.stdout or "{}").get("streams", [])
    return [
        {"position": pos, "stream_index": s.get("index"),
         "codec": s.get("codec_name"),
         "language": (s.get("tags") or {}).get("language"),
         "title": (s.get("tags") or {}).get("title")}
        for pos, s in enumerate(streams, start=1)
    ]


@app.post("/api/remux/audio-tracks")
def get_audio_tracks(body: AudioTracksRequest):
    base = Path(body.folder_path)
    if not base.exists():
        raise HTTPException(400, "Folder not found")

    result = []
    max_audio_tracks = 0
    max_subtitle_tracks = 0
    for fname in body.files:
        src = base / fname
        if not src.exists() or not src.is_file():
            continue
        try:
            tracks = _probe_streams(src, "a")
            subtitle_tracks = _probe_streams(src, "s")
            max_audio_tracks = max(max_audio_tracks, len(tracks))
            max_subtitle_tracks = max(max_subtitle_tracks, len(subtitle_tracks))
            result.append({"file": fname, "tracks": tracks, "subtitle_tracks": subtitle_tracks})
        except Exception:
            result.append({"file": fname, "tracks": [], "subtitle_tracks": []})

    return {"files": result, "max_audio_tracks": max_audio_tracks, "max_subtitle_tracks": max_subtitle_tracks}


def _audio_track_count(path: Path) -> int:
    cmd = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "a",
        "-show_entries", "stream=index",
        "-of", "json",
        str(path),
    ]
    try:
        probe = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if probe.returncode != 0:
            return 0
        data = json.loads(probe.stdout or "{}")
        return len(data.get("streams", []))
    except Exception:
        return 0


@app.post("/api/remux")
def start_remux(body: RemuxRequest):
    base = Path(body.folder_path)
    if not base.exists():
        raise HTTPException(400, "Folder not found")
    target_ext = body.target_format.lstrip(".").lower()
    default_audio_idx = body.default_audio_track - 1 if body.default_audio_track else None
    default_subtitle_idx = body.default_subtitle_track - 1 if body.default_subtitle_track else None

    def generate():
        total = len(body.files)
        for idx, fname in enumerate(body.files):
            src = base / fname
            src_ext = Path(fname).suffix.lstrip(".").lower()

            yield f"data: {json.dumps({'file': fname, 'status': 'running', 'done': idx, 'total': total})}\n\n"

            if src_ext == target_ext and default_audio_idx is None and default_subtitle_idx is None:
                yield f"data: {json.dumps({'file': fname, 'status': 'skipped', 'reason': 'same format', 'done': idx + 1, 'total': total})}\n\n"
                continue

            if not src.exists():
                yield f"data: {json.dumps({'file': fname, 'status': 'error', 'error': 'File not found', 'done': idx + 1, 'total': total})}\n\n"
                continue

            same_format = src_ext == target_ext
            dst_name = Path(fname).stem + "." + target_ext
            dst = base / dst_name
            final_name = dst_name
            disposition_only = same_format and (default_audio_idx is not None or default_subtitle_idx is not None)
            if disposition_only:
                dst = base / f"{Path(fname).stem}.disposition.tmp{Path(fname).suffix}"
                final_name = fname

            # Probe duration for progress calculation
            dur_probe = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1:nokey=1", str(src)],
                capture_output=True, text=True, timeout=15,
            )
            try:
                duration = float(dur_probe.stdout.strip())
            except (ValueError, AttributeError):
                duration = 0.0

            cmd = ["ffmpeg", "-y", "-v", "quiet", "-i", str(src)]
            if target_ext == "mkv" or default_audio_idx is not None or default_subtitle_idx is not None:
                cmd.extend(["-map", "0", "-c", "copy"])
            else:
                cmd.extend(["-c:v", "copy", "-c:a", "copy"])
            if default_audio_idx is not None:
                cmd.extend(["-disposition:a", "0", f"-disposition:a:{default_audio_idx}", "default"])
            if default_subtitle_idx is not None:
                cmd.extend(["-disposition:s", "0", f"-disposition:s:{default_subtitle_idx}", "default"])
            cmd.extend(["-progress", "pipe:1", str(dst)])

            try:
                with tempfile.TemporaryFile() as stderr_tmp:
                    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=stderr_tmp)
                    for raw_line in proc.stdout:  # type: ignore[union-attr]
                        line = raw_line.decode("utf-8", errors="replace").strip()
                        if line.startswith("out_time_us=") and duration > 0:
                            try:
                                pct = min(99, int(int(line.split("=")[1]) / (duration * 1_000_000) * 100))
                                yield f"data: {json.dumps({'file': fname, 'status': 'running', 'progress': pct, 'done': idx, 'total': total})}\n\n"
                            except (ValueError, ZeroDivisionError):
                                pass
                    try:
                        proc.wait(timeout=60)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait()
                    stderr_tmp.seek(0)
                    stderr_output = stderr_tmp.read().decode("utf-8", errors="replace")[-300:]

                if proc.returncode == 0:
                    if disposition_only:
                        os.replace(dst, src)
                    elif body.delete_original:
                        src.unlink(missing_ok=True)
                    yield f"data: {json.dumps({'file': fname, 'out': final_name, 'status': 'done', 'done': idx + 1, 'total': total})}\n\n"
                else:
                    if dst.exists():
                        dst.unlink(missing_ok=True)
                    yield f"data: {json.dumps({'file': fname, 'status': 'error', 'error': stderr_output, 'done': idx + 1, 'total': total})}\n\n"
            except Exception as exc:
                yield f"data: {json.dumps({'file': fname, 'status': 'error', 'error': str(exc), 'done': idx + 1, 'total': total})}\n\n"

        yield f"data: {json.dumps({'status': 'complete', 'total': total})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Whisper subtitle generation ───────────────────────────────────────────────

WHISPER_MODELS = ["tiny", "base", "small", "medium", "large"]


def _fmt_srt_time(seconds: float) -> str:
    h, rem = divmod(int(seconds), 3600)
    m, s = divmod(rem, 60)
    ms = round((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


@app.get("/api/whisper/check")
def check_whisper():
    try:
        import faster_whisper  # noqa: F401
        return {"available": True, "models": WHISPER_MODELS}
    except ImportError:
        return {"available": False, "models": []}


class WhisperRequest(BaseModel):
    folder_path: str
    files: list[str]
    model: str = "base"
    language: Optional[str] = None
    vad_filter: bool = True
    beam_size: int = 5
    initial_prompt: Optional[str] = None
    audio_track: Optional[int] = None  # 1-based; None = let Whisper choose


@app.post("/api/whisper")
def generate_subtitles(body: WhisperRequest):
    base = Path(body.folder_path)
    if not base.exists():
        raise HTTPException(400, "Folder not found")

    def generate():
        try:
            from faster_whisper import WhisperModel
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'error': f'Cannot load faster-whisper: {e}'})}\n\n"
            return

        total = len(body.files)
        model = None

        for idx, fname in enumerate(body.files):
            src = base / fname
            yield f"data: {json.dumps({'file': fname, 'status': 'running', 'done': idx, 'total': total})}\n\n"

            if not src.exists():
                yield f"data: {json.dumps({'file': fname, 'status': 'error', 'error': 'File not found', 'done': idx + 1, 'total': total})}\n\n"
                continue

            tmp_audio: Optional[Path] = None
            try:
                if model is None:
                    yield f"data: {json.dumps({'file': fname, 'status': 'loading_model', 'model': body.model, 'done': idx, 'total': total})}\n\n"
                    model = WhisperModel(body.model, device="cpu", compute_type="int8")

                transcribe_path = str(src)
                if body.audio_track is not None:
                    audio_idx = body.audio_track - 1
                    tmp_audio = Path(tempfile.mktemp(suffix=".wav", dir="/tmp"))
                    r = subprocess.run(
                        ["ffmpeg", "-y", "-i", str(src),
                         "-map", f"0:a:{audio_idx}",
                         "-ar", "16000", "-ac", "1", "-f", "wav", str(tmp_audio)],
                        capture_output=True, timeout=300,
                    )
                    if r.returncode != 0:
                        yield f"data: {json.dumps({'file': fname, 'status': 'error', 'error': 'Failed to extract audio track', 'done': idx + 1, 'total': total})}\n\n"
                        continue
                    transcribe_path = str(tmp_audio)

                kwargs: dict = {
                    "beam_size": body.beam_size,
                    "vad_filter": body.vad_filter,
                    "repetition_penalty": 1.1,
                    "no_repeat_ngram_size": 3,
                }
                if body.vad_filter:
                    kwargs["hallucination_silence_threshold"] = 2.0
                if body.language:
                    kwargs["language"] = body.language
                if body.initial_prompt:
                    kwargs["initial_prompt"] = body.initial_prompt

                segments, info = model.transcribe(transcribe_path, **kwargs)

                srt_name = src.stem + ".srt"
                srt_path = base / srt_name
                last_pct = -1
                with open(srt_path, "w", encoding="utf-8") as f:
                    for i, seg in enumerate(segments, 1):
                        f.write(f"{i}\n{_fmt_srt_time(seg.start)} --> {_fmt_srt_time(seg.end)}\n{seg.text.strip()}\n\n")
                        if info.duration > 0:
                            pct = min(99, int(seg.end / info.duration * 100))
                            if pct != last_pct:
                                last_pct = pct
                                yield f"data: {json.dumps({'file': fname, 'status': 'running', 'progress': pct, 'done': idx, 'total': total})}\n\n"

                yield f"data: {json.dumps({'file': fname, 'out': srt_name, 'status': 'done', 'language': info.language, 'done': idx + 1, 'total': total})}\n\n"

            except Exception as exc:
                yield f"data: {json.dumps({'file': fname, 'status': 'error', 'error': str(exc)[:200], 'done': idx + 1, 'total': total})}\n\n"
            finally:
                if tmp_audio and tmp_audio.exists():
                    tmp_audio.unlink(missing_ok=True)

        yield f"data: {json.dumps({'status': 'complete', 'total': total})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Match History ─────────────────────────────────────────────────────────────

class MatchSaveBody(BaseModel):
    folder_path: str
    type: str
    id: int
    name: str
    season_num: Optional[int] = None


@app.get("/api/match-history")
def get_match(folder: str = Query(...)):
    return _load_match_history().get(folder) or {}


@app.post("/api/match-history")
def save_match(body: MatchSaveBody):
    h = _load_match_history()
    h[body.folder_path] = body.model_dump(exclude={"folder_path"})
    _save_match_history(h)
    return {"ok": True}


@app.delete("/api/match-history")
def delete_match(folder: str = Query(...)):
    h = _load_match_history()
    h.pop(folder, None)
    _save_match_history(h)
    return {"ok": True}


# ── FFmpeg Validate ────────────────────────────────────────────────────────────

class ValidateRequest(BaseModel):
    folder_path: str
    files: list[str]


@app.post("/api/remux/validate")
def validate_files(body: ValidateRequest):
    base = Path(body.folder_path)
    results = []
    for fname in body.files:
        src = base / fname
        if not src.exists():
            results.append({"file": fname, "error": "not found"})
            continue
        try:
            fmt_probe = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=format_name,duration,size",
                 "-of", "json", str(src)],
                capture_output=True, text=True, timeout=15,
            )
            fmt = json.loads(fmt_probe.stdout or "{}").get("format", {})
            video_streams = _probe_streams(src, "v")
            audio_streams = _probe_streams(src, "a")
            sub_streams = _probe_streams(src, "s")

            container = Path(fname).suffix.lstrip(".").lower()
            audio_codecs = [s.get("codec") for s in audio_streams]
            video_codec = video_streams[0].get("codec") if video_streams else None
            warnings = []
            if container == "mp4":
                if any(c in (audio_codecs or []) for c in ["dts", "truehd", "eac3"]):
                    warnings.append("MP4 doesn't support DTS/TrueHD/E-AC3 — these tracks will be lost or transcoded")
                if sub_streams:
                    warnings.append("MP4 has limited subtitle support — image-based subs (PGS/VOBSUB) will be dropped")
            if video_codec in ["mpeg2video", "mpeg4"]:
                warnings.append(f"{video_codec} video requires re-encoding to remux to MKV/MP4 (slow)")

            results.append({
                "file": fname,
                "container": container,
                "duration": float(fmt.get("duration") or 0),
                "size": int(fmt.get("size") or 0),
                "video": video_streams,
                "audio": audio_streams,
                "subtitles": sub_streams,
                "warnings": warnings,
            })
        except Exception as e:
            results.append({"file": fname, "error": str(e)})
    return {"files": results}


# ── Updates & Config Export/Import ────────────────────────────────────────────

@app.get("/api/updates/check")
def check_updates():
    try:
        req = urllib.request.Request(
            "https://api.github.com/repos/Spinjitsudoom/Matchbox/releases/latest",
            headers={"User-Agent": "Matchbox/1.0"},
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
        return {"latest_tag": data.get("tag_name"), "url": data.get("html_url"), "name": data.get("name")}
    except Exception:
        return {"latest_tag": None, "url": None, "name": None}


@app.get("/api/config/export")
def export_config():
    content = _CONFIG_FILE.read_text() if _CONFIG_FILE.exists() else "{}"
    return Response(
        content=content, media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=matchbox-config.json"},
    )


class ConfigImportBody(BaseModel):
    data: dict


@app.post("/api/config/import")
def import_config(body: ConfigImportBody):
    allowed = set(_CONFIG_DEFAULTS.keys())
    updates = {k: v for k, v in body.data.items() if k in allowed}
    return cfg.save(updates)


# ── Split File ─────────────────────────────────────────────────────────────────

class SplitRequest(BaseModel):
    folder_path: str
    filename: str
    splits: list[str]       # HH:MM:SS timestamps marking start of segments 2, 3, …
    output_names: list[str]  # one name per segment (len = len(splits) + 1)


@app.post("/api/split")
def split_file(body: SplitRequest):
    if len(body.splits) + 1 != len(body.output_names):
        raise HTTPException(400, "output_names must have exactly one more entry than splits")
    base = Path(body.folder_path)
    src = base / body.filename
    if not src.exists():
        raise HTTPException(400, "File not found")

    def generate():
        total = len(body.output_names)
        starts = ["00:00:00"] + list(body.splits)
        ends: list[Optional[str]] = list(body.splits) + [None]
        for i, (start, end, out_name) in enumerate(zip(starts, ends, body.output_names)):
            yield f"data: {json.dumps({'segment': i + 1, 'total': total, 'status': 'running', 'file': out_name})}\n\n"
            cmd = ["ffmpeg", "-y", "-i", str(src), "-ss", start]
            if end:
                cmd += ["-to", end]
            cmd += ["-c", "copy", str(base / out_name)]
            try:
                result = subprocess.run(cmd, capture_output=True, timeout=3600)
                if result.returncode == 0:
                    yield f"data: {json.dumps({'segment': i + 1, 'total': total, 'status': 'done', 'file': out_name})}\n\n"
                else:
                    err = result.stderr.decode(errors="replace")[-300:]
                    yield f"data: {json.dumps({'segment': i + 1, 'total': total, 'status': 'error', 'file': out_name, 'error': err})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'segment': i + 1, 'total': total, 'status': 'error', 'file': out_name, 'error': str(e)})}\n\n"
        yield f"data: {json.dumps({'status': 'complete', 'total': total})}\n\n"

    return StreamingResponse(
        generate(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Static frontend ───────────────────────────────────────────────────────────

_frontend = Path(__file__).parent / "frontend" / "dist"
if _frontend.exists():
    app.mount("/assets", StaticFiles(directory=str(_frontend / "assets")), name="assets")

    @app.get("/")
    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str = ""):
        index = _frontend / "index.html"
        return FileResponse(str(index))
