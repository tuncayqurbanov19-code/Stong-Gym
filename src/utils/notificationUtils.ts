/**
 * Browser Push Notification & Audio alert utility for Zal Barı
 */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioContextClass();
  }
  return sharedAudioCtx;
}

/**
 * iOS Safari / Android Chrome üçün səs kontekstini istifadəçi toxunuşu zamanı aktivləşdirir.
 * Kamera açılarkən ("Oxut" basıldıqda) çağırılmalıdır ki, skan zamanı səs bloklanmasın.
 */
export function unlockAudioContext(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    // 1 nümunəlik səssiz buffer iOS Safari audio kanalını açır
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // Ignore audio unlock errors
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('Bu brauzer bildirişləri dəstəkləmir.');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (e) {
    console.error('Bildiriş icazəsi alınarkən xəta:', e);
    return 'denied';
  }
}

export function playAlertSound(type: 'warning' | 'success' | 'beep' = 'warning'): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const now = ctx.currentTime;

    if (type === 'warning') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.28);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.28);
    } else if (type === 'success') {
      // Kassa skaneri iki tonlu "bip-bip" səsi
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, now); // B5
      osc.frequency.setValueAtTime(1318.51, now + 0.085); // E6
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else {
      // Klassik tək skaner "bip" səsi
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1250, now);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.13);
      osc.start(now);
      osc.stop(now + 0.13);
    }
  } catch {
    // AudioContext might be blocked until user gesture, ignore safely
  }
}

export function sendLowStockNotification(productName: string, activeStock: number, threshold: number): void {
  playAlertSound('warning');

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const title = '⚠️ Qalıq Xəbərdarlığı — Zal Barı';
      const options: NotificationOptions = {
        body: `"${productName}" məhsulunun aktiv depo qalığı ${activeStock} ədədə düşdü! (Minimum hədd: ${threshold})`,
        icon: '/pwa-192x192.png?v=20261112',
        badge: '/pwa-192x192.png?v=20261112',
        tag: `stock-${productName}`,
      };
      new Notification(title, options);
    } catch (e) {
      console.warn('Native notification xətası:', e);
    }
  }
}
