import React from 'react';
import type { MapRenderIssue } from '../lib/mapRenderIssue';

type Props = {
  issue: MapRenderIssue;
  serviceUrl?: string | null;
  canSwitchToInteractive?: boolean;
  canClearFilter?: boolean;
  onRetry: () => void;
  onSwitchToInteractive?: () => void;
  onClearFilter?: () => void;
  onDismiss: () => void;
};

export default function MapRenderNotice({
  issue,
  serviceUrl,
  canSwitchToInteractive,
  canClearFilter,
  onRetry,
  onSwitchToInteractive,
  onClearFilter,
  onDismiss,
}: Props) {
  return (
    <section className="map-render-notice" role="alert" aria-labelledby="map-render-notice-title">
      <button type="button" className="map-render-notice-close" onClick={onDismiss} aria-label="Dismiss map error">×</button>
      <div className="map-render-notice-icon" aria-hidden>!</div>
      <div className="map-render-notice-content">
        <h2 id="map-render-notice-title">{issue.title}</h2>
        <p>{issue.message}</p>
        <div className="map-render-notice-actions">
          <button type="button" className="u-btn u-btn-primary" onClick={onRetry}>Retry</button>
          {canClearFilter && onClearFilter ? <button type="button" className="u-btn" onClick={onClearFilter}>Clear filter</button> : null}
          {canSwitchToInteractive && onSwitchToInteractive ? <button type="button" className="u-btn" onClick={onSwitchToInteractive}>Use Interactive features</button> : null}
          {serviceUrl ? <a className="u-btn" href={serviceUrl} target="_blank" rel="noreferrer noopener">Open service</a> : null}
        </div>
        {issue.technicalDetail ? (
          <details className="map-render-notice-details">
            <summary>Technical details</summary>
            <code>{issue.technicalDetail}</code>
          </details>
        ) : null}
      </div>
    </section>
  );
}
