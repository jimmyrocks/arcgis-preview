import React from 'react';
import type { FeatureCollection } from 'geojson';
import type { GeometryStyleOptions, AttributeStyleOptions, StyleMode } from '../../../lib/styleOptions';
import { DEFAULT_POINT_ICON_ID, POINT_ICON_ALIGNMENT_OPTIONS, POINT_ICON_ANCHOR_OPTIONS, POINT_ICON_OPTIONS, defaultStyleOptions } from '../../../lib/styleOptions';
import { describeArcgisRenderer, getRenderableArcgisRenderer, pickArcgisRendererSymbol } from '../../../lib/arcgisRenderer';
import AttributeStyleEditor from '../components/AttributeStyleEditor';

export default function StyleTab({
  mode = 'server',
  options = {},
  geometryType,
  onModeChange,
  onOptionsChange,
  layerOpacity = 1,
  onLayerOpacityChange,
  attributeStyle,
  onAttributeStyleChange,
  fields,
  featureCollection,
  renderer,
  renderMode = 'feature',
}: {
  mode?: StyleMode;
  options?: GeometryStyleOptions;
  geometryType?: string | null;
  renderMode?: 'feature' | 'dynamic' | 'fallback_dynamic' | 'image' | 'vector';
  renderer?: any;
  onModeChange?: (mode: StyleMode) => void;
  onOptionsChange?: (opts: GeometryStyleOptions) => void;
  layerOpacity?: number;
  onLayerOpacityChange?: (v: number) => void;
  attributeStyle?: AttributeStyleOptions;
  onAttributeStyleChange?: (a: AttributeStyleOptions) => void;
  fields?: Array<{ name: string; type?: string; alias?: string }>;
  featureCollection?: FeatureCollection;
}) {
  const isRaster = renderMode === 'dynamic' || renderMode === 'fallback_dynamic' || renderMode === 'image';
  // 'attribute' is treated as "custom + color by field" — both are "custom" from the user's perspective
  const isServer = mode === 'server';
  const isCustom = mode === 'custom' || mode === 'attribute';
  const isAttribute = !isRaster && mode === 'attribute';
  const kind = inferKind(geometryType);
  const serverRenderer = React.useMemo(() => isRaster ? null : getRenderableArcgisRenderer(renderer), [isRaster, renderer]);
  const hasServerRenderer = !!serverRenderer;
  const serverOptions = React.useMemo(() => deriveOptionsFromRenderer(serverRenderer, kind), [serverRenderer, kind]);
  const opts = normalize(isServer ? mergeServerOptions(serverOptions, options) : options);
  const rendererLabel = React.useMemo(() => describeArcgisRenderer(serverRenderer), [serverRenderer]);
  const currentStyleLabel = isRaster
    ? (isServer ? 'Server imagery' : 'Custom raster')
    : isServer
      ? (hasServerRenderer ? 'Server style' : 'Preview default')
      : isAttribute ? 'Custom by field' : 'Custom style';
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const opacityValue = Math.max(0, Math.min(1, Number.isFinite(layerOpacity) ? layerOpacity : 1));
  const labelFields = React.useMemo(() => {
    return (fields || [])
      .filter((field) => field?.name && !/geometry|blob|raster|xml/i.test(String(field.type || '')))
      .map((field) => ({ name: field.name, label: field.alias && field.alias !== field.name ? `${field.alias} (${field.name})` : field.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [fields]);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const active = document.activeElement;
      if (!(active instanceof HTMLInputElement) || active.type !== 'color') return;
      if (event.target === active) return;
      active.blur();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, []);

  const commitCustomOptions = (next: GeometryStyleOptions) => {
    if (isServer) onModeChange?.('custom');
    onOptionsChange?.(next);
  };
  const update = (partial: Partial<GeometryStyleOptions>) => {
    commitCustomOptions({ ...opts, ...partial });
  };
  const updateDisplay = (display: GeometryStyleOptions['display']) => {
    const current = normalize(options);
    onOptionsChange?.({ ...current, display });
  };
  const updateRaster = (raster: GeometryStyleOptions['raster']) => {
    update({ raster: { ...opts.raster, ...raster } });
  };
  const switchMode = (nextMode: StyleMode) => {
    if (nextMode !== 'server' && isServer) onOptionsChange?.({ ...opts });
    onModeChange?.(nextMode);
  };
  const updatePointSymbol = (symbol: 'circle' | 'icon') => {
    const point = { ...opts.point, symbol };
    if (symbol === 'icon') {
      if (options.point?.fillOpacity == null || opts.point.fillOpacity === (defaultStyleOptions.point?.fillOpacity ?? 0.2)) {
        point.fillOpacity = 1;
      }
      if (options.point?.iconAllowOverlap == null) {
        point.iconAllowOverlap = true;
      }
    }
    update({ point });
  };

  return (
    <div style={{ padding: 8, display: 'grid', gap: 12 }}>
      {/* Layer opacity — always visible */}
      <div style={{ display: 'grid', gap: 6 }}>
        <label className="u-label">Layer opacity</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={opacityValue}
            onChange={(e) => onLayerOpacityChange?.(Number(e.target.value))}
            aria-label="Layer opacity"
            style={{ flex: 1 }}
          />
          <span className="u-muted u-small" style={{ minWidth: 44, textAlign: 'right' }}>{Math.round(opacityValue * 100)}%</span>
        </div>
      </div>

      {isRaster ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Layer: raster imagery</div>
      ) : kind ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Geometry: {kind === 'point' ? 'Point / MultiPoint' : kind === 'line' ? 'Line / MultiLine' : 'Polygon / MultiPolygon'}</div>
      ) : null}

      {/* Renderer: two choices only */}
      <div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{isRaster ? 'Raster style' : 'Renderer'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="radio" name="style-mode" checked={isServer} onChange={() => onModeChange?.('server')} />
            <span>{isRaster ? 'Server imagery' : 'Server style'}</span>
            {!isRaster && !hasServerRenderer ? <span className="u-small u-muted">No renderer</span> : null}
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="radio"
              name="style-mode"
              checked={isCustom}
              onChange={() => {
                // Switching to custom: if already in attribute mode keep it, otherwise go custom
                if (!isCustom) switchMode('custom');
              }}
            />
            <span>{isRaster ? 'Custom raster' : 'Custom style'}</span>
          </label>
        </div>
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '90px 1fr', gap: '4px 8px', fontSize: 12 }}>
          <span style={{ color: 'var(--muted)' }}>Current</span>
          <span style={{ color: 'var(--text)' }}>{currentStyleLabel}</span>
          {!isRaster ? (
            <>
              <span style={{ color: 'var(--muted)' }}>Renderer</span>
              <span style={{ color: 'var(--text)' }}>{rendererLabel || 'Not provided'}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* Style controls — server mode shows the server-derived values until edited. */}
      {(
        <>
          {!isRaster ? (
          <fieldset>
            <legend style={{ fontWeight: 600 }}>Display</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: 8 }}>
              <label htmlFor="showLegend">Show legend</label>
              <input
                id="showLegend"
                type="checkbox"
                checked={opts.display.showLegend !== false}
                onChange={(e) => updateDisplay({ ...normalize(options).display, showLegend: e.target.checked })}
              />
              <label htmlFor="hideSuspectedDuplicates">Hide suspected duplicates</label>
              <input
                id="hideSuspectedDuplicates"
                type="checkbox"
                checked={!!opts.display.hideSuspectedDuplicates}
                onChange={(e) => updateDisplay({ ...normalize(options).display, hideSuspectedDuplicates: e.target.checked })}
              />
            </div>
          </fieldset>
          ) : null}

          {isRaster ? (
            <fieldset>
              <legend style={{ fontWeight: 600 }}>Raster</legend>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: 8 }}>
                <RasterSlider
                  id="rasterOpacity"
                  label="Raster opacity"
                  min={0}
                  max={1}
                  step={0.05}
                  value={opts.raster.opacity ?? 1}
                  onChange={(value) => updateRaster({ opacity: value })}
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                />
                <RasterSlider
                  id="rasterBrightnessMin"
                  label="Brightness min"
                  min={0}
                  max={1}
                  step={0.05}
                  value={opts.raster.brightnessMin ?? 0}
                  onChange={(value) => updateRaster({ brightnessMin: Math.min(value, opts.raster.brightnessMax ?? 1) })}
                />
                <RasterSlider
                  id="rasterBrightnessMax"
                  label="Brightness max"
                  min={0}
                  max={1}
                  step={0.05}
                  value={opts.raster.brightnessMax ?? 1}
                  onChange={(value) => updateRaster({ brightnessMax: Math.max(value, opts.raster.brightnessMin ?? 0) })}
                />
                <RasterSlider
                  id="rasterContrast"
                  label="Contrast"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={opts.raster.contrast ?? 0}
                  onChange={(value) => updateRaster({ contrast: value })}
                  formatValue={formatSignedValue}
                />
                <RasterSlider
                  id="rasterSaturation"
                  label="Saturation"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={opts.raster.saturation ?? 0}
                  onChange={(value) => updateRaster({ saturation: value })}
                  formatValue={formatSignedValue}
                />
                <RasterSlider
                  id="rasterHueRotate"
                  label="Hue rotate"
                  min={-180}
                  max={180}
                  step={1}
                  value={opts.raster.hueRotate ?? 0}
                  onChange={(value) => updateRaster({ hueRotate: value })}
                  formatValue={(value) => `${Math.round(value)} deg`}
                />
                <label htmlFor="rasterResampling">Resampling</label>
                <select
                  id="rasterResampling"
                  value={opts.raster.resampling ?? 'linear'}
                  onChange={(e) => updateRaster({ resampling: e.target.value === 'nearest' ? 'nearest' : 'linear' })}
                >
                  <option value="linear">Linear</option>
                  <option value="nearest">Nearest</option>
                </select>
                <label htmlFor="rasterFadeDuration">Fade (ms)</label>
                <input
                  id="rasterFadeDuration"
                  type="number"
                  min={0}
                  max={2000}
                  step={50}
                  value={opts.raster.fadeDuration ?? 300}
                  onChange={(e) => updateRaster({ fadeDuration: toSteppedNumber(e.target.value, 300, 0, 2000, 50) })}
                />
              </div>
            </fieldset>
          ) : null}

          {/* Geometry controls — always shown in custom mode */}
          {!isRaster && (kind === 'point' || !kind) && (
            <fieldset>
              <legend style={{ fontWeight: 600 }}>Points</legend>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: 8 }}>
                <label htmlFor="ptSymbol">Symbol</label>
                <select id="ptSymbol" value={opts.point.symbol} onChange={(e) => updatePointSymbol(e.target.value as 'circle' | 'icon')}>
                  <option value="circle">Circle</option>
                  <option value="icon">Icon</option>
                </select>
                {opts.point.symbol === 'icon' ? (
                  <>
                    <label htmlFor="ptIcon">Icon</label>
                    <select id="ptIcon" value={opts.point.icon} onChange={(e) => update({ point: { ...opts.point, icon: e.target.value } })}>
                      {groupPointIcons().map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.icons.map((icon) => (
                            <option key={icon.id} value={icon.id}>{icon.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {!isAttribute && (
                      <>
                        <label htmlFor="ptIconColor">Icon color</label>
                        <input id="ptIconColor" type="color" value={opts.point.fillColor} onChange={(e) => update({ point: { ...opts.point, fillColor: e.target.value } })} />
                      </>
                    )}
                    <label htmlFor="ptIconSize">Size (px)</label>
                    <input id="ptIconSize" type="number" min={4} max={80} step={0.5} value={opts.point.iconSize} onChange={(e) => update({ point: { ...opts.point, iconSize: toSizedNumber(e.target.value, 24, 4, 80) } })} />
                    <label htmlFor="ptIconOpacity">Opacity</label>
                    <input id="ptIconOpacity" type="range" min={0} max={1} step={0.05} value={opts.point.fillOpacity} onChange={(e) => update({ point: { ...opts.point, fillOpacity: toNumber(e.target.value, 1) } })} />
                    {showAdvanced && (
                      <>
                        <label htmlFor="ptIconAllowOverlap">Allow overlap</label>
                        <input id="ptIconAllowOverlap" type="checkbox" checked={!!opts.point.iconAllowOverlap} onChange={(e) => update({ point: { ...opts.point, iconAllowOverlap: e.target.checked } })} />
                        <label htmlFor="ptIconIgnorePlacement">Ignore placement</label>
                        <input id="ptIconIgnorePlacement" type="checkbox" checked={!!opts.point.iconIgnorePlacement} onChange={(e) => update({ point: { ...opts.point, iconIgnorePlacement: e.target.checked } })} />
                        <label htmlFor="ptIconAnchor">Anchor</label>
                        <select id="ptIconAnchor" value={opts.point.iconAnchor} onChange={(e) => update({ point: { ...opts.point, iconAnchor: e.target.value as any } })}>
                          {POINT_ICON_ANCHOR_OPTIONS.map((anchor) => (
                            <option key={anchor} value={anchor}>{formatOptionLabel(anchor)}</option>
                          ))}
                        </select>
                        <label htmlFor="ptIconRotate">Rotate (deg)</label>
                        <input id="ptIconRotate" type="number" min={-360} max={360} step={1} value={opts.point.iconRotate} onChange={(e) => update({ point: { ...opts.point, iconRotate: toNumber(e.target.value, 0) } })} />
                        <label htmlFor="ptIconRotationAlignment">Rotation alignment</label>
                        <select id="ptIconRotationAlignment" value={opts.point.iconRotationAlignment} onChange={(e) => update({ point: { ...opts.point, iconRotationAlignment: e.target.value as any } })}>
                          {POINT_ICON_ALIGNMENT_OPTIONS.map((alignment) => (
                            <option key={alignment} value={alignment}>{formatOptionLabel(alignment)}</option>
                          ))}
                        </select>
                        <label htmlFor="ptIconPitchAlignment">Pitch alignment</label>
                        <select id="ptIconPitchAlignment" value={opts.point.iconPitchAlignment} onChange={(e) => update({ point: { ...opts.point, iconPitchAlignment: e.target.value as any } })}>
                          {POINT_ICON_ALIGNMENT_OPTIONS.map((alignment) => (
                            <option key={alignment} value={alignment}>{formatOptionLabel(alignment)}</option>
                          ))}
                        </select>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {/* Fill color only shown when NOT using attribute color */}
                    {!isAttribute && (
                      <>
                        <label htmlFor="ptFillColor">Fill color</label>
                        <input id="ptFillColor" type="color" value={opts.point.fillColor} onChange={(e) => update({ point: { ...opts.point, fillColor: e.target.value } })} />
                      </>
                    )}
                    <label htmlFor="ptFillOpacity">Fill opacity</label>
                    <input id="ptFillOpacity" type="range" min={0} max={1} step={0.05} value={opts.point.fillOpacity} onChange={(e) => update({ point: { ...opts.point, fillOpacity: toNumber(e.target.value, 0.2) } })} />
                    <label htmlFor="ptRadius">Radius (px)</label>
                    <input id="ptRadius" type="number" min={0.5} max={48} step={0.5} value={opts.point.radius} onChange={(e) => update({ point: { ...opts.point, radius: toSizedNumber(e.target.value, 6, 0.5, 48) } })} />
                    <label htmlFor="ptColor">Border color</label>
                    <input id="ptColor" type="color" value={opts.point.color} onChange={(e) => update({ point: { ...opts.point, color: e.target.value } })} />
                    <label htmlFor="ptWeight">Border width (px)</label>
                    <input id="ptWeight" type="number" min={0} max={20} step={0.1} value={opts.point.weight} onChange={(e) => update({ point: { ...opts.point, weight: toStrokeWidth(e.target.value, 2) } })} />
                    <label htmlFor="ptOpacity">Border opacity</label>
                    <input id="ptOpacity" type="range" min={0} max={1} step={0.05} value={opts.point.opacity} onChange={(e) => update({ point: { ...opts.point, opacity: toNumber(e.target.value, 1) } })} />
                  </>
                )}
              </div>
              <AdvancedToggleFooter showAdvanced={showAdvanced} onToggle={() => setShowAdvanced(v => !v)} />
            </fieldset>
          )}

          {!isRaster && (kind === 'line' || !kind) && (
            <fieldset>
              <legend style={{ fontWeight: 600 }}>Lines</legend>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: 8 }}>
                {!isAttribute && (
                  <>
                    <label htmlFor="lnColor">Color</label>
                    <input id="lnColor" type="color" value={opts.line.color} onChange={(e) => update({ line: { ...opts.line, color: e.target.value } })} />
                  </>
                )}
                <label htmlFor="lnWeight">Weight (px)</label>
                <input id="lnWeight" type="number" min={0} max={20} step={0.1} value={opts.line.weight} onChange={(e) => update({ line: { ...opts.line, weight: toStrokeWidth(e.target.value, 0.5) } })} />
                <label htmlFor="lnOpacity">Opacity</label>
                <input id="lnOpacity" type="range" min={0} max={1} step={0.05} value={opts.line.opacity} onChange={(e) => update({ line: { ...opts.line, opacity: toNumber(e.target.value, 1) } })} />
                {showAdvanced && (
                  <>
                    <label htmlFor="lnDash">Dash array</label>
                    <input id="lnDash" type="text" placeholder="e.g. 5,10" value={opts.line.dashArray} onChange={(e) => update({ line: { ...opts.line, dashArray: e.target.value } })} />
                    <label htmlFor="lnDashOffset">Dash offset</label>
                    <input id="lnDashOffset" type="text" placeholder="e.g. 10" value={opts.line.dashOffset} onChange={(e) => update({ line: { ...opts.line, dashOffset: e.target.value } })} />
                    <label htmlFor="lnCap">Line cap</label>
                    <select id="lnCap" value={opts.line.lineCap} onChange={(e) => update({ line: { ...opts.line, lineCap: e.target.value as any } })}>
                      <option value="butt">butt</option>
                      <option value="round">round</option>
                      <option value="square">square</option>
                    </select>
                    <label htmlFor="lnJoin">Line join</label>
                    <select id="lnJoin" value={opts.line.lineJoin} onChange={(e) => update({ line: { ...opts.line, lineJoin: e.target.value as any } })}>
                      <option value="miter">miter</option>
                      <option value="round">round</option>
                      <option value="bevel">bevel</option>
                    </select>
                  </>
                )}
              </div>
              <AdvancedToggleFooter showAdvanced={showAdvanced} onToggle={() => setShowAdvanced(v => !v)} />
            </fieldset>
          )}

          {!isRaster && (kind === 'polygon' || !kind) && (
            <fieldset>
              <legend style={{ fontWeight: 600 }}>Polygons</legend>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: 8 }}>
                <label htmlFor="pgColor">Stroke color</label>
                <input id="pgColor" type="color" value={opts.polygon.color} onChange={(e) => update({ polygon: { ...opts.polygon, color: e.target.value } })} />
                <label htmlFor="pgWeight">Stroke weight (px)</label>
                <input id="pgWeight" type="number" min={0} max={20} step={0.1} value={opts.polygon.weight} onChange={(e) => update({ polygon: { ...opts.polygon, weight: toStrokeWidth(e.target.value, 2) } })} />
                {!isAttribute && (
                  <>
                    <label htmlFor="pgFillColor">Fill color</label>
                    <input id="pgFillColor" type="color" value={opts.polygon.fillColor} onChange={(e) => update({ polygon: { ...opts.polygon, fillColor: e.target.value } })} />
                  </>
                )}
                <label htmlFor="pgFillOpacity">Fill opacity</label>
                <input id="pgFillOpacity" type="range" min={0} max={1} step={0.05} value={opts.polygon.fillOpacity} onChange={(e) => update({ polygon: { ...opts.polygon, fillOpacity: toNumber(e.target.value, 0.2) } })} />
                {showAdvanced && (
                  <>
                    <label htmlFor="pgOpacity">Stroke opacity</label>
                    <input id="pgOpacity" type="range" min={0} max={1} step={0.05} value={opts.polygon.opacity} onChange={(e) => update({ polygon: { ...opts.polygon, opacity: toNumber(e.target.value, 1) } })} />
                    <label htmlFor="pgDash">Dash array</label>
                    <input id="pgDash" type="text" placeholder="e.g. 4,8" value={opts.polygon.dashArray} onChange={(e) => update({ polygon: { ...opts.polygon, dashArray: e.target.value } })} />
                    <label htmlFor="pgDashOffset">Dash offset</label>
                    <input id="pgDashOffset" type="text" placeholder="e.g. 8" value={opts.polygon.dashOffset} onChange={(e) => update({ polygon: { ...opts.polygon, dashOffset: e.target.value } })} />
                    <label htmlFor="pgFillRule">Fill rule</label>
                    <select id="pgFillRule" value={opts.polygon.fillRule} onChange={(e) => update({ polygon: { ...opts.polygon, fillRule: e.target.value as any } })}>
                      <option value="evenodd">evenodd</option>
                      <option value="nonzero">nonzero</option>
                    </select>
                  </>
                )}
              </div>
              <AdvancedToggleFooter showAdvanced={showAdvanced} onToggle={() => setShowAdvanced(v => !v)} />
            </fieldset>
          )}

          {/* Color source — flat vs by field */}
          {!isRaster ? (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Fill color source</span>
              <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => { switchMode('custom'); }}
                  style={{
                    padding: '3px 10px',
                    fontSize: 12,
                    border: 'none',
                    background: !isAttribute ? 'var(--accent, #5b8cff)' : 'var(--panel-subtle)',
                    color: !isAttribute ? '#fff' : 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  Flat color
                </button>
                <button
                  type="button"
                  onClick={() => { switchMode('attribute'); }}
                  style={{
                    padding: '3px 10px',
                    fontSize: 12,
                    border: 'none',
                    borderLeft: '1px solid var(--border)',
                    background: isAttribute ? 'var(--accent, #5b8cff)' : 'var(--panel-subtle)',
                    color: isAttribute ? '#fff' : 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  By field
                </button>
              </div>
            </div>
            {isAttribute ? (
              <AttributeStyleEditor
                fields={fields}
                rule={attributeStyle?.rule}
                paletteId={attributeStyle?.meta?.paletteId}
                numericPrecision={attributeStyle?.meta?.numericPrecision}
                featureCollection={featureCollection}
                onRuleChange={(rule, meta) => onAttributeStyleChange?.({
                  ...attributeStyle,
                  rule,
                  meta: { ...attributeStyle?.meta, ...meta },
                })}
                geometryType={geometryType}
              />
            ) : (
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                Fill color is set by the color pickers above. Switch to "By field" to color features automatically by a data attribute.
              </p>
            )}
          </div>
          ) : null}

          {!isRaster ? (
          <fieldset>
            <legend style={{ fontWeight: 600 }}>Labels</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: 8 }}>
              <label htmlFor="labelField">Label field</label>
              <select
                id="labelField"
                value={opts.label.field}
                onChange={(e) => {
                  const field = e.target.value;
                  update({ label: { ...opts.label, enabled: !!field, field } });
                }}
              >
                <option value="">No labels</option>
                {labelFields.map((field) => (
                  <option key={field.name} value={field.name}>{field.label}</option>
                ))}
              </select>
              <label htmlFor="labelSize">Size (px)</label>
              <input
                id="labelSize"
                type="number"
                min={4}
                max={32}
                step={0.5}
                value={opts.label.size}
                disabled={!opts.label.enabled}
                onChange={(e) => update({ label: { ...opts.label, size: toSizedNumber(e.target.value, 12, 4, 32) } })}
              />
              <label htmlFor="labelColor">Text color</label>
              <input
                id="labelColor"
                type="color"
                value={opts.label.color}
                disabled={!opts.label.enabled}
                onChange={(e) => update({ label: { ...opts.label, color: e.target.value } })}
              />
              {showAdvanced && (
                <>
                  <label htmlFor="labelPosition">Position</label>
                  <select
                    id="labelPosition"
                    value={opts.label.position}
                    disabled={!opts.label.enabled}
                    onChange={(e) => update({ label: { ...opts.label, position: e.target.value as any } })}
                  >
                    <option value="top">Above</option>
                    <option value="bottom">Below</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    <option value="center">Center</option>
                    <option value="top-left">Above left</option>
                    <option value="top-right">Above right</option>
                    <option value="bottom-left">Below left</option>
                    <option value="bottom-right">Below right</option>
                  </select>
                  <label htmlFor="labelHaloColor">Halo color</label>
                  <input
                    id="labelHaloColor"
                    type="color"
                    value={opts.label.haloColor}
                    disabled={!opts.label.enabled}
                    onChange={(e) => update({ label: { ...opts.label, haloColor: e.target.value } })}
                  />
                  <label htmlFor="labelHaloWidth">Halo width</label>
                  <input
                    id="labelHaloWidth"
                    type="number"
                    min={0}
                    max={6}
                    step={0.1}
                    value={opts.label.haloWidth}
                    disabled={!opts.label.enabled}
                    onChange={(e) => update({ label: { ...opts.label, haloWidth: toSizedNumber(e.target.value, 1.5, 0, 6) } })}
                  />
                </>
              )}
            </div>
            <AdvancedToggleFooter showAdvanced={showAdvanced} onToggle={() => setShowAdvanced(v => !v)} />
          </fieldset>
          ) : null}
        </>
      )}

      {/* Footer buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => {
            if (isAttribute) {
              onAttributeStyleChange?.({});
            } else if (isCustom) {
              onOptionsChange?.({ ...defaultStyleOptions });
            }
          }}
          disabled={isServer}
          title={isAttribute ? 'Re-classify from current data' : 'Reset to defaults'}
          style={{
            padding: '6px 8px',
            fontSize: 12,
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: isServer ? 'var(--panel-strong)' : 'var(--panel-subtle)',
            color: isServer ? 'var(--muted)' : 'var(--text)',
            cursor: isServer ? 'not-allowed' : 'pointer',
            transition: 'background-color 160ms ease, border-color 160ms ease, color 160ms ease',
          }}
          onMouseEnter={(e) => { if (!isServer) e.currentTarget.style.background = 'var(--hover)'; }}
          onMouseLeave={(e) => { if (!isServer) e.currentTarget.style.background = 'var(--panel-subtle)'; }}
        >Reset</button>
      </div>
    </div>
  );
}

function normalize(options: GeometryStyleOptions): Required<GeometryStyleOptions> & GeometryStyleOptions {
  const pointSymbol = options.point?.symbol === 'icon' ? 'icon' : 'circle';
  const defaultPointFillOpacity = pointSymbol === 'icon' ? 1 : defaultStyleOptions.point?.fillOpacity ?? 0.2;
  const rasterBrightnessMin = roundToStep(clampNum(options.raster?.brightnessMin ?? defaultStyleOptions.raster?.brightnessMin ?? 0, 0, 1), 0.05);
  const rasterBrightnessMax = roundToStep(clampNum(options.raster?.brightnessMax ?? defaultStyleOptions.raster?.brightnessMax ?? 1, 0, 1), 0.05);

  return {
    point: {
      symbol: pointSymbol,
      icon: POINT_ICON_OPTIONS.some((icon) => icon.id === options.point?.icon) ? options.point?.icon : DEFAULT_POINT_ICON_ID,
      iconSize: roundToStep(clampNum(options.point?.iconSize ?? defaultStyleOptions.point?.iconSize ?? 24, 4, 80), 0.5),
      iconAnchor: POINT_ICON_ANCHOR_OPTIONS.includes(options.point?.iconAnchor as any) ? options.point?.iconAnchor : defaultStyleOptions.point?.iconAnchor ?? 'center',
      iconAllowOverlap: options.point?.iconAllowOverlap ?? defaultStyleOptions.point?.iconAllowOverlap ?? false,
      iconIgnorePlacement: !!options.point?.iconIgnorePlacement,
      iconRotate: clampNum(options.point?.iconRotate ?? defaultStyleOptions.point?.iconRotate ?? 0, -360, 360),
      iconRotationAlignment: POINT_ICON_ALIGNMENT_OPTIONS.includes(options.point?.iconRotationAlignment as any) ? options.point?.iconRotationAlignment : defaultStyleOptions.point?.iconRotationAlignment ?? 'auto',
      iconPitchAlignment: POINT_ICON_ALIGNMENT_OPTIONS.includes(options.point?.iconPitchAlignment as any) ? options.point?.iconPitchAlignment : defaultStyleOptions.point?.iconPitchAlignment ?? 'auto',
      stroke: options.point?.stroke !== false,
      color: options.point?.color ?? '#3388ff',
      weight: clampStrokeWidth(options.point?.weight ?? 2, 50),
      opacity: clamp01(options.point?.opacity ?? 1),
      fill: options.point?.fill !== false,
      fillColor: options.point?.fillColor ?? options.point?.color ?? '#3388ff',
      fillOpacity: clamp01(options.point?.fillOpacity ?? defaultPointFillOpacity),
      radius: roundToStep(clampNum(options.point?.radius ?? 6, 0.5, 100), 0.5),
    },
    line: {
      stroke: options.line?.stroke !== false,
      color: options.line?.color ?? '#3388ff',
      weight: clampStrokeWidth(options.line?.weight ?? 0.5, 50),
      opacity: clamp01(options.line?.opacity ?? 1),
      lineCap: (options.line?.lineCap as any) || 'round',
      lineJoin: (options.line?.lineJoin as any) || 'round',
      dashArray: options.line?.dashArray ?? '',
      dashOffset: options.line?.dashOffset ?? '',
    },
    polygon: {
      stroke: options.polygon?.stroke !== false,
      color: options.polygon?.color ?? '#3388ff',
      weight: clampStrokeWidth(options.polygon?.weight ?? 2, 50),
      opacity: clamp01(options.polygon?.opacity ?? 1),
      lineCap: (options.polygon?.lineCap as any) || 'round',
      lineJoin: (options.polygon?.lineJoin as any) || 'round',
      dashArray: options.polygon?.dashArray ?? '',
      dashOffset: options.polygon?.dashOffset ?? '',
      fill: options.polygon?.fill !== false,
      fillColor: options.polygon?.fillColor ?? options.polygon?.color ?? '#3388ff',
      fillOpacity: clamp01(options.polygon?.fillOpacity ?? 0.2),
      fillRule: (options.polygon?.fillRule as any) || 'evenodd',
    },
    label: {
      enabled: !!options.label?.enabled && !!options.label?.field,
      field: options.label?.field ?? '',
      position: (options.label?.position as any) || defaultStyleOptions.label?.position || 'top',
      color: options.label?.color ?? defaultStyleOptions.label?.color ?? '#111827',
      size: roundToStep(clampNum(options.label?.size ?? defaultStyleOptions.label?.size ?? 12, 4, 32), 0.5),
      haloColor: options.label?.haloColor ?? defaultStyleOptions.label?.haloColor ?? '#ffffff',
      haloWidth: roundToStep(clampNum(options.label?.haloWidth ?? defaultStyleOptions.label?.haloWidth ?? 1.5, 0, 6), 0.1),
    },
    display: {
      hideSuspectedDuplicates: !!options.display?.hideSuspectedDuplicates,
      showLegend: options.display?.showLegend !== false,
    },
    raster: {
      opacity: roundToStep(clamp01(options.raster?.opacity ?? defaultStyleOptions.raster?.opacity ?? 1), 0.05),
      brightnessMin: Math.min(rasterBrightnessMin, rasterBrightnessMax),
      brightnessMax: Math.max(rasterBrightnessMin, rasterBrightnessMax),
      contrast: roundToStep(clampNum(options.raster?.contrast ?? defaultStyleOptions.raster?.contrast ?? 0, -1, 1), 0.05),
      saturation: roundToStep(clampNum(options.raster?.saturation ?? defaultStyleOptions.raster?.saturation ?? 0, -1, 1), 0.05),
      hueRotate: roundToStep(clampNum(options.raster?.hueRotate ?? defaultStyleOptions.raster?.hueRotate ?? 0, -180, 180), 1),
      resampling: options.raster?.resampling === 'nearest' ? 'nearest' : 'linear',
      fadeDuration: roundToStep(clampNum(options.raster?.fadeDuration ?? defaultStyleOptions.raster?.fadeDuration ?? 300, 0, 2000), 50),
    },
  } as any;
}

function inferKind(geometryType?: string | null): 'point' | 'line' | 'polygon' | null {
  const g = String(geometryType || '').toLowerCase();
  if (!g) return null;
  if (g.includes('point')) return 'point';
  if (g.includes('line')) return 'line';
  if (g.includes('poly')) return 'polygon';
  return null;
}

function mergeServerOptions(serverOptions: GeometryStyleOptions, currentOptions: GeometryStyleOptions): GeometryStyleOptions {
  const current = normalize(currentOptions);
  return {
    ...serverOptions,
    display: current.display,
  };
}

function cloneDefaultOptions(): Required<GeometryStyleOptions> & GeometryStyleOptions {
  return normalize({ ...defaultStyleOptions });
}

function deriveOptionsFromRenderer(renderer: any, kind: 'point' | 'line' | 'polygon' | null): GeometryStyleOptions {
  const out = cloneDefaultOptions();
  const symbol = pickArcgisRendererSymbol(renderer);
  if (!symbol) return out;
  const symbolType = String(symbol.type || '').toLowerCase();
  const resolvedKind = kind || (symbolType.includes('marker') || symbolType.includes('pms') || symbolType.includes('sms')
    ? 'point'
    : symbolType.includes('line') || symbolType.includes('sls')
      ? 'line'
      : symbolType.includes('fill') || symbolType.includes('sfs')
        ? 'polygon'
        : null);

  if (resolvedKind === 'point') {
    const fill = esriColorParts(symbol.color, out.point.fillColor, out.point.fillOpacity);
    const outline = esriColorParts(symbol.outline?.color, out.point.color, out.point.opacity);
    const isPicture = !!(symbol.url || symbol.imageData || symbolType.includes('pms') || symbolType.includes('picture'));
    out.point = {
      ...out.point,
      symbol: isPicture ? 'icon' : 'circle',
      iconSize: toSizedValue(symbol.size ?? symbol.width ?? symbol.height ?? out.point.iconSize, 4, 80),
      radius: toSizedValue(symbol.size ?? out.point.radius, 0.5, 100),
      fillColor: fill.hex,
      fillOpacity: fill.opacity,
      color: outline.hex,
      opacity: outline.opacity,
      weight: clampStrokeWidth(symbol.outline?.width ?? out.point.weight, 50),
      iconAllowOverlap: true,
      iconRotate: clampNum(symbol.angle ?? out.point.iconRotate, -360, 360),
    };
    return out;
  }

  if (resolvedKind === 'line') {
    const line = esriColorParts(symbol.color, out.line.color, out.line.opacity);
    out.line = {
      ...out.line,
      color: line.hex,
      opacity: line.opacity,
      weight: clampStrokeWidth(scaleRendererLineWidth(symbol.width ?? out.line.weight), 50),
      lineCap: normalizeCap(symbol.cap) ?? out.line.lineCap,
      lineJoin: normalizeJoin(symbol.join) ?? out.line.lineJoin,
      dashArray: dashArrayText(symbol.style) ?? out.line.dashArray,
    };
    return out;
  }

  if (resolvedKind === 'polygon') {
    const fill = esriColorParts(symbol.color, out.polygon.fillColor, out.polygon.fillOpacity);
    const outline = esriColorParts(symbol.outline?.color, out.polygon.color, out.polygon.opacity);
    out.polygon = {
      ...out.polygon,
      fillColor: fill.hex,
      fillOpacity: fill.opacity,
      color: outline.hex,
      opacity: outline.opacity,
      weight: clampStrokeWidth(scaleRendererLineWidth(symbol.outline?.width ?? out.polygon.weight), 50),
      lineCap: normalizeCap(symbol.cap) ?? out.polygon.lineCap,
      lineJoin: normalizeJoin(symbol.join) ?? out.polygon.lineJoin,
      dashArray: dashArrayText(symbol.outline?.style || symbol.style) ?? out.polygon.dashArray,
    };
  }
  return out;
}

function esriColorParts(color: unknown, fallbackHex: string | undefined, fallbackOpacity: number | undefined): { hex: string; opacity: number } {
  if (!Array.isArray(color) || color.length < 3) {
    return { hex: fallbackHex || '#3388ff', opacity: clamp01(fallbackOpacity ?? 1) };
  }
  const [r, g, b, a = 255] = color.map((value) => Number(value));
  const hex = `#${[r, g, b].map((value) => clampNum(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`;
  return { hex, opacity: clamp01(a / 255) };
}

function scaleRendererLineWidth(width: unknown): number {
  const n = Number(width);
  if (!Number.isFinite(n)) return 1;
  return n > 0 && n < 1 ? n * 4 : n;
}

function dashArrayText(style?: string): string | undefined {
  if (!style) return undefined;
  const key = style.toLowerCase();
  const dash = (() => {
    switch (key) {
      case 'esrislsdash':
      case 'dash':
        return [4, 2];
      case 'esrislsdot':
      case 'dot':
        return [1, 2];
      case 'esrislsdashdot':
      case 'dashdot':
        return [4, 2, 1, 2];
      case 'esrislsdashdotdot':
      case 'dashdotdot':
        return [4, 2, 1, 2, 1, 2];
      case 'esrislsnull':
      case 'none':
        return [];
      default:
        return undefined;
    }
  })();
  return dash ? dash.join(',') : undefined;
}

function normalizeCap(cap?: string): 'butt' | 'round' | 'square' | undefined {
  if (!cap) return undefined;
  const lc = cap.toLowerCase();
  if (lc.includes('round')) return 'round';
  if (lc.includes('square')) return 'square';
  if (lc.includes('butt')) return 'butt';
  return undefined;
}

function normalizeJoin(join?: string): 'bevel' | 'round' | 'miter' | undefined {
  if (!join) return undefined;
  const lc = join.toLowerCase();
  if (lc.includes('round')) return 'round';
  if (lc.includes('bevel')) return 'bevel';
  if (lc.includes('miter')) return 'miter';
  return undefined;
}

function clamp01(n: number): number { if (!Number.isFinite(n)) return 0; return Math.max(0, Math.min(1, n)); }
function clampNum(n: number, min: number, max: number): number { if (!Number.isFinite(n)) return min; return Math.max(min, Math.min(max, n)); }
function toNumber(v: string, d: number): number { const n = Number(v); return Number.isFinite(n) ? n : d; }
function roundToStep(n: number, step: number): number {
  if (!Number.isFinite(n) || !Number.isFinite(step) || step <= 0) return n;
  const decimals = Math.max(0, String(step).split('.')[1]?.length || 0);
  return Number((Math.round(n / step) * step).toFixed(decimals));
}
function clampStrokeWidth(n: number, max: number): number {
  if (!Number.isFinite(n)) return 0;
  const clamped = clampNum(n, 0, max);
  if (clamped === 0) return 0;
  return Math.max(0.1, roundToStep(clamped, 0.1));
}
function toStrokeWidth(v: string, d: number): number {
  const n = Number(v);
  return clampStrokeWidth(Number.isFinite(n) ? n : d, 20);
}
function toSteppedNumber(v: string, d: number, min: number, max: number, step: number): number {
  const n = Number(v);
  return roundToStep(clampNum(Number.isFinite(n) ? n : d, min, max), step);
}
function toSizedValue(value: unknown, min: number, max: number): number {
  const n = Number(value);
  return roundToStep(clampNum(Number.isFinite(n) ? n : min, min, max), 0.5);
}
function toSizedNumber(v: string, d: number, min: number, max: number): number {
  const n = Number(v);
  return toSizedValue(Number.isFinite(n) ? n : d, min, max);
}
function formatOptionLabel(value: string): string {
  return value.split('-').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' ');
}
function formatSignedValue(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0';
  return `${value > 0 ? '+' : ''}${Number(value.toFixed(2))}`;
}

function RasterSlider({
  id,
  label,
  min,
  max,
  step,
  value,
  onChange,
  formatValue = (next: number) => String(Number(next.toFixed(2))),
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}) {
  const current = toSteppedNumber(String(value), min, min, max, step);
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={current}
          onChange={(e) => onChange(toSteppedNumber(e.target.value, current, min, max, step))}
          style={{ flex: 1, minWidth: 0 }}
        />
        <span className="u-muted u-small" style={{ minWidth: 52, textAlign: 'right' }}>{formatValue(current)}</span>
      </div>
    </>
  );
}

function AdvancedToggleFooter({ showAdvanced, onToggle }: { showAdvanced: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
      <AdvancedToggle showAdvanced={showAdvanced} onToggle={onToggle} compact />
    </div>
  );
}

function AdvancedToggle({ showAdvanced, onToggle, compact = false }: { showAdvanced: boolean; onToggle: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={showAdvanced}
      title={showAdvanced ? 'Hide advanced style controls' : 'Show advanced style controls'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: compact ? '2px 7px' : '5px 9px',
        fontSize: compact ? 11 : 12,
        fontWeight: 600,
        lineHeight: 1.2,
        borderRadius: 9999,
        border: `1px solid ${showAdvanced ? 'var(--accent, #5b8cff)' : 'var(--border)'}`,
        background: showAdvanced ? 'rgba(91, 140, 255, 0.14)' : 'var(--panel-subtle)',
        color: showAdvanced ? 'var(--accent, #5b8cff)' : 'var(--text)',
        cursor: 'pointer',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: compact ? 10 : 11 }}>{showAdvanced ? '-' : '+'}</span>
      {showAdvanced ? 'Advanced on' : 'More options'}
    </button>
  );
}

function groupPointIcons() {
  const groups: Array<{ label: string; icons: typeof POINT_ICON_OPTIONS[number][] }> = [];
  for (const icon of POINT_ICON_OPTIONS) {
    const label = icon.group || 'Other';
    let group = groups.find((item) => item.label === label);
    if (!group) {
      group = { label, icons: [] };
      groups.push(group);
    }
    group.icons.push(icon);
  }
  return groups;
}
