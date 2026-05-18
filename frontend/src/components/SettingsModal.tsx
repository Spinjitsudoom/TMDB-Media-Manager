import { useState, useEffect } from 'react';
import { X, Eye, EyeOff, FolderOpen, Trash2 } from 'lucide-react';
import { getConfig, saveConfig, getPresets, savePreset, deletePreset, importConfig } from '../api/client';
import type { Config, Preset, CustomTheme } from '../api/client';
import { injectCustomThemeCss } from '../customThemes';
import { THEMES } from '../ThemeContext';
import type { Theme } from '../ThemeContext';
import { useTheme } from '../ThemeContext';
import toast from 'react-hot-toast';

interface Props { onClose: () => void }

const THEME_COLORS: Record<string, string> = {
  Slate: '#3b82f6', Dark: '#6366f1', Midnight: '#6366f1',
  Emerald: '#10b981', Amethyst: '#a855f7', Crimson: '#ef4444',
  Forest: '#4ade80', Ocean: '#0ea5e9', Light: '#2563eb',
};

const BUILTIN_THEMES = THEMES.filter(t => !t.startsWith('Custom'));

const WHISPER_MODELS = ['tiny', 'base', 'small', 'medium', 'large'] as const;

const LANGUAGES: { code: string; label: string }[] = [
  { code: '', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ko', label: 'Korean' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'ru', label: 'Russian' },
];

export function SettingsModal({ onClose }: Props) {
  const [cfg, setCfg] = useState<Config>({
    api_key: '', path: '/', pattern: ' - ', theme: 'Slate',
    whisper_model: 'base', whisper_language: '', whisper_beam_size: 5, whisper_vad: true,
    custom_themes: [],
    tv_template: '{e:02d}{sep}{title}',
    movie_template: '{title} ({year})',
    tv_path: '',
    movie_path: '',
  });
  const [showKey, setShowKey] = useState(false);
  const [tab, setTab] = useState<'general' | 'personalization' | 'subtitles'>('general');
  const [subtitlePresets, setSubtitlePresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([
    { name: 'Custom 1', bg: '#13161e', accent: '#3b82f6' },
    { name: 'Custom 2', bg: '#0a0a0a', accent: '#10b981' },
    { name: 'Custom 3', bg: '#0c0814', accent: '#a855f7' },
  ]);
  const { theme: currentTheme, setTheme } = useTheme();

  useEffect(() => {
    getConfig().then(c => {
      setCfg(c);
      if (c.custom_themes?.length === 3) setCustomThemes(c.custom_themes);
    }).catch(() => {});
    getPresets('subtitles').then(setSubtitlePresets).catch(() => {});
  }, []);

  const handleSavePreset = async () => {
    const name = presetName.trim();
    if (!name) return;
    const updated = await savePreset(name, 'subtitles', {
      model: cfg.whisper_model,
      language: cfg.whisper_language,
      beam_size: cfg.whisper_beam_size,
      vad_filter: cfg.whisper_vad,
    }).catch(() => null);
    if (updated) setSubtitlePresets(updated);
    setSavingPreset(false);
    setPresetName('');
  };

  const handleDeletePreset = async () => {
    if (!selectedPresetId) return;
    const updated = await deletePreset(selectedPresetId).catch(() => null);
    if (updated !== null) { setSubtitlePresets(updated); setSelectedPresetId(''); }
  };

  const handleSelectPreset = (id: string) => {
    setSelectedPresetId(id);
    const p = subtitlePresets.find(p => p.id === id);
    if (!p) return;
    const s = p.settings;
    if (typeof s.model === 'string') setCfg(c => ({ ...c, whisper_model: s.model as string }));
    if (typeof s.language === 'string') setCfg(c => ({ ...c, whisper_language: s.language as string }));
    if (typeof s.beam_size === 'number') setCfg(c => ({ ...c, whisper_beam_size: s.beam_size as number }));
    if (typeof s.vad_filter === 'boolean') setCfg(c => ({ ...c, whisper_vad: s.vad_filter as boolean }));
  };

  const handleUpdatePreset = async () => {
    const p = subtitlePresets.find(p => p.id === selectedPresetId);
    if (!p) return;
    const updated = await savePreset(p.name, 'subtitles', {
      model: cfg.whisper_model, language: cfg.whisper_language,
      beam_size: cfg.whisper_beam_size, vad_filter: cfg.whisper_vad,
    }).catch(() => null);
    if (updated) { setSubtitlePresets(updated); const saved = updated.find(q => q.name === p.name); if (saved) setSelectedPresetId(saved.id); }
  };

  const updateCustomTheme = (slot: 0 | 1 | 2, patch: Partial<CustomTheme>) => {
    setCustomThemes(prev => {
      const next = prev.map((t, i) => i === slot ? { ...t, ...patch } : t);
      injectCustomThemeCss((slot + 1) as 1 | 2 | 3, next[slot]);
      return next;
    });
  };

  const save = async () => {
    try {
      await saveConfig({ ...cfg, custom_themes: customThemes });
      if (cfg.theme && THEMES.includes(cfg.theme as Theme)) {
        setTheme(cfg.theme as Theme);
      }
      toast.success('Settings saved');
      onClose();
    } catch {
      toast.error('Failed to save settings');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="rounded-2xl w-full max-w-md shadow-2xl border flex flex-col"
        style={{ background: 'var(--bg-800)', borderColor: 'var(--border)', maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Settings</h2>
          <button onClick={onClose} className="transition-colors hover:opacity-80" style={{ color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mx-6 mb-4 p-1 rounded-lg shrink-0" style={{ background: 'var(--bg-700)' }}>
          {(['general', 'personalization', 'subtitles'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-1.5 rounded-md text-xs font-medium transition-colors capitalize"
              style={{
                background: tab === t ? 'var(--bg-500)' : 'transparent',
                color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-2">
          {tab === 'general' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>TMDB API Key</label>
                <div className="flex gap-2">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={cfg.api_key}
                    onChange={e => setCfg(p => ({ ...p, api_key: e.target.value }))}
                    className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none border transition-colors"
                    style={{ background: 'var(--bg-700)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
                    placeholder="Enter your TMDB API key"
                  />
                  <button
                    onClick={() => setShowKey(s => !s)}
                    className="px-3 rounded-lg border transition-colors hover:opacity-80"
                    style={{ background: 'var(--bg-700)', borderColor: 'var(--bg-400)', color: 'var(--text-muted)' }}
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>TV Shows Path</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cfg.tv_path}
                    onChange={e => setCfg(p => ({ ...p, tv_path: e.target.value }))}
                    className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none border transition-colors"
                    style={{ background: 'var(--bg-700)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
                    placeholder="/path/to/tv/shows"
                  />
                  {window.electronAPI && (
                    <button
                      onClick={async () => {
                        const folder = await window.electronAPI!.selectFolder();
                        if (folder) setCfg(p => ({ ...p, tv_path: folder }));
                      }}
                      className="px-3 rounded-lg border transition-colors hover:opacity-80"
                      style={{ background: 'var(--bg-700)', borderColor: 'var(--bg-400)', color: 'var(--text-muted)' }}
                      title="Browse for folder"
                    >
                      <FolderOpen size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Movies Path</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cfg.movie_path}
                    onChange={e => setCfg(p => ({ ...p, movie_path: e.target.value }))}
                    className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none border transition-colors"
                    style={{ background: 'var(--bg-700)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
                    placeholder="/path/to/movies"
                  />
                  {window.electronAPI && (
                    <button
                      onClick={async () => {
                        const folder = await window.electronAPI!.selectFolder();
                        if (folder) setCfg(p => ({ ...p, movie_path: folder }));
                      }}
                      className="px-3 rounded-lg border transition-colors hover:opacity-80"
                      style={{ background: 'var(--bg-700)', borderColor: 'var(--bg-400)', color: 'var(--text-muted)' }}
                      title="Browse for folder"
                    >
                      <FolderOpen size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>TV Episode Template</label>
                <input
                  type="text"
                  value={cfg.tv_template}
                  onChange={e => setCfg(p => ({ ...p, tv_template: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none border font-mono"
                  style={{ background: 'var(--bg-700)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
                  placeholder="{e:02d}{sep}{title}"
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Vars: <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{'{e:02d}'}</span> ep number, <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{'{title}'}</span> episode title, <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{'{s}'}</span> season, <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{'{sep}'}</span> separator
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Movie Template</label>
                <input
                  type="text"
                  value={cfg.movie_template}
                  onChange={e => setCfg(p => ({ ...p, movie_template: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none border font-mono"
                  style={{ background: 'var(--bg-700)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
                  placeholder="{title} ({year})"
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Vars: <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{'{title}'}</span> movie title, <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{'{year}'}</span> release year
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Separator (for <span className="font-mono">{'{sep}'}</span>)</label>
                <input
                  type="text"
                  value={cfg.pattern}
                  onChange={e => setCfg(p => ({ ...p, pattern: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none border font-mono"
                  style={{ background: 'var(--bg-700)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
                  placeholder=" - "
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Settings Backup</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => window.open('http://127.0.0.1:8765/api/config/export')}
                    className="flex-1 py-1.5 rounded-lg text-xs border transition-colors hover:opacity-80"
                    style={{ borderColor: 'var(--bg-400)', color: 'var(--text-secondary)', background: 'var(--bg-700)' }}
                  >
                    Export Config
                  </button>
                  <label className="flex-1 cursor-pointer">
                    <span className="flex items-center justify-center w-full py-1.5 rounded-lg text-xs border transition-colors hover:opacity-80"
                      style={{ borderColor: 'var(--bg-400)', color: 'var(--text-secondary)', background: 'var(--bg-700)' }}>
                      Import Config
                    </span>
                    <input type="file" accept=".json" className="hidden" onChange={async e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const text = await file.text();
                        const data = JSON.parse(text);
                        const updated = await importConfig(data);
                        setCfg(updated);
                        if (updated.custom_themes?.length === 3) {
                          setCustomThemes(updated.custom_themes);
                          updated.custom_themes.forEach((t, i) => injectCustomThemeCss((i + 1) as 1 | 2 | 3, t));
                        }
                        toast.success('Config imported');
                      } catch {
                        toast.error('Failed to import config');
                      }
                    }} />
                  </label>
                </div>
              </div>

            </div>
          )}

          {tab === 'personalization' && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Theme</label>
                <div className="grid grid-cols-3 gap-2">
                  {BUILTIN_THEMES.map(t => (
                    <button
                      key={t}
                      onClick={() => { setCfg(p => ({ ...p, theme: t })); setTheme(t); }}
                      className="flex items-center gap-2 px-2 py-2 rounded-lg text-xs border transition-colors"
                      style={{
                        background: currentTheme === t ? 'var(--bg-500)' : 'var(--bg-700)',
                        borderColor: currentTheme === t ? 'var(--accent-400)' : 'var(--bg-400)',
                        color: currentTheme === t ? 'var(--accent-400)' : 'var(--text-secondary)',
                      }}
                    >
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: THEME_COLORS[t] }} />
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Custom Themes</label>
                <div className="space-y-2">
                  {customThemes.map((ct, i) => {
                    const slotKey = `Custom${i + 1}` as Theme;
                    const isActive = currentTheme === slotKey;
                    return (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg border"
                        style={{ background: 'var(--bg-700)', borderColor: isActive ? 'var(--accent-400)' : 'var(--bg-400)' }}>

                        {/* Mini preview swatch */}
                        <div className="w-8 h-8 rounded-md shrink-0 border border-white/10 overflow-hidden flex flex-col">
                          <div className="flex-1" style={{ background: ct.bg }} />
                          <div className="h-2" style={{ background: ct.accent }} />
                        </div>

                        {/* Name */}
                        <input
                          type="text"
                          value={ct.name}
                          onChange={e => updateCustomTheme(i as 0|1|2, { name: e.target.value })}
                          className="flex-1 min-w-0 rounded-md px-2 py-1 text-xs border focus:outline-none"
                          style={{ background: 'var(--bg-600)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
                        />

                        {/* BG color picker */}
                        <label className="relative shrink-0 cursor-pointer" title="Background colour">
                          <span className="w-6 h-6 rounded-full border-2 border-white/20 block" style={{ background: ct.bg }} />
                          <input type="color" value={ct.bg}
                            onChange={e => updateCustomTheme(i as 0|1|2, { bg: e.target.value })}
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                        </label>

                        {/* Accent color picker */}
                        <label className="relative shrink-0 cursor-pointer" title="Accent colour">
                          <span className="w-6 h-6 rounded-full border-2 border-white/20 block" style={{ background: ct.accent }} />
                          <input type="color" value={ct.accent}
                            onChange={e => updateCustomTheme(i as 0|1|2, { accent: e.target.value })}
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                        </label>

                        {/* Use button */}
                        <button
                          onClick={() => { setCfg(p => ({ ...p, theme: slotKey })); setTheme(slotKey); }}
                          className="shrink-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                          style={{
                            background: isActive ? 'var(--accent-600)' : 'var(--bg-500)',
                            color: isActive ? '#fff' : 'var(--text-secondary)',
                          }}>
                          {isActive ? 'Active' : 'Use'}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Click the circles to pick background and accent colours. Changes preview live.
                </p>
              </div>
            </div>
          )}

          {tab === 'subtitles' && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Default Model</label>
                <div className="flex gap-1.5 flex-wrap">
                  {WHISPER_MODELS.map(m => (
                    <button key={m} onClick={() => setCfg(p => ({ ...p, whisper_model: m }))}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        background: cfg.whisper_model === m ? 'var(--accent-600)' : 'var(--bg-700)',
                        color: cfg.whisper_model === m ? '#fff' : 'var(--text-secondary)',
                        border: `1px solid ${cfg.whisper_model === m ? 'transparent' : 'var(--bg-400)'}`,
                      }}>
                      {m}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Larger models are more accurate but slower to load and run.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Default Language</label>
                <select
                  value={cfg.whisper_language}
                  onChange={e => setCfg(p => ({ ...p, whisper_language: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none"
                  style={{ background: 'var(--bg-700)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
                >
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Default Beam Size</label>
                <div className="flex gap-1.5">
                  {[1, 5, 10].map(b => (
                    <button key={b} onClick={() => setCfg(p => ({ ...p, whisper_beam_size: b }))}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        background: cfg.whisper_beam_size === b ? 'var(--accent-600)' : 'var(--bg-700)',
                        color: cfg.whisper_beam_size === b ? '#fff' : 'var(--text-secondary)',
                        border: `1px solid ${cfg.whisper_beam_size === b ? 'transparent' : 'var(--bg-400)'}`,
                      }}>
                      {b}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Higher beam size improves accuracy at the cost of speed.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>VAD Filter</label>
                <button
                  onClick={() => setCfg(p => ({ ...p, whisper_vad: !p.whisper_vad }))}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
                  style={{
                    background: cfg.whisper_vad ? 'var(--accent-600)' : 'var(--bg-700)',
                    color: cfg.whisper_vad ? '#fff' : 'var(--text-secondary)',
                    borderColor: cfg.whisper_vad ? 'transparent' : 'var(--bg-400)',
                  }}
                  title="Voice Activity Detection — filters out hallucinated text during music and silence"
                >
                  {cfg.whisper_vad ? 'Enabled' : 'Disabled'}
                </button>
                <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Filters hallucinated text during silence and music. Recommended on.
                </p>
              </div>

              {/* Presets */}
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Presets</label>
                {/* Select / edit / delete row */}
                <div className="flex gap-2 mb-2">
                  <select
                    value={selectedPresetId}
                    onChange={e => handleSelectPreset(e.target.value)}
                    className="flex-1 rounded-lg px-3 py-1.5 text-sm border focus:outline-none"
                    style={{ background: 'var(--bg-700)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
                  >
                    <option value="">{subtitlePresets.length === 0 ? 'No presets saved' : 'Select a preset…'}</option>
                    {subtitlePresets.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {selectedPresetId && (
                    <>
                      <button onClick={handleUpdatePreset}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={{ background: 'var(--accent-600)', color: '#fff' }}
                        title="Overwrite this preset with current settings">
                        Update
                      </button>
                      <button onClick={handleDeletePreset}
                        className="p-2 rounded-lg transition-colors hover:opacity-70"
                        style={{ background: 'var(--bg-600)', color: '#f87171' }}
                        title="Delete preset">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
                {/* Save as new */}
                {savingPreset ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={presetName}
                      onChange={e => setPresetName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') { setSavingPreset(false); setPresetName(''); } }}
                      placeholder="Preset name…"
                      className="flex-1 rounded-lg px-3 py-1.5 text-sm border focus:outline-none"
                      style={{ background: 'var(--bg-700)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
                    />
                    <button onClick={handleSavePreset} disabled={!presetName.trim()}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
                      style={{ background: 'var(--accent-600)', color: '#fff' }}>Save</button>
                    <button onClick={() => { setSavingPreset(false); setPresetName(''); }}
                      className="px-3 py-1.5 rounded-lg text-xs"
                      style={{ background: 'var(--bg-600)', color: 'var(--text-secondary)' }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setSavingPreset(true)}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                    style={{ background: 'var(--bg-600)', color: 'var(--text-secondary)' }}>
                    + Save current as new preset
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border text-sm transition-colors hover:opacity-80"
            style={{ borderColor: 'var(--bg-400)', color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="flex-1 py-2 rounded-lg text-white font-medium text-sm transition-colors"
            style={{ background: 'var(--accent-600)' }}
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
