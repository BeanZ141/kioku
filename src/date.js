// Image apps commonly receive filenames with a more reliable capture time than
// their EXIF (for example, editor exports that strip or rewrite EXIF dates).
export function dateFromFilename(filename) {
  const name = filename || ''
  const picsart = name.match(/(?:picsart[_-])?(\d{2})-(\d{2})-(\d{2})[_-](\d{2})-(\d{2})-(\d{2})/i)
  if (picsart) {
    const [, yy, mm, dd, hh, min, ss] = picsart
    return new Date(2000 + Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss))
  }
  const pixel = name.match(/(?:PXL|IMG|Screenshot)[_-]?(20\d{2})[._-]?(\d{2})[._-]?(\d{2})[_ -]?(\d{2})[._-]?(\d{2})[._-]?(\d{2})/i)
  if (pixel) {
    const [, yyyy, mm, dd, hh, min, ss] = pixel
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss))
  }
  return null
}

export function resolveCaptureDate(filename, exifDate, storedDate) {
  const namedDate = dateFromFilename(filename)
  // An explicit clock time in a camera/editor filename is preferred over a
  // generated/upload timestamp. EXIF remains the source for generic names.
  return namedDate || exifDate || storedDate || new Date()
}
