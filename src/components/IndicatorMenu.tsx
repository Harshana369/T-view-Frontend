import { useEffect, useMemo, useRef, useState } from 'react';
import { INDICATORS, indicatorById, type IndicatorDef } from '../lib/indicatorRegistry';
import type { ActiveIndicator } from '../store';
import { useStore } from '../store';

/**
 * Indicators dropdown එක:
 *  - උඩින්: දැනට chart එකේ තියෙන indicators + ඒවගේ settings (length වගේ) + remove
 *  - යටින්: add කරන්න පුළුවන් indicators list එක
 * හැම වෙනසක්ම store එකට යනවා, Chart.tsx එක ඒක බලාගෙන ආපහු අඳිනවා.
 */
export function IndicatorMenu() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const indicators = useStore((s) => s.indicators);
  const addIndicator = useStore((s) => s.addIndicator);
  const removeIndicator = useStore((s) => s.removeIndicator);
  const setParam = useStore((s) => s.setParam);

  // defId එක registry එකේ තියෙන indicator එකකට ගැලපෙන instances විතරයි —
  // කලින් indicator එකක් registry එකෙන් අයින් වුණාට/rename වුණාට පස්සේ
  // localStorage එකේ ඉතුරු වුණු instance එකක් තිබුණොත් (කවදාවත් render
  // වෙන්නේ නෑ, "badge" ගාණට විතරක් ගණන් වෙනවා), මෙතනින් අයින් වෙනවා.
  const activeInstances = useMemo(
    () =>
      indicators
        .map((instance) => ({ instance, def: indicatorById(instance.defId) }))
        .filter(
          (x): x is { instance: ActiveIndicator; def: IndicatorDef } => x.def !== undefined,
        ),
    [indicators],
  );

  // Orphan වුණු instances (def එකක් නැති) store එකෙන්ම cleanup කරනවා —
  // ආපහු කවදාවත් render වෙන්න බැරි dead entries localStorage එකේ රැඳෙන්නේ නෑ.
  useEffect(() => {
    const validIds = new Set(activeInstances.map((x) => x.instance.instanceId));
    for (const instance of indicators) {
      if (!validIds.has(instance.instanceId)) removeIndicator(instance.instanceId);
    }
  }, [indicators, activeInstances, removeIndicator]);

  // පිටත click කළාම menu එක වහනවා.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="picker" ref={boxRef}>
      <button type="button" className="picker-btn" onClick={() => setOpen((o) => !o)}>
        Indicators
        {activeInstances.length > 0 && (
          <span className="badge">{activeInstances.length}</span>
        )}
        <span className="caret">▾</span>
      </button>

      {open && (
        <div className="picker-pop wide">
          {activeInstances.length > 0 && (
            <>
              <div className="picker-meta">Active</div>
              <ul className="ind-active">
                {activeInstances.map(({ instance, def }) => {
                  return (
                    <li key={instance.instanceId} className="ind-row">
                      <div className="ind-head">
                        <span className="ind-name">{def.name}</span>
                        <button
                          type="button"
                          className="ind-remove"
                          onClick={() => removeIndicator(instance.instanceId)}
                          aria-label={`Remove ${def.name}`}
                        >
                          ✕
                        </button>
                      </div>

                      <div className="ind-params">
                        {def.params.map((param) => (
                          <label key={param.key} className="ind-param">
                            {param.label}
                            {param.kind === 'switch' ? (
                              <button
                                type="button"
                                role="switch"
                                aria-checked={instance.params[param.key] === 'On'}
                                className={
                                  instance.params[param.key] === 'On'
                                    ? 'ind-switch on'
                                    : 'ind-switch'
                                }
                                onClick={() =>
                                  setParam(
                                    instance.instanceId,
                                    param.key,
                                    instance.params[param.key] === 'On' ? 'Off' : 'On',
                                  )
                                }
                              >
                                <span className="ind-switch-knob" />
                              </button>
                            ) : param.kind === 'select' ? (
                              <select
                                value={String(instance.params[param.key] ?? param.default)}
                                onChange={(e) =>
                                  setParam(instance.instanceId, param.key, e.target.value)
                                }
                              >
                                {param.options?.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="number"
                                min={param.min}
                                max={param.max}
                                step={param.step ?? 1}
                                value={Number(instance.params[param.key] ?? param.default)}
                                onChange={(e) => {
                                  // හිස්/වැරදි අගයන් නොගෙන, range එක ඇතුළේ තියාගන්නවා.
                                  const n = Number(e.target.value);
                                  if (!Number.isFinite(n)) return;
                                  const min = param.min ?? -Infinity;
                                  const max = param.max ?? Infinity;
                                  setParam(
                                    instance.instanceId,
                                    param.key,
                                    Math.min(max, Math.max(min, n)),
                                  );
                                }}
                              />
                            )}
                          </label>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <div className="picker-meta">Add indicator</div>
          <ul className="picker-list">
            {INDICATORS.map((def) => (
              <li key={def.id}>
                <button
                  type="button"
                  className="picker-item"
                  onClick={() => addIndicator(def.id)}
                >
                  <span className="sym">{def.name}</span>
                  <span className="vol">{def.pane === 'main' ? 'overlay' : 'pane'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
