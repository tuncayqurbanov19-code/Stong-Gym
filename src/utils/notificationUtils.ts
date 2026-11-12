/**
 * Browser Push Notification & Audio alert utility for Zal Barı
 */

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
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'warning') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    }
  } catch (err) {
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
