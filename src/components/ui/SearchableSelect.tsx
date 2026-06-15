import React from 'react';
import { Combobox, ComboboxInput, ComboboxButton, ComboboxOptions, ComboboxOption } from '@headlessui/react';

export interface SearchableSelectOption {
  value: string;
  label: string;
  renderLabel?: () => React.ReactNode;
  groupKey?: string;
  groupLabel?: string;
}

export interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  onInputChange: (value: string) => void;
  inputValue: string;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  clearable?: boolean;
  onClear?: () => void;
  emptyState?: React.ReactNode;
  onInputKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onInputPaste?: React.ClipboardEventHandler<HTMLInputElement>;
  onInputFocus?: React.FocusEventHandler<HTMLInputElement>;
  onInputBlur?: React.FocusEventHandler<HTMLInputElement>;
  onActiveOptionChange?: (value: string | null) => void;
  'aria-label'?: string;
}

export type SearchableSelectHandle = {
  focus: (options?: { open?: boolean; select?: boolean }) => void;
};

const SearchableSelect = React.forwardRef<SearchableSelectHandle, SearchableSelectProps>(function SearchableSelect({
  options,
  value,
  onChange,
  onInputChange,
  inputValue,
  placeholder = 'Search…',
  loading = false,
  disabled = false,
  className = '',
  clearable = false,
  onClear,
  emptyState,
  onInputKeyDown,
  onInputPaste,
  onInputFocus,
  onInputBlur,
  onActiveOptionChange,
  'aria-label': ariaLabel,
}: SearchableSelectProps, ref) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (options.length) return;
    onActiveOptionChange?.(null);
  }, [onActiveOptionChange, options.length]);

  React.useImperativeHandle(ref, () => ({
    focus: ({ open = true, select = true } = {}) => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      if (select) {
        try { input.select(); } catch {}
      }
      if (open) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      }
    },
  }), []);

  return (
    <Combobox value={value} onChange={(val) => val && onChange(val)} disabled={disabled}>
      <div className={`searchable-select ${className}`} style={{ position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <ComboboxInput
            ref={inputRef}
            className="u-input"
            style={{
              paddingRight: clearable && inputValue ? '76px' : '44px',
              width: '100%'
            }}
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            onPaste={onInputPaste}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
            placeholder={placeholder}
            aria-label={ariaLabel}
            onClick={(e) => {
              // Auto-open dropdown when clicking the input
              e.currentTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
            }}
          />

          {/* Clear button (appears when there's input and clearable is true) */}
          {clearable && inputValue && onClear && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClear();
              }}
              aria-label="Clear input"
              style={{
                position: 'absolute',
                right: 36,
                top: '50%',
                transform: 'translateY(-50%)',
                border: '1px solid var(--border)',
                background: 'var(--panel-subtle)',
                color: 'var(--muted)',
                cursor: 'pointer',
                padding: 0,
                width: 28,
                height: 28,
                fontSize: '16px',
                lineHeight: '1',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text)';
                e.currentTarget.style.background = 'var(--hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--muted)';
                e.currentTarget.style.background = 'var(--panel-subtle)';
              }}
            >
              ✕
            </button>
          )}

          {/* Dropdown arrow button */}
          <ComboboxButton
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              border: 'none',
              background: 'transparent',
              color: 'var(--muted)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 0.2s ease, color 0.15s ease'
            }}
            aria-label="Toggle options"
            onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.currentTarget.style.color = 'var(--text)';
            }}
            onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.currentTarget.style.color = 'var(--muted)';
            }}
          >
            {loading ? (
              <span
                style={{
                  display: 'inline-block',
                  width: '14px',
                  height: '14px',
                  border: '2px solid var(--border)',
                  borderTop: '2px solid var(--accent)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}
              />
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="currentColor"
                style={{
                  transition: 'transform 0.2s ease'
                }}
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </ComboboxButton>
        </div>

        <ComboboxOptions
          style={{
            position: 'absolute',
            zIndex: 50,
            top: '100%',
            left: 0,
            right: 0,
            maxHeight: 'min(420px, 52vh)',
            overflow: 'auto',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            marginTop: '4px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15), 0 4px 10px rgba(0, 0, 0, 0.1)',
            padding: '4px'
          }}
        >
          {options.length === 0 ? (
            <div
              style={{
                padding: '12px 16px',
                color: 'var(--muted)',
                fontSize: '14px',
                textAlign: typeof emptyState === 'string' || !emptyState ? 'center' : 'initial'
              }}
            >
              {loading ? 'Loading…' : (emptyState ?? 'No results found')}
            </div>
          ) : (
            options.map((option, index) => {
              const previous = options[index - 1];
              const showGroupHeader = !!option.groupKey && option.groupKey !== previous?.groupKey;
              return (
                <React.Fragment key={option.value}>
                  {showGroupHeader ? (
                    <div
                      style={{
                        padding: '8px 10px 4px',
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0,
                        textTransform: 'uppercase',
                        color: 'var(--muted)',
                      }}
                    >
                      {option.groupLabel || option.groupKey}
                    </div>
                  ) : null}
                  <ComboboxOption
                    value={option.value}
                    style={{ cursor: 'pointer' }}
                  >
                    {({ focus, selected }) => (
                      <OptionRow
                        focus={focus}
                        option={option}
                        selected={selected}
                        onActiveOptionChange={onActiveOptionChange}
                      />
                    )}
                  </ComboboxOption>
                </React.Fragment>
              );
            })
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  );
});

export default SearchableSelect;

function OptionRow({
  option,
  focus,
  selected,
  onActiveOptionChange,
}: {
  option: SearchableSelectOption;
  focus: boolean;
  selected: boolean;
  onActiveOptionChange?: (value: string | null) => void;
}) {
  React.useEffect(() => {
    if (!focus) return;
    onActiveOptionChange?.(option.value);
  }, [focus, onActiveOptionChange, option.value]);

  return (
    <div
      style={{
        padding: '8px 12px',
        borderRadius: '6px',
        background: focus ? 'var(--accent-row)' : 'transparent',
        color: selected ? 'var(--accent)' : 'var(--text)',
        fontWeight: selected ? 600 : 400,
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'background 0.15s ease'
      }}
    >
      {selected && (
        <svg
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="currentColor"
          style={{ flexShrink: 0 }}
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      )}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {option.renderLabel ? option.renderLabel() : option.label}
      </div>
    </div>
  );
}
