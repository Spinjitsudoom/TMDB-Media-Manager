import os
import re
from tmdbv3api import TMDb, TV, Season
from thefuzz import process, fuzz

class TMDBEngine:
    def __init__(self, api_key):
        self.tmdb = TMDb()
        self.tmdb.api_key = api_key
        # Setting a language default ensures consistent title matching
        self.tmdb.language = 'en'
        self.tv = TV()
        self.season = Season()

    def search_shows(self, query):
        """Returns a list of potential show matches from TMDb."""
        try:
            results = self.tv.search(query)
            # Use getattr with a default to avoid crashes on missing data
            return [{"title": s.name, "id": s.id, "year": getattr(s, 'first_air_date', 'N/A')[:4]} for s in results]
        except Exception:
            return []

    def get_seasons(self, show_id):
        """Fetches the list of seasons for a specific show ID."""
        try:
            show_details = self.tv.details(show_id)
            seasons = []
            if hasattr(show_details, 'seasons'):
                for s in show_details.seasons:
                    seasons.append({
                        "name": s.name,
                        "num": s.season_number,
                        "episode_count": s.episode_count,
                        "air_date": getattr(s, 'air_date', 'N/A')
                    })
            return seasons
        except Exception:
            return []

    def get_episodes(self, show_id, season_num):
        """Fetches all episode data for a specific season."""
        details = self.season.details(show_id, season_num)
        return [{"name": ep.name, "num": ep.episode_number} for ep in details.episodes]

    def _sanitize_title(self, title):
        """Removes characters illegal in Windows/Linux filenames."""
        return "".join(c for c in title if c not in r'\/*?:"<>|').strip()

    def generate_preview(self, show_id, season_num, f_start, f_offset, pattern, season_path):
        """NUMERIC MATCHING: Matches files based on alphabetical order."""
        try:
            episodes = self.get_episodes(show_id, season_num)
            files = sorted([f for f in os.listdir(season_path) if os.path.isfile(os.path.join(season_path, f))])
        except Exception as e:
            return [], f"Error: {str(e)}"

        ep_data, log = [], "NUMERIC MATCHING LOG:\n"

        for i, f in enumerate(files):
            meta_idx = i + f_offset
            if 0 <= meta_idx < len(episodes):
                ep_info = episodes[meta_idx]
                clean_title = self._sanitize_title(ep_info['name'])
                # Using the user-defined pattern (e.g., " - ")
                display_num = str(i + f_start).zfill(2)
                new_name = f"{display_num}{pattern}{clean_title}{os.path.splitext(f)[1]}"
                ep_data.append((f, new_name))
                log += f"MATCH: {f} -> {new_name}\n"
        return ep_data, log

    def generate_title_match_preview(self, show_id, season_num, f_offset, season_path):
        """TITLE MATCHING: Matches filenames to TMDb titles using Fuzzy Logic."""
        try:
            episodes = self.get_episodes(show_id, season_num)
            files = [f for f in os.listdir(season_path) if os.path.isfile(os.path.join(season_path, f))]
            f_start = 1
        except Exception as e:
            return [], f"Error: {str(e)}"

        temp_matches = []
        log = "TITLE MATCHING LOG (Fuzzy Logic):\n"
        tmdb_map = {ep['name']: ep for ep in episodes}
        tmdb_titles = list(tmdb_map.keys())

        for f in files:
            # Clean filename for better fuzzy matching
            fn_base = os.path.splitext(f)[0].replace(".", " ").replace("_", " ")
            # Remove common scene tags that confuse fuzzy logic
            fn_base = re.sub(r'(1080p|720p|x264|x265|HEVC|WEB-DL|BluRay)', '', fn_base, flags=re.I)

            match_result = process.extractOne(fn_base, tmdb_titles, scorer=fuzz.token_set_ratio)

            if match_result and match_result[1] > 55:
                matched_title, score = match_result
                matched_ep = tmdb_map[matched_title]
                temp_matches.append({
                    "old_name": f,
                    "tmdb_ep_num": matched_ep['num'],
                    "title": matched_ep['name'],
                    "score": score
                })
            else:
                log += f"FAILED: {f} (No match found)\n\n"

        # Sort by actual TMDb episode number to maintain library order
        temp_matches.sort(key=lambda x: x['tmdb_ep_num'])

        ep_data = []
        for i, match in enumerate(temp_matches):
            clean_title = self._sanitize_title(match['title'])
            ext = os.path.splitext(match['old_name'])[1]

            display_num = str(i + f_start + f_offset).zfill(2)
            new_name = f"{display_num} - {clean_title}{ext}"

            ep_data.append((match['old_name'], new_name))
            log += f"[{match['score']}%] {match['old_name']} \n      -> {new_name}\n\n"

        if not ep_data:
            log = "No title matches found."

        return ep_data, log
