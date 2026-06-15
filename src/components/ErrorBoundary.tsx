import React from 'react';

type Props = { children: React.ReactNode; onReset?: () => void };
type State = { hasError: boolean; message?: string };

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err: any): State {
    try { return { hasError: true, message: String(err && err.message || err || 'Error') }; } catch { return { hasError: true }; }
  }
  componentDidCatch(error: any, info: any) {
    try { console.error('[ErrorBoundary]', error, info); } catch {}
  }
  handleReset = () => {
    this.setState({ hasError: false, message: '' });
    try { this.props.onReset?.(); } catch {}
  };
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--panel)', color: 'var(--text)', zIndex: 2000 }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, maxWidth: 520, textAlign: 'center', background: 'var(--panel-subtle)' }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Something went wrong rendering the map</div>
            {this.state.message ? (<div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 10 }}>{this.state.message}</div>) : null}
            <button onClick={this.handleReset} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer' }}>Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

