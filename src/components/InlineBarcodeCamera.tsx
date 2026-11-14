import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  X,
  AlertCircle,
  RefreshCw,
  Flashlight,
  ZoomIn,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { MultiFormatReader } from '@zxing/library';
import { BarcodeIndex, lookupBarcodeInIndex, normalizeBarcode } from '../utils/barcodeUtils';
import {
  buildBarcodeDecodeHints,
  createNativeBarcodeDetector,
  decodeVideoFrame,
} from '../utils/cameraBarcodeDecoder';
import { playAlertSound, unlockAudioContext } from '../utils/notificationUtils';

interface InlineBarcodeCameraProps {
  isActive: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  barcodeIndex: BarcodeIndex;
  lastScanFeedback?: {
    status: 'success' | 'error';
    message: string;
    barcode: string;
  } | null;
}

const SAME_BARCODE_CAMERA_COOLDOWN_MS = 1400;
const DIFFERENT_BARCODE_CAMERA_COOLDOWN_MS = 280;

export const InlineBarcodeCamera: React.FC<InlineBarcodeCameraProps> = ({
  isActive,
  onClose,
  onScan,
  barcodeIndex,
  lastScanFeedback,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const roiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tickCountRef = useRef<number>(0);
  const lastCameraReadRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const anyCameraReadTimeRef = useRef<number>(0);

  const [hasCamera, setHasCamera] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [engineLabel, setEngineLabel] = useState<string>('Kamera qoşulur...');
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceIndex, setSelectedDeviceIndex] = useState<number | null>(null);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const onScanRef = useRef(onScan);
  const barcodeIndexRef = useRef(barcodeIndex);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    barcodeIndexRef.current = barcodeIndex;
  }, [barcodeIndex]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const stopCamera = useCallback(() => {
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

  const handleCameraDetected = useCallback((rawCode: string) => {
    const cleaned = normalizeBarcode(rawCode);
    if (!cleaned) return;

    const now = Date.now();
    // Eyni barkod kamera qarşısında saxlandıqda təkrar-təkrar oxunmasının qarşısını alır
    if (
      lastCameraReadRef.current.code === cleaned &&
      now - lastCameraReadRef.current.time < SAME_BARCODE_CAMERA_COOLDOWN_MS
    ) {
      return;
    }
    // Fərqli məhsullar arası minimal stabilizasiya fasiləsi
    if (now - anyCameraReadTimeRef.current < DIFFERENT_BARCODE_CAMERA_COOLDOWN_MS) {
      return;
    }

    lastCameraReadRef.current = { code: cleaned, time: now };
    anyCameraReadTimeRef.current = now;

    if (soundEnabledRef.current) {
      try {
        const matched = lookupBarcodeInIndex(barcodeIndexRef.current, cleaned);
        if (!matched) {
          playAlertSound('beep');
        }
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate(matched ? 70 : 40);
        }
      } catch {
        // Ignore audio/vibration errors
      }
    }

    onScanRef.current(rawCode.trim());
  }, []);

  const startCamera = useCallback(
    async (deviceIdx: number | null) => {
      stopCamera();
      setCameraError(null);
      setHasCamera(true);
      tickCountRef.current = 0;
      setEngineLabel('Kamera icazəsi gözlənilir...');
      unlockAudioContext();

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Bu brauzerdə kamera dəstəklənmir və ya HTTPS tələb olunur.');
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

        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter(d => d.kind === 'videoinput');
          if (videoInputs.length > 0) {
            setCameras(videoInputs);
          }
        } catch {
          // Ignore enumeration error
        }

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
            if (Array.isArray(caps?.focusMode) && caps.focusMode.includes('continuous')) {
              await track
                .applyConstraints({
                  advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet],
                })
                .catch(() => undefined);
            }
          } catch {
            // Ignore capabilities errors
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

        setEngineLabel(
          nativeDetector ? 'Ardıcıl kamera skanı aktivdir' : 'Universal kamera skanı aktivdir'
        );

        const roiCanvas = roiCanvasRef.current || document.createElement('canvas');
        roiCanvasRef.current = roiCanvas;
        const rotCanvas = rotCanvasRef.current || document.createElement('canvas');
        rotCanvasRef.current = rotCanvas;

        const scanLoop = async () => {
          if (!videoRef.current || !streamRef.current) return;

          tickCountRef.current += 1;
          try {
            const code = await decodeVideoFrame({
              video: videoRef.current,
              nativeDetector,
              zxingReader,
              roiCanvas,
              rotCanvas,
              tick: tickCountRef.current,
            });
            if (code) {
              handleCameraDetected(code);
            }
          } catch {
            // Ignore per-frame decode errors
          }

          if (streamRef.current) {
            scanTimerRef.current = window.setTimeout(scanLoop, 120);
          }
        };

        scanTimerRef.current = window.setTimeout(scanLoop, 150);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Kameraya icazə verilmədi və ya kamera tapılmadı.';
        setCameraError(msg);
        setHasCamera(false);
        setEngineLabel('Kamera bağlıdır');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleCameraDetected, stopCamera]
  );

  useEffect(() => {
    if (!isActive) {
      stopCamera();
      return;
    }
    void startCamera(selectedDeviceIndex);
    return () => {
      stopCamera();
    };
  }, [isActive, selectedDeviceIndex, startCamera, stopCamera]);

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
      // Ignore torch error
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
      // Ignore zoom error
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
      // Ignore focus error
    }
  };

  if (!isActive) return null;

  return (
    <div className="rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden shadow-lg text-white">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-zinc-800 bg-zinc-900/90">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <Camera className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-xs font-bold truncate">{engineLabel}</span>
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
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          {zoomRange && hasCamera && (
            <button
              type="button"
              onClick={handleCycleZoom}
              title="Yaxınlaşdır"
              className={`px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-colors ${
                zoomLevel > 1
                  ? 'bg-red-600 text-white border-red-500'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:text-white'
              }`}
            >
              <ZoomIn className="w-3 h-3" />
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
              <Flashlight className="w-3.5 h-3.5" />
            </button>
          )}

          {cameras.length > 1 && (
            <button
              type="button"
              onClick={() =>
                setSelectedDeviceIndex(prev => (prev === null ? 1 : (prev + 1) % cameras.length))
              }
              title="Kameranı dəyiş"
              className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-red-600 border border-zinc-700 hover:border-red-500 text-zinc-200 hover:text-white text-[11px] font-bold flex items-center gap-1 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>Kameranı Bağla</span>
          </button>
        </div>
      </div>

      <div
        onClick={handleTapRefocus}
        className="relative bg-black h-44 sm:h-52 flex items-center justify-center overflow-hidden cursor-pointer"
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
            <div className="absolute inset-x-10 inset-y-5 border-2 border-dashed border-red-500/80 rounded-xl pointer-events-none flex items-center justify-center">
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_10px_rgba(239,68,68,0.9)] animate-pulse" />
            </div>
            <div className="absolute bottom-2 inset-x-3 flex items-center justify-between gap-2 pointer-events-none">
              <span className="text-[10px] font-mono text-zinc-200 bg-black/75 px-2 py-0.5 rounded">
                Barkodu yaxınlaşdırın — avtomatik səbətə düşür
              </span>
              {lastScanFeedback && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded truncate max-w-[55%] ${
                    lastScanFeedback.status === 'success'
                      ? 'bg-emerald-600/90 text-white'
                      : 'bg-red-600/90 text-white'
                  }`}
                >
                  {lastScanFeedback.message}
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="p-4 text-center flex flex-col items-center justify-center gap-2">
            <AlertCircle className="w-6 h-6 text-red-400" />
            <p className="text-xs text-zinc-300 max-w-sm">
              {cameraError || 'Kamera aktivləşdirilmədi.'}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  void startCamera(selectedDeviceIndex);
                }}
                className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-white flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Yenidən cəhd et</span>
              </button>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onClose();
                }}
                className="px-3 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-300"
              >
                Bağla
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
