import { useState } from 'react';
import { X, Plus, Minus, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface Segment { startTime: string; name: string }

interface ProgressItem {
  segment: number;
  status: 'pending' | 'running' | 'done' | 'error';
  file: string;
  error?: string;
}

interface Props { folderPath: string; filename: string; onClose: () => void }

function defaultSegments(filename: string): Segment[] {
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
  const stem = filename.slice(0, filename.length - ext.length);
  return [
    { startTime: '00:00:00', name: `${stem}_part1${ext}` },
    { startTime: '00:30:00', name: `${stem}_part2${ext}` },
  ];
}

export function SplitModal({ folderPath, filename, onClose }: Props) {
  const [segments, setSegments] = useState<Segment[]>(defaultSegments(filename));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [done, setDone] = useState(false);

  const addSegment = () => {
    const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
    const stem = filename.slice(0, filename.length - ext.length);
    setSegments(prev => [...prev, { startTime: '00:00:00', name: `${stem}_part${prev.length + 1}${ext}` }]);
  };

  const removeSegment = () => {
    if (segments.length <= 2) return;
    setSegments(prev => prev.slice(0, -1));
  };

  const updateSegment = (i: number, patch: Partial<Segment>) => {
    setSegments(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };

  const handleSplit = async () => {
    setRunning(true);
    setProgress(segments.map((s, i) => ({ segment: i + 1, status: 'pending', file: s.name })));

    const splits = segments.slice(1).map(s => s.startTime);
    const output_names = segments.map(s => s.name);

    try {
      const resp = await fetch('http://127.0.0.1:8765/api/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_path: folderPath, filename, splits, output_names }),
      });
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const ev = JSON.parse(line.slice(6));
          if (ev.status === 'complete') { setDone(true); break; }
          setProgress(prev => prev.map(p =>
            p.segment === ev.segment
              ? { ...p, status: ev.status, error: ev.error }
              : p
          ));
        }
      }
    } catch (e: any) {
      setProgress(prev => prev.map(p => p.status === 'running' || p.status === 'pending'
        ? { ...p, status: 'error', error: String(e) } : p));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="rounded-2xl w-full max-w-lg shadow-2xl border flex flex-col"
        style={{ background: 'var(--bg-800)', borderColor: 'var(--border)', maxHeight: '90vh' }}>

        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Split File</h2>
            <p className="text-xs mt-0.5 font-mono truncate max-w-xs" style={{ color: 'var(--text-muted)' }}>{filename}</p>
          </div>
          <button onClick={onClose} className="transition-colors hover:opacity-80" style={{ color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-3">
          {!running && !done && (
            <>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Define split points. Segment 1 always starts at 00:00:00. Each subsequent segment starts at the time you specify.
              </p>
              {segments.map((seg, i) => (
                <div key={i} className="flex items-center gap-2 p-3 rounded-lg border"
                  style={{ background: 'var(--bg-700)', borderColor: 'var(--bg-400)' }}>
                  <span className="text-xs font-medium w-16 shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {i === 0 ? 'Part 1' : `Part ${i + 1}`}
                  </span>
                  <input
                    type="text"
                    value={seg.startTime}
                    disabled={i === 0}
                    onChange={e => updateSegment(i, { startTime: e.target.value })}
                    placeholder="HH:MM:SS"
                    className="w-24 rounded-md px-2 py-1 text-xs font-mono border focus:outline-none disabled:opacity-40"
                    style={{ background: 'var(--bg-600)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
                  />
                  <input
                    type="text"
                    value={seg.name}
                    onChange={e => updateSegment(i, { name: e.target.value })}
                    className="flex-1 min-w-0 rounded-md px-2 py-1 text-xs font-mono border focus:outline-none"
                    style={{ background: 'var(--bg-600)', borderColor: 'var(--bg-400)', color: 'var(--text-primary)' }}
                  />
                </div>
              ))}
              <div className="flex gap-2">
                <button onClick={addSegment}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors"
                  style={{ background: 'var(--bg-600)', color: 'var(--text-secondary)' }}>
                  <Plus size={12} /> Add part
                </button>
                {segments.length > 2 && (
                  <button onClick={removeSegment}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors"
                    style={{ background: 'var(--bg-600)', color: 'var(--text-secondary)' }}>
                    <Minus size={12} /> Remove last
                  </button>
                )}
              </div>
            </>
          )}

          {(running || done) && (
            <div className="space-y-2 py-2">
              {progress.map(p => (
                <div key={p.segment} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-700)' }}>
                  {p.status === 'done' && <CheckCircle2 size={14} className="text-green-400 shrink-0" />}
                  {p.status === 'error' && <XCircle size={14} className="text-red-400 shrink-0" />}
                  {p.status === 'running' && <Loader2 size={14} className="animate-spin shrink-0" style={{ color: 'var(--accent-400)' }} />}
                  {p.status === 'pending' && <div className="w-3.5 h-3.5 rounded-full border-2 shrink-0" style={{ borderColor: 'var(--bg-400)' }} />}
                  <span className="flex-1 text-xs font-mono truncate" style={{ color: 'var(--text-primary)' }}>{p.file}</span>
                  {p.error && <span className="text-xs text-red-400 truncate max-w-[160px]">{p.error}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg border text-sm transition-colors hover:opacity-80"
            style={{ borderColor: 'var(--bg-400)', color: 'var(--text-secondary)' }}>
            {done ? 'Close' : 'Cancel'}
          </button>
          {!done && (
            <button onClick={handleSplit} disabled={running}
              className="flex-1 py-2 rounded-lg text-white font-medium text-sm disabled:opacity-50"
              style={{ background: 'var(--accent-600)' }}>
              {running ? 'Splitting…' : 'Split'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
