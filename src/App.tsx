import { useState } from 'react';
import { Chart } from './components/Chart';
import { IndicatorMenu } from './components/IndicatorMenu';
import { NotificationCenter } from './components/NotificationCenter';
import { PositionHistory } from './components/PositionHistory';
import { SymbolPicker } from './components/SymbolPicker';
import { TimeframeBar } from './components/TimeframeBar';
import { Watchlist } from './components/Watchlist';
import { useStore } from './store';
import type { PositionRecord } from './lib/indicatorRegistry';

/**
 * මුළු app එකේ layout එක: උඩින් toolbar එක (coin picker, timeframe, indicators),
 * යටින් chart එකයි දකුණු පැත්තේ watchlist එකයි. දේවල් ඔක්කොම store එකේ
 * තියෙනවා, Chart එක ඒවා බලාගෙන අඳිනවා.
 */
export default function App() {
  const symbol = useStore((s) => s.symbol);
  const interval = useStore((s) => s.interval);
  const setSymbol = useStore((s) => s.setSymbol);
  const setInterval = useStore((s) => s.setInterval);

  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Chart එකේ indicators වලින් එන positions — පහළ drawer එකට.
  const [positions, setPositions] = useState<PositionRecord[]>([]);

  return (
    <div className="app">
      <header className="toolbar">
        <SymbolPicker value={symbol} onChange={setSymbol} />
        <TimeframeBar value={interval} onChange={setInterval} />
        <IndicatorMenu />

        <div className="status">
          {price !== null && <span className="price">{price}</span>}
          {loading && <span className="dim">loading…</span>}
          {error && <span className="err">{error}</span>}
          <NotificationCenter />
        </div>
      </header>

      <main className="body">
        <div className="chart-col">
          <div className="chart-wrap">
            <Chart
              symbol={symbol}
              interval={interval}
              onPrice={setPrice}
              onLoading={setLoading}
              onError={setError}
              onPositions={setPositions}
            />
          </div>
          <PositionHistory positions={positions} />
        </div>
        <Watchlist />
      </main>
    </div>
  );
}
