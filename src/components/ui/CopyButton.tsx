import React from 'react';
import CopyIcon from '../icons/CopyIcon';

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  const [isCoarse, setIsCoarse] = React.useState<boolean>(() => {
    try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
  });
  React.useEffect(() => {
    try {
      const mql = window.matchMedia('(pointer: coarse)');
      const handler = () => setIsCoarse(mql.matches);
      if (typeof mql.addEventListener === 'function') mql.addEventListener('change', handler);
      else if (typeof (mql as any).addListener === 'function') (mql as any).addListener(handler);
      return () => {
        if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', handler);
        else if (typeof (mql as any).removeListener === 'function') (mql as any).removeListener(handler);
      };
    } catch { return; }
  }, []);
  async function copy() {
    const t = text || '';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(t);
      } else {
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand('copy'); } catch {}
        document.body.removeChild(ta);
      }
    } catch {}
    try { setCopied(true); window.setTimeout(() => setCopied(false), 1200); } catch {}
  }
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button onClick={copy} title={copied ? 'Copied!' : 'Copy to clipboard'} aria-label="Copy to clipboard" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: isCoarse ? 28 : 22, height: isCoarse ? 28 : 22, borderRadius: 6, border: '1px solid var(--border)', background: copied ? 'var(--hover)' : 'var(--panel-subtle)', color: 'var(--text)', cursor: 'pointer', transition: 'background-color 200ms ease', padding: '0px' }}>
        {copied ? (
          <span aria-hidden="true" style={{ fontSize: isCoarse ? 14 : 12 }}>✓</span>
        ) : (
          <CopyIcon size={isCoarse ? 22 : 20} />
        )}
      </button>
      {copied && (
        <span style={{ position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)', background: 'var(--panel-strong)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 6px', fontSize: 10, whiteSpace: 'nowrap', pointerEvents: 'none' }}>Copied!</span>
      )}
    </span>
  );
}
