import { useEffect, useState } from 'react';
import { CheckCircle2, FolderOpen, Loader2, Settings2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { checkFFmpeg, saveConfig } from '../api/client';

interface Props {
  initialApiKey: string;
  initialTvPath: string;
  initialMoviePath: string;
  initialPattern: string;
  onComplete: () => void;
  onSkip: () => void;
}

type FFmpegStatus = 'checking' | 'available' | 'missing';

export function FirstRunSetup({ initialApiKey, initialTvPath, initialMoviePath, initialPattern, onComplete, onSkip }: Props) {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [tvPath, setTvPath] = useState(initialTvPath === '/' ? '' : initialTvPath);
  const [moviePath, setMoviePath] = useState(initialMoviePath === '/' ? '' : initialMoviePath);
  const [pattern, setPattern] = useState(initialPattern || ' - ');
  const [ffmpegStatus, setFfmpegStatus] = useState<FFmpegStatus>('checking');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkFFmpeg()
      .then(result => setFfmpegStatus(result.available ? 'available' : 'missing'))
      .catch(() => setFfmpegStatus('missing'));
  }, []);

  const save = async () => {
    if (!apiKey.trim()) {
      toast.error('Add a TMDB API key first');
      return;
    }
    if (!tvPath.trim() && !moviePath.trim()) {
      toast.error('Set at least one library path');
      return;
    }

    setSaving(true);
    try {
      await saveConfig({ api_key: apiKey.trim(), tv_path: tvPath.trim(), movie_path: moviePath.trim(), pattern });
      toast.success('Setup saved');
      onComplete();
    } catch {
      toast.error('Failed to save setup');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg-800)', borderColor: 'var(--border)' }}
      >
        <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--bg-600)', color: 'var(--accent-400)' }}>
              <Settings2 size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>First-run setup</h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Connect Matchbox to your media library.</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>TMDB API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={event => setApiKey(event.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none border transition-colors"
              style={{ background: 'var(--bg-700)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
              placeholder="Paste your TMDB API key"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>TV Shows Path</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tvPath}
                onChange={event => setTvPath(event.target.value)}
                className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none border transition-colors"
                style={{ background: 'var(--bg-700)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
                placeholder="/path/to/tv/shows"
              />
              {window.electronAPI && (
                <button
                  onClick={async () => { const f = await window.electronAPI?.selectFolder(); if (f) setTvPath(f); }}
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
                value={moviePath}
                onChange={event => setMoviePath(event.target.value)}
                className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none border transition-colors"
                style={{ background: 'var(--bg-700)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
                placeholder="/path/to/movies"
              />
              {window.electronAPI && (
                <button
                  onClick={async () => { const f = await window.electronAPI?.selectFolder(); if (f) setMoviePath(f); }}
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
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Rename Separator</label>
            <input
              type="text"
              value={pattern}
              onChange={event => setPattern(event.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none border transition-colors"
              style={{ background: 'var(--bg-700)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
              placeholder=" - "
            />
          </div>

          <div className="rounded-lg border px-3 py-2 flex items-center gap-2" style={{ borderColor: 'var(--bg-400)', background: 'var(--bg-700)' }}>
            {ffmpegStatus === 'checking' && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
            {ffmpegStatus === 'available' && <CheckCircle2 size={16} className="text-green-400" />}
            {ffmpegStatus === 'missing' && <XCircle size={16} className="text-amber-400" />}
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              FFmpeg {ffmpegStatus === 'checking' ? 'check in progress' : ffmpegStatus === 'available' ? 'is available' : 'was not found'}
            </span>
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onSkip}
            className="px-4 py-2 rounded-lg border text-sm transition-colors hover:opacity-80"
            style={{ borderColor: 'var(--bg-400)', color: 'var(--text-secondary)' }}
            disabled={saving}
          >
            Skip
          </button>
          <button
            onClick={save}
            className="px-4 py-2 rounded-lg text-white font-medium text-sm transition-colors disabled:opacity-60"
            style={{ background: 'var(--accent-600)' }}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Finish Setup'}
          </button>
        </div>
      </div>
    </div>
  );
}
