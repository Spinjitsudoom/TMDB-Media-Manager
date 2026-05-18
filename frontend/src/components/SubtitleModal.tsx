import { useState, useEffect, useRef } from 'react';
import { X, Captions, CheckSquare, Square, Loader2, CheckCircle2, XCircle, AlertCircle, Minimize2 } from 'lucide-react';
import { getFiles, checkWhisper, getAudioTracks, getPresets, getConfig } from '../api/client';
import type { FileAudioTracks, Preset } from '../api/client';

interface ProgressItem {
  file: string;
  out?: string;
  status: 'pending' | 'loading_model' | 'running' | 'done' | 'error';
  error?: string;
  progress?: number;
}

interface Props {
  folderPath: string;
  visible: boolean;
  onClose: () => void;
  onBackground: () => void;
  onComplete: (done: number, errors: number) => void;
}

export function SubtitleModal({ folderPath, visible, onClose, onBackground, onComplete }: Props) {
  const [files, setFiles] = useState<string[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [whisperOk, setWhisperOk] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [model, setModel] = useState('base');
  const [language, setLanguage] = useState('');
  const [vad, setVad] = useState(true);
  const [beamSize, setBeamSize] = useState(5);
  const [prompt, setPrompt] = useState('');
  const [audioTrack, setAudioTrack] = useState<number | null>(null);
  const [maxAudioTracks, setMaxAudioTracks] = useState(0);
  const [fileAudioData, setFileAudioData] = useState<FileAudioTracks[]>([]);
  const [loadingAudioTracks, setLoadingAudioTracks] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    getPresets('subtitles').then(setPresets).catch(() => {});
    getConfig().then(c => {
      setModel(c.whisper_model || 'base');
      setLanguage(c.whisper_language || '');
      setBeamSize(c.whisper_beam_size ?? 5);
      setVad(c.whisper_vad ?? true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      getFiles(folderPath).catch(() => [] as string[]),
      checkWhisper().catch(() => ({ available: false, models: [] })),
    ]).then(([list, wCheck]) => {
      setFiles(list);
      setSelected(new Set(list));
      setWhisperOk(wCheck.available);
      setLoadingFiles(false);
      if (list.length > 0) {
        setLoadingAudioTracks(true);
        getAudioTracks(folderPath, list)
          .then(r => { setMaxAudioTracks(r.max_audio_tracks); setFileAudioData(r.files); })
          .catch(() => {})
          .finally(() => setLoadingAudioTracks(false));
      }
    });
    return () => { abortRef.current?.abort(); };
  }, [folderPath]);

  useEffect(() => {
    if (isDone && !running && !visibleRef.current) {
      const done = progress.filter(p => p.status === 'done').length;
      const errors = progress.filter(p => p.status === 'error').length;
      onComplete(done, errors);
    }
  }, [isDone, running]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFile = (f: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(f) ? next.delete(f) : next.add(f);
      return next;
    });
  };

  const toggleAll = () =>
    setSelected(prev => prev.size === files.length ? new Set() : new Set(files));

  const handleStart = async () => {
    const filesToProcess = files.filter(f => selected.has(f));
    if (!filesToProcess.length) return;

    setRunning(true);
    setIsDone(false);
    setProgress(filesToProcess.map(f => ({ file: f, status: 'pending' })));

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const resp = await fetch('http://127.0.0.1:8765/api/whisper', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder_path: folderPath,
          files: filesToProcess,
          model,
          language: language || null,
          vad_filter: vad,
          beam_size: beamSize,
          initial_prompt: prompt || null,
          audio_track: audioTrack,
        }),
      });

      if (!resp.ok) throw new Error('Request failed');

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.status === 'complete') { setIsDone(true); break; }
            if (ev.status === 'loading_model') {
              setProgress(prev => prev.map(p =>
                p.status === 'pending' ? { ...p, status: 'loading_model' } : p
              ));
            } else {
              setProgress(prev => prev.map(p =>
                p.file === ev.file ? { ...p, ...ev } : p
              ));
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setProgress(prev => prev.map(p =>
          (p.status === 'pending' || p.status === 'running' || p.status === 'loading_model')
            ? { ...p, status: 'error', error: 'Connection lost' }
            : p
        ));
      }
    } finally {
      setRunning(false);
      setIsDone(true);
    }
  };

  const audioTrackLabel = (pos: number): string => {
    const tracks = fileAudioData.map(f => f.tracks[pos - 1]).filter(Boolean);
    const lang = tracks.map(t => t.language).find(Boolean);
    const title = tracks.map(t => t.title).find(Boolean);
    const suffix = [lang, title].filter(Boolean).join(' · ');
    return suffix ? `Track ${pos} — ${suffix}` : `Track ${pos}`;
  };

  const handleLoadPreset = (id: string) => {
    setSelectedPresetId(id);
    const p = presets.find(p => p.id === id);
    if (!p) return;
    const s = p.settings;
    if (typeof s.model === 'string') setModel(s.model);
    if (typeof s.language === 'string') setLanguage(s.language);
    setVad(Boolean(s.vad_filter ?? s.vad));
    if (typeof s.beam_size === 'number') setBeamSize(s.beam_size);
    if (typeof s.prompt === 'string') setPrompt(s.prompt);
    setAudioTrack(typeof s.audio_track === 'number' ? s.audio_track : null);
  };

  const selectedCount = files.filter(f => selected.has(f)).length;
  const completedCount = progress.filter(p => p.status === 'done' || p.status === 'error').length;
  const isLoadingModel = running && progress.length > 0 && completedCount === 0 &&
    progress.some(p => p.status === 'loading_model');
  const barProgress = progress.length === 0 ? 0 : progress.reduce((sum, p) => {
    if (p.status === 'done' || p.status === 'error') return sum + 1;
    if (p.status === 'running' && p.progress != null) return sum + p.progress / 100;
    return sum;
  }, 0) / progress.length * 100;

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.72)' }}>
      <div className="rounded-xl border shadow-2xl w-full max-w-xl flex flex-col" style={{ background: 'var(--bg-800)', borderColor: 'var(--border)', maxHeight: '85vh' }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <Captions size={15} style={{ color: 'var(--accent-400)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Generate Subtitles</h2>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>— AI via Whisper → .srt</span>
          <div className="ml-auto flex items-center gap-1">
            {running && (
              <button
                onClick={onBackground}
                title="Run in background"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs hover:opacity-80 transition-opacity"
                style={{ color: 'var(--text-muted)' }}
              >
                <Minimize2 size={13} />
                Background
              </button>
            )}
            <button onClick={() => { abortRef.current?.abort(); onClose(); }} className="p-1 hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Whisper missing warning */}
        {whisperOk === false && (
          <div className="flex items-center gap-2 px-5 py-3 text-xs" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
            <AlertCircle size={14} />
            faster-whisper not installed — run: <code className="mx-1 px-1 rounded" style={{ background: 'rgba(0,0,0,0.3)' }}>uv add faster-whisper</code>
          </div>
        )}

        {/* Config rows */}
        {!running && !isDone && (
          <div className="border-b shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--bg-700)' }}>
            {/* Row 1: audio track */}
            <div className="flex items-center gap-3 px-5 py-2.5 flex-wrap">
              <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>Audio track</span>
              <select
                value={audioTrack ?? ''}
                onChange={e => setAudioTrack(e.target.value ? Number(e.target.value) : null)}
                disabled={loadingAudioTracks || maxAudioTracks === 0}
                className="rounded px-2 py-0.5 text-xs border focus:outline-none disabled:opacity-50"
                style={{ background: 'var(--bg-600)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)', minWidth: 160 }}
              >
                <option value="">{loadingAudioTracks ? 'Checking...' : 'Auto (default)'}</option>
                {Array.from({ length: maxAudioTracks }, (_, i) => i + 1).map(pos => (
                  <option key={pos} value={pos}>{audioTrackLabel(pos)}</option>
                ))}
              </select>
              <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
                {model}{language ? ` · ${language}` : ''} · beam {beamSize}{vad ? ' · VAD' : ''}
              </span>
            </div>
            {/* Row 2: initial prompt */}
            <div className="flex items-center gap-3 px-5 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>Prompt</span>
              <input
                type="text"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="e.g. Ghosts. Characters: Jay, Alison, Pat, Robin, Thomas…"
                className="flex-1 rounded px-2.5 py-1 text-xs border focus:outline-none"
                style={{ background: 'var(--bg-600)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
              />
            </div>
            {/* Preset row */}
            <div className="flex items-center gap-2 px-5 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>Presets</span>
              <select
                value={selectedPresetId}
                onChange={e => handleLoadPreset(e.target.value)}
                className="rounded px-2 py-0.5 text-xs border focus:outline-none flex-1"
                style={{ background: 'var(--bg-600)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
              >
                <option value="">{presets.length === 0 ? 'No presets — manage in Settings' : 'Load a preset…'}</option>
                {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {running && progress.length > 0 && (
          <div className="shrink-0">
            <div className="w-full h-1.5" style={{ background: 'var(--bg-500)' }}>
              {isLoadingModel ? (
                <div className="h-1.5 w-full animate-pulse" style={{ background: 'var(--accent-500)', opacity: 0.5 }} />
              ) : (
                <div className="h-1.5 transition-all duration-500 rounded-r"
                  style={{ width: `${Math.max(2, barProgress)}%`, background: 'var(--accent-500)' }} />
              )}
            </div>
            <div className="flex items-center justify-between px-5 py-1">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {isLoadingModel ? 'Loading model…' : `${completedCount} / ${progress.length} files`}
              </span>
              <span className="text-xs font-mono font-medium" style={{ color: 'var(--accent-400)' }}>
                {isLoadingModel ? '—' : `${Math.round(barProgress)}%`}
              </span>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loadingFiles ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-400)' }} />
            </div>
          ) : progress.length > 0 ? (
            <div className="p-4 space-y-1">
              {progress.map(p => (
                <div key={p.file} className="flex items-center gap-2.5 text-xs py-1">
                  {p.status === 'pending'       && <div className="w-3.5 h-3.5 rounded-full border-2 shrink-0" style={{ borderColor: 'var(--bg-400)' }} />}
                  {p.status === 'loading_model' && <Loader2 size={14} className="animate-spin shrink-0" style={{ color: 'var(--text-muted)' }} />}
                  {p.status === 'running'       && <Loader2 size={14} className="animate-spin shrink-0" style={{ color: 'var(--accent-400)' }} />}
                  {p.status === 'done'          && <CheckCircle2 size={14} className="text-green-400 shrink-0" />}
                  {p.status === 'error'         && <XCircle size={14} className="text-red-400 shrink-0" />}
                  <span className="truncate flex-1" style={{
                    color: p.status === 'error' ? '#f87171'
                      : p.status === 'done' ? '#4ade80'
                      : 'var(--text-secondary)',
                  }}>
                    {p.status === 'done' && p.out ? p.out : p.file}
                  </span>
                  {p.status === 'loading_model' && (
                    <span className="shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>loading model…</span>
                  )}
                  {p.status === 'error' && p.error && (
                    <span className="text-red-400 truncate max-w-[16rem] shrink-0 font-mono text-[10px]" title={p.error}>{p.error}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
              <button onClick={toggleAll}
                className="flex items-center gap-2 w-full px-5 py-2.5 border-b text-xs hover:opacity-80 transition-opacity"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                {selected.size === files.length
                  ? <CheckSquare size={13} style={{ color: 'var(--accent-400)' }} />
                  : <Square size={13} />}
                <span>{selected.size === files.length ? 'Deselect all' : 'Select all'}</span>
                <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>{selectedCount} / {files.length} selected</span>
              </button>
              {files.map(f => (
                <button key={f} onClick={() => toggleFile(f)}
                  className="flex items-center gap-2.5 w-full px-5 py-2 border-b text-left hover:opacity-80 transition-opacity"
                  style={{ borderColor: 'var(--border)' }}>
                  {selected.has(f)
                    ? <CheckSquare size={13} style={{ color: 'var(--accent-400)' }} />
                    : <Square size={13} style={{ color: 'var(--text-muted)' }} />}
                  <span className="text-xs truncate flex-1" style={{ color: 'var(--text-primary)' }}>{f}</span>
                  <span className="text-xs shrink-0 uppercase" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                    {f.split('.').pop()}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-3 border-t shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--bg-700)' }}>
          {running && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Transcribing…</span>
          )}
          {isDone && !running && (
            <span className="text-xs text-green-400">
              Done — {progress.filter(p => p.status === 'done').length} subtitles generated
              {progress.filter(p => p.status === 'error').length > 0 && `, ${progress.filter(p => p.status === 'error').length} failed`}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => { abortRef.current?.abort(); onClose(); }}
              className="px-3 py-1.5 rounded-lg text-xs transition-colors"
              style={{ background: 'var(--bg-500)', color: 'var(--text-secondary)' }}>
              {isDone ? 'Close' : 'Cancel'}
            </button>
            {!isDone && (
              <button
                onClick={handleStart}
                disabled={running || selectedCount === 0 || whisperOk === false}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--accent-600)' }}>
                {running ? <Loader2 size={13} className="animate-spin" /> : <Captions size={13} />}
                {running ? 'Transcribing…' : `Generate for ${selectedCount} File${selectedCount !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
