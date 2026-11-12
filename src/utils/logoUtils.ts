import { getSupabaseClient } from '../lib/supabase';

export const BRANDING_BUCKET = 'branding';
export const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

const ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'svg', 'webp']);
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/webp',
]);

/**
 * Validates logo file type (png, jpg, svg, webp) and size (max 2MB).
 * Returns Azerbaijani error string or null if valid.
 */
export function validateLogoFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const hasValidMime = ALLOWED_MIME_TYPES.has(file.type.toLowerCase());
  const hasValidExt = ALLOWED_EXTENSIONS.has(ext);

  if (!hasValidMime && !hasValidExt) {
    return 'Yalnız PNG, JPG, SVG və ya WebP formatlı şəkillər qəbul edilir.';
  }

  if (file.size > MAX_LOGO_SIZE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(2);
    return `Fayl ölçüsü çox böyükdür (${mb} MB). Maksimum icazə verilən ölçü 2 MB-dır.`;
  }

  return null;
}

/**
 * Utility to generate resized and maskable PNG icons using HTML Canvas
 */
export function generateCanvasIcon(
  imageSource: string,
  size: number,
  isMaskable: boolean = false,
  backgroundColor: string = '#09090b'
): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(imageSource);
        return;
      }

      if (isMaskable || (backgroundColor && backgroundColor !== 'transparent')) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, size, size);
      }

      const padding = isMaskable ? size * 0.15 : size * 0.05;
      const availableWidth = size - padding * 2;
      const availableHeight = size - padding * 2;

      const natW = img.width || size;
      const natH = img.height || size;
      const scale = Math.min(availableWidth / natW, availableHeight / natH);
      const drawWidth = natW * scale;
      const drawHeight = natH * scale;
      const drawX = (size - drawWidth) / 2;
      const drawY = (size - drawHeight) / 2;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

      try {
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      } catch (err) {
        console.warn('Canvas export error:', err);
        resolve(imageSource);
      }
    };

    img.onerror = () => {
      resolve(imageSource);
    };

    img.src = imageSource;
  });
}

let lastManifestBlobUrl: string | null = null;

/**
 * Updates document title, theme-color, favicon, apple-touch-icon, and dynamic PWA manifest
 */
export async function updateBrowserBranding(
  logoUrl: string | null | undefined,
  appName: string = 'Zal Barı',
  primaryColor: string = '#dc2626'
): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const cleanAppName = appName.trim() || 'Zal Barı';
  document.title = `${cleanAppName} — İdarəetmə və POS Sistemi`;

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', primaryColor || '#09090b');
  }
  const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appleTitleMeta) {
    appleTitleMeta.setAttribute('content', cleanAppName);
  }
  const appNameMeta = document.querySelector('meta[name="application-name"]');
  if (appNameMeta) {
    appNameMeta.setAttribute('content', cleanAppName);
  }

  if (!logoUrl) {
    const existingApple = document.querySelector('link[rel="apple-touch-icon"]');
    if (existingApple) existingApple.setAttribute('href', '/apple-touch-icon.png');
    const existingFavicon = document.querySelector('link[rel="icon"]');
    if (existingFavicon) existingFavicon.setAttribute('href', '/icon.svg');
    return;
  }

  try {
    const [faviconUrl, appleTouchUrl, icon192Url, icon512Url, iconMaskableUrl] = await Promise.all([
      generateCanvasIcon(logoUrl, 32, false, 'transparent'),
      generateCanvasIcon(logoUrl, 180, false, '#09090b'),
      generateCanvasIcon(logoUrl, 192, false, '#09090b'),
      generateCanvasIcon(logoUrl, 512, false, '#09090b'),
      generateCanvasIcon(logoUrl, 512, true, '#09090b'),
    ]);

    let faviconLink = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    if (!faviconLink) {
      faviconLink = document.createElement('link');
      faviconLink.rel = 'icon';
      document.head.appendChild(faviconLink);
    }
    faviconLink.type = 'image/png';
    faviconLink.href = faviconUrl;

    let appleLink = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
    if (!appleLink) {
      appleLink = document.createElement('link');
      appleLink.rel = 'apple-touch-icon';
      document.head.appendChild(appleLink);
    }
    appleLink.href = appleTouchUrl;

    const dynamicManifest = {
      id: '/',
      name: cleanAppName,
      short_name: cleanAppName.length > 12 ? cleanAppName.substring(0, 12) : cleanAppName,
      description: `${cleanAppName} — İdman Zalı Barı İdarəetmə və Satış Sistemi`,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#09090b',
      theme_color: primaryColor || '#dc2626',
      icons: [
        {
          src: icon192Url,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: icon512Url,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: iconMaskableUrl,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    };

    if (lastManifestBlobUrl) {
      URL.revokeObjectURL(lastManifestBlobUrl);
    }
    const manifestBlob = new Blob([JSON.stringify(dynamicManifest, null, 2)], {
      type: 'application/manifest+json',
    });
    const manifestBlobUrl = URL.createObjectURL(manifestBlob);
    lastManifestBlobUrl = manifestBlobUrl;

    let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = manifestBlobUrl;
  } catch (err) {
    console.error('Failed to update browser branding icons:', err);
  }
}

/**
 * Extracts Supabase storage object path from a public URL for a given bucket.
 */
function extractStoragePath(publicUrl: string, bucketName: string): string | null {
  try {
    const marker = `/storage/v1/object/public/${bucketName}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(publicUrl.slice(idx + marker.length).split('?')[0]);
  } catch {
    return null;
  }
}

/**
 * Deletes an old logo object from Supabase Storage if it resides in 'branding' or 'app-branding'.
 */
export async function deleteLogoFromSupabase(logoUrl: string | null | undefined): Promise<{ error: string | null }> {
  if (!logoUrl) return { error: null };
  const supabase = getSupabaseClient();
  if (!supabase) return { error: null };

  try {
    for (const bucket of [BRANDING_BUCKET, 'app-branding']) {
      const path = extractStoragePath(logoUrl, bucket);
      if (path) {
        const { error } = await supabase.storage.from(bucket).remove([path]);
        if (error) {
          return { error: error.message };
        }
        return { error: null };
      }
    }
    return { error: null };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Köhnə loqo silinərkən xəta baş verdi.' };
  }
}

/**
 * Uploads a logo file to Supabase Storage in the 'branding' bucket.
 * Validates type and size, removes old logo if provided, returns public URL.
 */
export async function uploadLogoToSupabase(
  file: File,
  previousLogoUrl?: string | null
): Promise<{ url: string | null; error: string | null }> {
  const validationError = validateLogoFile(file);
  if (validationError) {
    return { url: null, error: validationError };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      url: null,
      error: 'Supabase qoşulmayıb — loqo yerli yaddaşda saxlanıldı.',
    };
  }

  try {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : 'png';
    const fileName = `logo-${Date.now()}.${safeExt}`;
    const contentType = file.type || (safeExt === 'svg' ? 'image/svg+xml' : `image/${safeExt}`);

    const { error: uploadError } = await supabase.storage
      .from(BRANDING_BUCKET)
      .upload(fileName, file, {
        upsert: true,
        contentType,
        cacheControl: '3600',
      });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data: publicData } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(fileName);

    if (previousLogoUrl) {
      await deleteLogoFromSupabase(previousLogoUrl);
    }

    return { url: publicData.publicUrl, error: null };
  } catch (err: unknown) {
    return {
      url: null,
      error: err instanceof Error ? err.message : 'Şəkil yüklənərkən xəta baş verdi.',
    };
  }
}
