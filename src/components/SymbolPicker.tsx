import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchPerpSymbols } from '../lib/binance';
import { compact, formatChange, formatPrice } from '../lib/format';
import type { PerpSymbol } from '../lib/types';

interface Props {
  value: string;
  onChange: (symbol: string) => void;
}

/**
 * Binance USDT-M perps *සියලුම* coins ටික පෙන්වන dropdown එක.
 * Mount වෙනකොට එක පාරක් instruments list එක ගේනවා, ඊට පස්සේ search box
 * එකෙන් filter කරනවා. List එක volume එක අනුව sort වෙලා එනවා.
 */
export function SymbolPicker({ value, onChange }: Props) {
  const [symbols, setSymbols] = useState<PerpSymbol[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPerpSymbols()
      .then((list) => {
        if (!cancelled) setSymbols(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Dropdown එකෙන් පිටත click කළාම close වෙන්න.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Search text එකට ගැළපෙන coins ටික (symbol එකෙන් හෝ base name එකෙන්).
  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return symbols;
    return symbols.filter((s) => s.symbol.includes(q) || s.base.includes(q));
  }, [symbols, query]);

  return (
    <div className="picker" ref={boxRef}>
      <button type="button" className="picker-btn" onClick={() => setOpen((o) => !o)}>
        {value}
        <span className="caret">▾</span>
      </button>

      {open && (
        <div className="picker-pop">
          <input
            className="picker-search"
            autoFocus
            placeholder="Search coin (BTC, SOL...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="picker-meta">
            {error ? `Error: ${error}` : `${filtered.length} / ${symbols.length} perps`}
          </div>
          <ul className="picker-list">
            {filtered.map((s) => (
              <li key={s.symbol}>
                <button
                  type="button"
                  className={s.symbol === value ? 'picker-item active' : 'picker-item'}
                  onClick={() => {
                    onChange(s.symbol);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <span className="sym">{s.base}</span>
                  <span className="px">
                    {s.price > 0 ? formatPrice(s.price, s.priceDecimals) : '-'}
                  </span>
                  <span
                    className={
                      s.changePct === null ? 'chg' : s.changePct >= 0 ? 'chg up' : 'chg down'
                    }
                  >
                    {s.changePct === null ? '-' : formatChange(s.changePct)}
                  </span>
                  <span className="vol">{compact(s.notional24h)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
