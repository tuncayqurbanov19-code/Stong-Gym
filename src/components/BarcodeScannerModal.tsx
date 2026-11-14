import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  X,
  Check,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Flashlight,
  Image as ImageIcon,
  ZoomIn,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { MultiFormatReader } from '@zxing/library';
import { useApp } from '../context/AppContext';
import { playAlertSound, unlockAudioContext } from '../utils/notificationUtils';
import { findProductByBarcode } from '../utils/barcodeUtils';
import {
  buildBarcodeDecodeHints,
  createNativeBarcodeDetector,
  decodeImageFile,
  decodeVideoFrame,
} from '../utils/cameraBarcodeDecoder';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
  allowContinuous?: boolean;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'Barkod Oxuyucu',
  allowContinuous = false,
}) => {
  const { products } = useApp();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const roiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectedLockRef = useRef<boolean>(false);
  const cooldownTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tickCountRef = useRef<number>(0);

  const [hasCamera, setHasCamera] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerEngineLabel, setScannerEngineLabel] = useState<string>('Hazırlanır...');
  const [manualCode, setManualCode] = useState('');
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  // null = avtomatik arxa əsas kamera (facingMode: environment), rəqəm = seçilmiş kamera indeksi
  const [selectedDeviceIndex, setSelectedDeviceIndex] = useState<number | null>(null);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [continuousMode, setContinuousMode] = useState<boolean>(false);
  const [lastFeedback, setLastFeedback] = useState<{ code: string; productName?: string; ok: boolean } | null>(null);

  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const productsRef = useRef(products);
  const continuousModeRef = useRef(continuousMode);
  const allowContinuousRef = useRef(allowContinuous);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  useEffect(() => {
    continuousModeRef.current = continuousMode;
  }, [continuousMode]);

  useEffect(() => {
    allowContinuousRef.current = allowContinuous;
  }, [allowContinuous]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const stopCamera = useCallback(() => {
    if (cooldownTimerRef.current) {
      window.clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    if (scanTimerRef.current) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
    setZoomRange(null);
    setZoomLevel(1);
  }, []);

  const handleDetected = useCallback(
    (code: string) => {
      if (detectedLockRef.current) return;
      const cleaned = code.trim();
      if (!cleaned) return;

      detectedLockRef.current = true;
      const matched = findProductByBarcode(productsRef.current, cleaned);

      if (soundEnabledRef.current) {
        try {
          playAlertSound(matched ? 'success' : 'beep');
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(matched ? 80 : 50);
          }
        } catch {
          // Ignore haptic/audio errors
        }
      }

      onScanRef.current(cleaned);

      if (allowContinuousRef.current && continuousModeRef.current) {
        setLastFeedback({
          code: cleaned,
          productName: matched?.name,
          ok: Boolean(matched),
        });
        setManualCode('');
        cooldownTimerRef.current = window.setTimeout(() => {
          detectedLockRef.current = false;
        }, 1100);
      } else {
        stopCamera();
        onCloseRef.current();
      }
    },
    [stopCamera]
  );

  const startCamera = useCallback(
    async (deviceIdx: number | null) => {
      stopCamera();
      setCameraError(null);
      setHasCamera(true);
      detectedLockRef.current = false;
      tickCountRef.current = 0;
      unlockAudioContext();

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Bu brauzerdə canlı kamera dəstəklənmir və ya HTTPS tələb olunur.');
        }

        const preferredDeviceId =
          deviceIdx !== null && cameras.length > 0
            ? cameras[deviceIdx % cameras.length]?.deviceId
            : undefined;

        const constraints: MediaStreamConstraints = {
          video: preferredDeviceId
            ? {
                deviceId: { exact: preferredDeviceId },
                width: { ideal: 1920, min: 640 },
                height: { ideal: 1080, min: 480 },
              }
            : {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920, min: 640 },
                height: { ideal: 1080, min: 480 },
              },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        // İcazə alındıqdan sonra kameraları siyahıla (etiketlər yalnız icazədən sonra açılır)
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter(d => d.kind === 'videoinput');
          if (videoInputs.length > 0) {
            setCameras(videoInputs);
          }
        } catch {
          // Ignore device enumeration issues
        }

        // Fokus, Fənər və Zoom imkanlarını tətbiq et
        const track = stream.getVideoTracks()[0];
        if (track) {
          try {
            const caps = (typeof track.getCapabilities === 'function'
              ? track.getCapabilities()
              : {}) as MediaTrackCapabilities & {
              torch?: boolean;
              focusMode?: string[];
              zoom?: { min: number; max: number; step?: number };
            };

            setTorchSupported(Boolean(caps?.torch));

            if (caps?.zoom && typeof caps.zoom.min === 'number' && typeof caps.zoom.max === 'number') {
              setZoomRange({ min: caps.zoom.min, max: caps.zoom.max });
            }

            const advancedConstraints: Record<string, unknown>[] = [];
            if (Array.isArray(caps?.focusMode) && caps.focusMode.includes('continuous')) {
              advancedConstraints.push({ focusMode: 'continuous' });
            }
            if (advancedConstraints.length > 0) {
              await track.applyConstraints({
                advanced: advancedConstraints as MediaTrackConstraintSet[],
              }).catch(() => undefined);
            }
          } catch {
            // Ignore capability constraints if browser refuses
          }
        }

        const videoEl = videoRef.current;
        if (!videoEl) return;
        videoEl.setAttribute('playsinline', 'true');
        videoEl.srcObject = stream;
        await videoEl.play().catch(() => undefined);

        const nativeDetector = await createNativeBarcodeDetector();
        const zxingReader = new MultiFormatReader();
        zxingReader.setHints(buildBarcodeDecodeHints());

        setScannerEngineLabel(
          nativeDetector ? 'Skan aktivdir (Hibrid HD + ZXing)' : 'Skan aktivdir (Universal ZXing HD)'
        );

        const roiCanvas = roiCanvasRef.current || document.createElement('canvas');
        roiCanvasRef.current = roiCanvas;
        const rotCanvas = rotCanvasRef.current || document.createElement('canvas');
        rotCanvasRef.current = rotCanvas;

        const scanLoop = async () => {
          if (detectedLockRef.current || !videoRef.current || !streamRef.current) return;

          tickCountRef.current += 1;
          try {
            const detectedCode = await decodeVideoFrame({
              video: videoRef.current,
              nativeDetector,
              zxingReader,
              roiCanvas,
              rotCanvas,
              tick: tickCountRef.current,
            });
            if (detectedCode) {
              handleDetected(detectedCode);
              return;
            }
          } catch {
            // Ignore per-frame decode errors
          }

          if (!detectedLockRef.current && streamRef.current) {
            scanTimerRef.current = window.setTimeout(scanLoop, 120);
          }
        };

        scanTimerRef.current = window.setTimeout(scanLoop, 160);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Kameraya qoşulmaq mümkün olmadı. Aşağıdan şəkil yükləyə və ya kodu yaza bilərsiniz.';
        setCameraError(msg);
        setHasCamera(false);
        setScannerEngineLabel('Kamera bağlıdır');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleDetected, stopCamera]
  );

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setManualCode('');
      setLastFeedback(null);
      return;
    }

    void startCamera(selectedDeviceIndex);

    return () => {
      stopCamera();
    };
  }, [isOpen, selectedDeviceIndex, startCamera, stopCamera]);

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      // Ignore if device refuses torch constraint
    }
  };

  const handleCycleZoom = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !zoomRange) return;
    const nextZoom = zoomLevel < 1.8 && zoomRange.max >= 2 ? 2 : 1;
    const clamped = Math.min(zoomRange.max, Math.max(zoomRange.min, nextZoom));
    try {
      await track.applyConstraints({
        advanced: [{ zoom: clamped } as unknown as MediaTrackConstraintSet],
      });
      setZoomLevel(clamped);
    } catch {
      // Ignore zoom errors
    }
  };

  const handleTapRefocus = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet],
      });
    } catch {
      // Ignore focus errors
    }
  };

  const handleSwitchCamera = () => {
    if (cameras.length < 2) return;
    setSelectedDeviceIndex(prev => (prev === null ? 1 : (prev + 1) % cameras.length));
  };

  const handleImageFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    unlockAudioContext();

    try {
      const code = await decodeImageFile(file);
      if (code) {
        handleDetected(code);
        return;
      }
      setCameraError('Şəkildə barkod tapılmadı. Daha aydın və yaxından foto çəkin.');
    } catch {
      setCameraError('Şəkildən barkod oxunmadı. Barkodu aşağıya əl ilə də yaza bilərsiniz.');
    } finally {
      e.target.value = '';
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    unlockAudioContext();
    if (manualCode.trim()) {
      handleDetected(manualCode.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 w-full max-w-md rounded-2xl shadow-2xl border border-zinc-800 overflow-hidden flex flex-col text-white max-h-[94vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <Camera className="w-5 h-5 text-red-500 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white truncate">{title}</h3>
              <p className="text-[11px] text-zinc-400 truncate">{scannerEngineLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                unlockAudioContext();
                setSoundEnabled(prev => !prev);
              }}
              title={soundEnabled ? 'Səsi söndür' : 'Səsi aç'}
              className={`p-1.5 rounded-lg border transition-colors ${
                soundEnabled
                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            {zoomRange && hasCamera && (
              <button
                type="button"
                onClick={handleCycleZoom}
                title="Yaxınlaşdır (Zoom)"
                className={`px-2 py-1 rounded-lg border text-[11px] font-bold transition-colors flex items-center gap-1 ${
                  zoomLevel > 1
                    ? 'bg-red-600 text-white border-red-500'
                    : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:text-white'
                }`}
              >
                <ZoomIn className="w-3.5 h-3.5" />
                <span>{zoomLevel}x</span>
              </button>
            )}
            {torchSupported && hasCamera && (
              <button
                type="button"
                onClick={handleToggleTorch}
                title="Fənər"
                className={`p-1.5 rounded-lg border transition-colors ${
                  torchOn
                    ? 'bg-amber-500 text-black border-amber-400'
                    : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:text-white'
                }`}
              >
                <Flashlight className="w-4 h-4" />
              </button>
            )}
            {cameras.length > 1 && (
              <button
                type="button"
                onClick={handleSwitchCamera}
                title="Kameranı dəyiş"
                className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Bağla"
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Viewport */}
        <div
          onClick={handleTapRefocus}
          className="relative bg-black aspect-[4/3] flex items-center justify-center overflow-hidden cursor-pointer"
        >
          {hasCamera && !cameraError ? (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-x-6 inset-y-10 border-2 border-dashed border-red-500/85 rounded-2xl pointer-events-none flex flex-col items-center justify-center">
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_12px_rgba(239,68,68,0.9)] animate-pulse" />
                <span className="absolute bottom-2 text-[11px] font-mono text-zinc-200 bg-black/80 px-2.5 py-0.5 rounded-md">
                  Barkodu çərçivəyə yaxınlaşdırın (fokus üçün toxunun)
                </span>
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-zinc-300 flex flex-col items-center justify-center gap-3">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <p className="text-xs text-zinc-300 max-w-xs leading-relaxed">
                {cameraError || 'Kamera hazır deyil'}
              </p>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  void startCamera(selectedDeviceIndex);
                }}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-white flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Yenidən cəhd et</span>
              </button>
            </div>
          )}
        </div>

        {/* Photo / Manual Input Form */}
        <div className="p-4 bg-zinc-950 border-t border-zinc-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageFileScan}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-200 flex items-center justify-center gap-2 transition-colors"
            >
              <ImageIcon className="w-4 h-4 text-zinc-400" />
              <span>Şəkildən / Kameradan Foto ilə Oxut</span>
            </button>
          </div>

          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              placeholder="Barkodu yazın və ya skanerlə oxudun..."
              autoFocus
              className="flex-1 px-3 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-900 text-white focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0"
            >
              <Check className="w-4 h-4" />
              <span>Daxil et</span>
            </button>
          </form>

          {allowContinuous && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800">
              <div className="min-w-0">
                <div className="text-xs font-bold text-white">Ardıcıl skan rejimi</div>
                <div className="text-[10px] text-zinc-400">
                  Aktiv olduqda bir neçə məhsulu fasiləsiz səbətə əlavə edir
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={continuousMode}
                onClick={() => setContinuousMode(prev => !prev)}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors shrink-0 ${
                  continuousMode
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                }`}
              >
                {continuousMode ? 'Açıq' : 'Bağlı'}
              </button>
            </div>
          )}

          {lastFeedback && (
            <div
              className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 border ${
                lastFeedback.ok
                  ? 'bg-emerald-950/70 border-emerald-700 text-emerald-300'
                  : 'bg-red-950/70 border-red-700 text-red-300'
              }`}
            >
              <span className="truncate">
                {lastFeedback.ok
                  ? `Əlavə edildi: ${lastFeedback.productName} (${lastFeedback.code})`
                  : `"${lastFeedback.code}" barkodlu məhsul tapılmadı`}
              </span>
              <span className="font-mono text-[10px] shrink-0">OK</span>
            </div>
          )}

          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-red-400" />
              <span>Mövcud məhsul barkodları (sürətli seçim):</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {products.slice(0, 8).map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleDetected(p.barcode)}
                  className="px-2 py-1 text-xs font-mono bg-zinc-900 border border-zinc-800 hover:border-red-500 text-zinc-300 rounded-lg transition-colors truncate max-w-[210px]"
                  title={`${p.name} (${p.barcode})`}
                >
                  {p.barcode} · {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-zinc-900 border-t border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white rounded-lg transition-colors"
          >
            {continuousMode ? 'Bitir və Bağla' : 'Ləğv et'}
          </button>
        </div>
      </div>
    </div>
  );
};
