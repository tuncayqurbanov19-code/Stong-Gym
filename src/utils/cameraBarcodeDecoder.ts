import { BrowserMultiFormatReader } from '@zxing/browser';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  GlobalHistogramBinarizer,
  HTMLCanvasElementLuminanceSource,
  HybridBinarizer,
  MultiFormatReader,
} from '@zxing/library';

export interface NativeBarcodeDetectorLike {
  detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
}

const DESIRED_NATIVE_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'code_93',
  'codabar',
  'itf',
  'qr_code',
  'data_matrix',
];

export function buildBarcodeDecodeHints(): Map<DecodeHintType, unknown> {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_93,
    BarcodeFormat.CODABAR,
    BarcodeFormat.ITF,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return hints;
}

export function decodeCanvasWithZxing(
  canvas: HTMLCanvasElement,
  reader: MultiFormatReader,
  useGlobalHistogram = false
): string | null {
  try {
    const source = new HTMLCanvasElementLuminanceSource(canvas);
    const binarizer = useGlobalHistogram
      ? new GlobalHistogramBinarizer(source)
      : new HybridBinarizer(source);
    const bitmap = new BinaryBitmap(binarizer);
    const result = reader.decodeWithState(bitmap);
    const text = result?.getText()?.trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function createNativeBarcodeDetector(): Promise<NativeBarcodeDetectorLike | null> {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
    return null;
  }

  try {
    const DetectorCtor = (
      window as unknown as {
        BarcodeDetector: {
          new (opts?: { formats?: string[] }): NativeBarcodeDetectorLike;
          getSupportedFormats?: () => Promise<string[]>;
        };
      }
    ).BarcodeDetector;

    let formatsToUse = DESIRED_NATIVE_FORMATS;
    if (typeof DetectorCtor.getSupportedFormats === 'function') {
      const supported = await DetectorCtor.getSupportedFormats().catch((): string[] => []);
      const filtered = DESIRED_NATIVE_FORMATS.filter(f => supported.includes(f));
      if (filtered.length > 0) {
        formatsToUse = filtered;
      }
    }

    return new DetectorCtor({ formats: formatsToUse });
  } catch {
    return null;
  }
}

export async function decodeVideoFrame(params: {
  video: HTMLVideoElement;
  nativeDetector: NativeBarcodeDetectorLike | null;
  zxingReader: MultiFormatReader;
  roiCanvas: HTMLCanvasElement;
  rotCanvas: HTMLCanvasElement;
  tick: number;
}): Promise<string | null> {
  const { video, nativeDetector, zxingReader, roiCanvas, rotCanvas, tick } = params;
  if (video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
    return null;
  }

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cropW = Math.max(320, Math.round(vw * 0.9));
  const cropH = Math.max(220, Math.round(vh * 0.56));
  const sx = Math.max(0, Math.round((vw - cropW) / 2));
  const sy = Math.max(0, Math.round((vh - cropH) / 2));

  const scale = cropW > 1100 ? 1100 / cropW : 1;
  const targetW = Math.round(cropW * scale);
  const targetH = Math.round(cropH * scale);

  if (roiCanvas.width !== targetW || roiCanvas.height !== targetH) {
    roiCanvas.width = targetW;
    roiCanvas.height = targetH;
  }

  const rCtx = roiCanvas.getContext('2d', { willReadFrequently: true });
  if (!rCtx) return null;

  rCtx.imageSmoothingEnabled = false;
  rCtx.drawImage(video, sx, sy, cropW, cropH, 0, 0, targetW, targetH);

  // Engine A: Native BarcodeDetector
  if (nativeDetector) {
    try {
      const roiResults = await nativeDetector.detect(roiCanvas);
      if (roiResults.length > 0 && roiResults[0].rawValue) {
        return roiResults[0].rawValue.trim();
      }
      if (tick % 3 === 0) {
        const fullResults = await nativeDetector.detect(video);
        if (fullResults.length > 0 && fullResults[0].rawValue) {
          return fullResults[0].rawValue.trim();
        }
      }
    } catch {
      // Fallback to ZXing
    }
  }

  // Engine B: ZXing HybridBinarizer / GlobalHistogramBinarizer
  const useGlobalHist = tick % 2 === 0;
  const zxingRoi = decodeCanvasWithZxing(roiCanvas, zxingReader, useGlobalHist);
  if (zxingRoi) return zxingRoi;

  // Engine C: 90-degree rotated pass for vertical barcodes
  if (tick % 2 === 0) {
    if (rotCanvas.width !== targetH || rotCanvas.height !== targetW) {
      rotCanvas.width = targetH;
      rotCanvas.height = targetW;
    }
    const rotCtx = rotCanvas.getContext('2d', { willReadFrequently: true });
    if (rotCtx) {
      rotCtx.save();
      rotCtx.translate(targetH / 2, targetW / 2);
      rotCtx.rotate(Math.PI / 2);
      rotCtx.drawImage(roiCanvas, -targetW / 2, -targetH / 2);
      rotCtx.restore();

      const rotatedCode = decodeCanvasWithZxing(rotCanvas, zxingReader, false);
      if (rotatedCode) return rotatedCode;
    }
  }

  return null;
}

export async function decodeImageFile(file: File): Promise<string | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Şəkil yüklənmədi'));
    });

    const maxDim = 1400;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const reader = new MultiFormatReader();
    reader.setHints(buildBarcodeDecodeHints());

    if (ctx) {
      ctx.drawImage(img, 0, 0, w, h);

      const direct =
        decodeCanvasWithZxing(canvas, reader, false) ||
        decodeCanvasWithZxing(canvas, reader, true);
      if (direct) return direct;

      const rot = document.createElement('canvas');
      rot.width = h;
      rot.height = w;
      const rotCtx = rot.getContext('2d');
      if (rotCtx) {
        rotCtx.translate(h / 2, w / 2);
        rotCtx.rotate(Math.PI / 2);
        rotCtx.drawImage(canvas, -w / 2, -h / 2);
        const rotRes =
          decodeCanvasWithZxing(rot, reader, false) ||
          decodeCanvasWithZxing(rot, reader, true);
        if (rotRes) return rotRes;
      }
    }

    const browserReader = new BrowserMultiFormatReader(buildBarcodeDecodeHints());
    const res = await browserReader.decodeFromImageUrl(objectUrl);
    return res?.getText()?.trim() || null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
