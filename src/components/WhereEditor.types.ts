import React from 'react';

export type WhereEditorHandle = {
  insertAtCursor: (text: string) => void;
  insertSnippet: (text: string, cursorBack: number) => void;
  focus: () => void;
};

export type WhereEditorProps = {
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
  onCommit?: () => void;
  'aria-label'?: string;
  height?: string; // e.g., '32px', '120px'
  wrap?: boolean;  // enable soft-wrap for multi-line
  fields?: string[];
  fieldsMeta?: Array<{ name: string; type?: string; length?: number }>;
  valueSamples?: Record<string, unknown[]>;
  keywords?: string[]; // override default minimal keyword/operator list
  fieldAliases?: Record<string, string>; // name -> alias label
  // Which key applies the change: 'enter' (default) or 'mod-enter'
  commitKey?: 'enter' | 'mod-enter';
  readOnly?: boolean;
  // Load the CodeMirror editor immediately or only after interaction.
  richLoad?: 'immediate' | 'on-focus' | 'never';
  // Accept arbitrary props like id, className, style, etc.
  [key: string]: any;
};
