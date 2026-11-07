// On-phone photo processing: orientation, resize, compress, thumbnail. The whole frame
// is kept (no square crop), so what you saw in the camera is what gets saved.
// Re-encoding through a canvas drops all metadata, including GPS location.
const FULL = 1280
const THUMB = 400
const MAX_BYTES = 350 * 1024

export interface Processed { full: Blob; thumb: Blob }

async function encode(bmp: ImageBitmap, longSide: number, maxBytes: number): Promise<Blob> {
  const scale = Math.min(1, longSide / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, w, h)
  let q = 0.8
  for (;;) {
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: q })
    if (blob.size <= maxBytes || q <= 0.6) return blob
    q -= 0.05
  }
}

export async function processPhoto(file: Blob): Promise<Processed> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const full = await encode(bmp, FULL, MAX_BYTES)
    const thumbBmp = await createImageBitmap(full)
    const thumb = await encode(thumbBmp, THUMB, Number.MAX_SAFE_INTEGER)
    thumbBmp.close()
    return { full, thumb }
  } finally {
    bmp.close()
  }
}

/** Care label: keep the whole frame (no square crop) so text isn't cut, longest side 1280. */
export async function processLabel(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bmp, 0, 0, w, h)
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
  } finally {
    bmp.close()
  }
}
