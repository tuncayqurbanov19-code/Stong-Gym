import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, Check, AlertCircle, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'Barkod Oxuyucu',
}) => {
  const { products } = useApp();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  const [hasCamera, setHasCamera] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Kamera dəstəklənmir və ya HTTPS tələb olunur.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Start BarcodeDetector loop if supported
      if ('BarcodeDetector' in window) {
        try {
          const barcodeDetector = new (window as unknown as {
            BarcodeDetector: new (opts?: { formats?: string[] }) => {
              detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
            };
          }).BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
          });

          scanIntervalRef.current = window.setInterval(async () => {
            if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
              try {
                const barcodes = await barcodeDetector.detect(videoRef.current);
                if (barcodes.length > 0 && barcodes[0].rawValue) {
                  handleDetected(barcodes[0].rawValue);
                }
              } catch {
                // Ignore frame detection hiccups
              }
            }
          }, 300);
        } catch {
          // BarcodeDetector options not supported, fallback to manual or image
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kameraya qoşulmaq mümkün olmadı.';
      setCameraError(msg);
      setHasCamera(false);
    }
  };

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const handleDetected = (code: string) => {
    stopCamera();
    onScan(code.trim());
    onClose();
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      handleDetected(manualCode.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-800 overflow-hidden flex flex-col text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-red-500" />
            <h3 className="text-base font-bold text-white">{title}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Bağla"
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Viewport / Viewfinder */}
        <div className="relative bg-black aspect-[4/3] flex items-center justify-center overflow-hidden">
          {hasCamera && !cameraError ? (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {/* Animated scan reticle */}
              <div className="absolute inset-8 border-2 border-dashed border-red-500/80 rounded-2xl pointer-events-none flex flex-col items-center justify-center">
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_12px_rgba(239,68,68,0.9)] animate-pulse" />
                <span className="absolute bottom-2 text-xs font-mono text-red-300 bg-black/80 px-2 py-0.5 rounded-md">
                  Barkodu çərçivəyə tutun
                </span>
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-zinc-300 flex flex-col items-center justify-center gap-2">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <p className="text-xs text-zinc-400 max-w-xs">{cameraError || 'Kamera hazır deyil'}</p>
            </div>
          )}
        </div>

        {/* Manual Input Form */}
        <div className="p-4 bg-zinc-950 border-t border-zinc-800 space-y-3">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              placeholder="Barkodu əl ilə yazın (məs: 47600101)..."
              className="flex-1 px-3 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-900 text-white focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-red-600/30 whitespace-nowrap flex items-center gap-1.5 shrink-0"
            >
              <Check className="w-4 h-4" />
              Daxil et
            </button>
          </form>

          {/* Quick preset barcode buttons */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-red-400" />
              <span>Sürətli sınaq üçün mövcud məhsul barkodları:</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {products.slice(0, 6).map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleDetected(p.barcode)}
                  className="px-2 py-1 text-xs font-mono bg-zinc-900 border border-zinc-800 hover:border-red-500 text-zinc-300 rounded-lg transition-colors truncate max-w-[200px]"
                  title={`${p.name} (${p.barcode})`}
                >
                  {p.barcode} · {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-zinc-900 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white rounded-lg transition-colors"
          >
            Ləğv et
          </button>
        </div>
      </div>
    </div>
  );
};
