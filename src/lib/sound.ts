/**
 * Alert එකක් ආවම ගහන කෙටි beep එක.
 *
 * Audio file එකක් නෑ — Web Audio API එකෙන්ම tone එකක් හදනවා. ඒකෙන්:
 *  - bundle එකට binary asset එකක් එකතු වෙන්නේ නෑ
 *  - offline/network නැතුවත් වැඩ කරනවා
 *  - BUY/SELL දෙකට වෙනස් pitch දෙකක් දෙන්න පුළුවන් (බලන්නෙ නැතුවම දිශාව දැනගන්න)
 */

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
    return ctx;
  } catch {
    // Audio support නැති browser එකක් — sound නැතුව ඉතුරු ඔක්කොම වැඩ කරන්න ඕන.
    return null;
  }
}

/** එක tone එකක් — `at` කියන්නේ context එකේ වෙලාව (තත්පර). */
function tone(context: AudioContext, freq: number, at: number, durationS: number): void {
  const osc = context.createOscillator();
  const gain = context.createGain();

  osc.type = 'sine';
  osc.frequency.value = freq;

  // Click එකක් නොඇහෙන්න fade in/out එකක් — square edge එකක් නම් "ටක්" ගානවා.
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.18, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + durationS);

  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(at);
  osc.stop(at + durationS);
}

/**
 * Alert එකකට ගහන ශබ්දය — note දෙකක්.
 *  - buy: උඩට යන දෙකක් (G5 → C6)
 *  - sell: පල්ලෙහාට යන දෙකක් (E5 → A4)
 *
 * Browser autoplay policy එක නිසා user click එකකට කලින් වාදනය වෙන්නේ නෑ —
 * "Scan All Coins" On කරන එකම click එකක් නිසා practice එකේදී ප්‍රශ්නයක් නෑ.
 * ඒත් fail වුණොත් silently ignore කරනවා (scan එක නවතින්නේ නෑ).
 */
export function playAlertSound(dir: 'buy' | 'sell'): void {
  const context = audioContext();
  if (!context) return;

  try {
    // Tab එක background එකේ තිබ්බම context එක suspend වෙනවා — resume කරනවා.
    if (context.state === 'suspended') void context.resume();

    const now = context.currentTime;
    if (dir === 'buy') {
      tone(context, 784, now, 0.12); // G5
      tone(context, 1047, now + 0.11, 0.18); // C6
    } else {
      tone(context, 659, now, 0.12); // E5
      tone(context, 440, now + 0.11, 0.2); // A4
    }
  } catch {
    // Sound එකක් නොගැහුනාට alert එක පේනවා — ඒක ඇති.
  }
}
