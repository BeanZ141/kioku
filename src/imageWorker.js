function proxyR2Url(url) {
  if (!url) return url
  const isLocalhost = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1'
  const r2Domain = 'pub-9ef80b3adaf74b38bd2c3bc8bfd4ccec.r2.dev'
  if (isLocalhost && url.includes(r2Domain)) {
    return url.replace(`https://${r2Domain}`, '/r2-media')
  }
  return url
}

self.onmessage = async (event) => {
  const { id, src, size, quality } = event.data

  try {
    const response = await fetch(proxyR2Url(src), { mode: 'cors' })
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`)
    }
    const blob = await response.blob()

    const bitmap = await createImageBitmap(blob)

    let w = bitmap.width
    let h = bitmap.height
    const longest = Math.max(w, h)

    if (longest > size) {
      const scale = size / longest
      w = Math.round(w * scale)
      h = Math.round(h * scale)
    }

    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Could not get 2D context for OffscreenCanvas')
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const resizedBlob = await canvas.convertToBlob({
      type: 'image/webp',
      quality: quality
    })

    self.postMessage({ id, success: true, blob: resizedBlob })
  } catch (err) {
    self.postMessage({ id, success: false, error: err.message || String(err) })
  }
}
