import { useEffect, useRef, useState } from 'react';
import { INDICATORS, indicatorById } from '../lib/indicatorRegistry';
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
        {indicators.length > 0 && <span className="badge">{indicators.length}</span>}
        <span className="caret">▾</span>
      </button>

      {open && (
        <div className="picker-pop wide">
          {indicators.length > 0 && (
            <>
              <div className="picker-meta">Active</div>
              <ul className="ind-active">
                {indicators.map((instance) => {
                  const def = indicatorById(instance.defId);
                  if (!def) return null;
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
                            {param.kind === 'select' ? (
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
