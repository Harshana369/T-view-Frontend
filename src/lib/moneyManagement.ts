/**
 * Money management / risk engine.
 *
 * ⚠️ මුලින්ම කියන්න ඕන දෙයක්: **MM එකෙන් ඍණ expectancy එකක් ධන කරන්නේ
 *    නෑ.** Trade එකකට සාමාන්‍ය ප්‍රතිඵලය ඍණ නම්, sizing ක්‍රමයක්වත් ඒක
 *    හරවන්නේ නෑ — ඒක ගණිතයෙන්ම එහෙමයි. MM එකෙන් කරන්නේ:
 *
 *      • තියෙන edge එකක් compound කරන එක
 *      • ruin එකෙන් බේරිලා edge එක ලැබෙනකම් ඉන්න එක
 *      • growth rate එක optimize කරන එක (Kelly)
 *
 *    ඒ නිසා මේකේ මුල්ම output එක **"මේක viable ද"** කියන එකයි.
 */

export interface MoneyOptions {
  startEquity: number;
  /** Trade එකකට අවදානමට දාන equity ප්‍රතිශතය. */
  riskPct: number;
  /** ලාභය ආපහු trade කරනවද (compound), නැත්නම් ස්ථිර ප්‍රමාණයක්ද. */
  compound: boolean;
  /** Equity එකෙන් මෙච්චර % එකක් වැටුනොත් නවතිනවා (0 = නවතින්නේ නෑ). */
  maxDrawdownStopPct: number;
  /** Ruin කියන්නේ මොකද — පටන්ගත්ත එකෙන් මෙච්චර % එකකට වැටෙන එක. */
  ruinLevelPct: number;
}

export const MONEY_DEFAULTS: MoneyOptions = {
  startEquity: 1000,
  riskPct: 1,
  compound: true,
  maxDrawdownStopPct: 0,
  ruinLevelPct: 50,
};

export interface EquityPoint {
  /** Trade එකේ index (chart bar එක). */
  index: number;
  equity: number;
}

export interface MoneyResult {
  equityCurve: EquityPoint[];
  finalEquity: number;
  returnPct: number;
  /** Equity curve එකේ ලොකුම වැටීම (%). */
  maxDrawdownPct: number;
  /** ඒක සිද්ධ වුණු trade එකේ index. */
  maxDrawdownAt: number;
  tradesTaken: number;
  /** maxDrawdownStop එකෙන් නැවතුනාද. */
  stoppedOut: boolean;

  // ── විනිශ්චය ──────────────────────────────────────────────────────
  /** Trade එකකට සාමාන්‍යය, R වලින්. **මේක ධන නම් විතරයි ඉතුරු දේට තේරුමක්.** */
  expectancyR: number;
  /** Kelly ගේ optimal fraction (%). ඍණ නම් මේකේ edge එකක් නෑ. */
  kellyPct: number;
  /** Kelly බාගය — ප්‍රායෝගිකව ඒක පාවිච්චි කරන්නේ. */
  halfKellyPct: number;
  /**
   * Monte Carlo — ඇත්ත trades නැවත නැවත shuffle කරලා, ruin එකට යන
   * path ගාණේ ප්‍රතිශතය.
   */
  riskOfRuinPct: number;
  /** මේ risk% එකට ruin එකට යන්න ඕන අඛණ්ඩ පාඩු ගාණ. */
  lossesToRuin: number;
}

/** Trade එකක් — R වලින් ප්‍රතිඵලයයි ඒක වුණු bar එකයි. */
export interface RTrade {
  index: number;
  r: number;
}

/** නැවත නැවත එකම ප්‍රතිඵලය එන random generator එකක්. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Monte Carlo risk of ruin — ඇත්ත trades වලින් (with replacement) නැවත
 * නැවත path හදලා, කීයක් ruin එකට යනවද කියලා බලනවා.
 *
 * Formula එකකට වඩා මේක හොඳයි, මොකද ඇත්ත R බෙදීම (fat tails, trail එකේ
 * විශාල දිනුම්) එහෙම්මම පාවිච්චි වෙනවා.
 */
function riskOfRuin(rs: number[], o: MoneyOptions, paths = 2000): number {
  if (rs.length < 5) return 0;
  const rand = rng(12345);
  const ruinAt = o.startEquity * (o.ruinLevelPct / 100);
  let ruined = 0;

  for (let p = 0; p < paths; p++) {
    let equity = o.startEquity;
    for (let k = 0; k < rs.length; k++) {
      const r = rs[(rand() * rs.length) | 0];
      const risked = o.compound ? equity * (o.riskPct / 100) : o.startEquity * (o.riskPct / 100);
      equity += risked * r;
      if (equity <= ruinAt) { ruined++; break; }
    }
  }
  return (ruined / paths) * 100;
}

export function computeMoneyManagement(trades: RTrade[], o: MoneyOptions): MoneyResult {
  const rs = trades.map((t) => t.r);
  const n = rs.length;

  const blank: MoneyResult = {
    equityCurve: [], finalEquity: o.startEquity, returnPct: 0,
    maxDrawdownPct: 0, maxDrawdownAt: -1, tradesTaken: 0, stoppedOut: false,
    expectancyR: 0, kellyPct: 0, halfKellyPct: 0, riskOfRuinPct: 0, lossesToRuin: 0,
  };
  if (n === 0) return blank;

  // ── Equity curve ──────────────────────────────────────────────────
  const equityCurve: EquityPoint[] = [];
  let equity = o.startEquity;
  let peak = o.startEquity;
  let maxDd = 0;
  let maxDdAt = -1;
  let stoppedOut = false;
  let taken = 0;

  for (const t of trades) {
    const risked = o.compound ? equity * (o.riskPct / 100) : o.startEquity * (o.riskPct / 100);
    equity += risked * t.r;
    taken++;
    equityCurve.push({ index: t.index, equity });

    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDd) { maxDd = dd; maxDdAt = t.index; }

    // Drawdown stop — ඒක පැන්නොත් trading නවතිනවා.
    if (o.maxDrawdownStopPct > 0 && dd >= o.maxDrawdownStopPct) {
      stoppedOut = true;
      break;
    }
  }

  // ── Kelly ─────────────────────────────────────────────────────────
  // R-multiple පද්ධතියකට: f* = (W·b − L) / b,  b = සාමාන්‍ය දිනුම ÷ සාමාන්‍ය පාඩුව
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r <= 0);
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length ? -losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  const W = wins.length / n;
  const b = avgLoss > 0 ? avgWin / avgLoss : 0;
  // Kelly එක **risk එකේ** ප්‍රතිශතයක් — trade එකකට අවදානමට දාන්න පුළුවන් උපරිමය.
  const kelly = b > 0 ? (W * b - (1 - W)) / b : 0;

  const expectancyR = rs.reduce((a, r) => a + r, 0) / n;
  // Risk% එකට අඛණ්ඩ පාඩු කීයකින් ruin එකට යනවද (compound නැතුව).
  const lossPerTrade = o.riskPct / 100;
  const lossesToRuin = lossPerTrade > 0
    ? Math.ceil((o.ruinLevelPct / 100) / lossPerTrade)
    : Infinity;

  return {
    equityCurve,
    finalEquity: equity,
    returnPct: ((equity - o.startEquity) / o.startEquity) * 100,
    maxDrawdownPct: maxDd,
    maxDrawdownAt: maxDdAt,
    tradesTaken: taken,
    stoppedOut,
    expectancyR,
    kellyPct: kelly * 100,
    halfKellyPct: (kelly * 100) / 2,
    riskOfRuinPct: riskOfRuin(rs, o),
    lossesToRuin,
  };
}
