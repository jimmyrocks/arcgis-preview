import React from 'react';

type Props = {
  onClick: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  title?: string;
  ariaLabel?: string;
  className?: string;
};

export default function FlashButton({ onClick, children, style, title, ariaLabel, className }: Props) {
  const [flash, setFlash] = React.useState(false);
  function handleClick() {
    try { setFlash(true); setTimeout(() => setFlash(false), 350); } catch {}
    onClick();
  }
  return (
    <button
      onClick={handleClick}
      title={title}
      aria-label={ariaLabel}
      className={className}
      style={{
        padding: '10px 14px',
        fontSize: 16,
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: flash ? 'var(--hover)' : 'var(--panel-subtle)',
        color: 'var(--text)',
        cursor: 'pointer',
        transition: 'background-color 250ms ease',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
