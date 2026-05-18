import { useState, useEffect } from 'react';
import { X, Undo2, ArrowRight, Loader2 } from 'lucide-react';
import { getUndoPreview, undoRename } from '../api/client';
import type { UndoPair } from '../api/client';

interface Props {
  onClose: () => void;
  onConfirm: (restoredCount: number) => void;
}

export function UndoModal({ onClose, onConfirm }: Props) {
  const [pairs, setPairs] = useState<UndoPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUndoPreview()
      .then(data => setPairs(data.pairs))
      .catch(() => setError('Could not load undo history'))
      .finally(() => setLoading(false));
  }, []);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const result = await undoRename();
      onConfirm(result.restored.length);
    } catch {
      setError('Undo failed');
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.72)' }}>
      <div className="rounded-xl border shadow-2xl w-full max-w-lg flex flex-col" style={{ background: 'var(--bg-800)', borderColor: 'var(--border)', maxHeight: '80vh' }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <Undo2 size={15} style={{ color: 'var(--accent-400)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Undo Rename</h2>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>— review before restoring</span>
          <button onClick={onClose} className="ml-auto hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-400)' }} />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-24 text-sm" style={{ color: '#f87171' }}>
              {error}
            </div>
          ) : pairs.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm" style={{ color: 'var(--text-muted)' }}>
              Nothing to undo
            </div>
          ) : (
            <div className="p-4 space-y-1">
              {pairs.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded" style={{ background: 'var(--bg-700)' }}>
                  <span className="truncate flex-1 font-mono" style={{ color: 'var(--text-secondary)' }} title={p.current}>
                    {p.current}
                  </span>
                  <ArrowRight size={11} className="shrink-0" style={{ color: 'var(--accent-400)' }} />
                  <span className="truncate flex-1 font-mono" style={{ color: 'var(--text-primary)' }} title={p.original}>
                    {p.original}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-3 border-t shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--bg-700)' }}>
          {!loading && !error && pairs.length > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {pairs.length} file{pairs.length !== 1 ? 's' : ''} will be restored
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs transition-colors"
              style={{ background: 'var(--bg-500)', color: 'var(--text-secondary)' }}>
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={confirming || loading || !!error || pairs.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--accent-600)' }}>
              {confirming ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
              {confirming ? 'Restoring…' : 'Confirm Undo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
