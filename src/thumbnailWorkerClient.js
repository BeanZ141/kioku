const worker = new Worker(
  new URL('./imageWorker.js', import.meta.url),
  { type: 'module' }
)

const pendingRequests = new Map()
let nextRequestId = 0

worker.onmessage = (event) => {
  const { id, success, blob, error } = event.data
  const request = pendingRequests.get(id)

  if (request) {
    pendingRequests.delete(id)
    if (success) {
      request.resolve(blob)
    } else {
      request.reject(new Error(error))
    }
  }
}

worker.onerror = (err) => {
  console.error('Image worker error:', err)
  for (const [id, request] of pendingRequests.entries()) {
    request.reject(new Error('Image worker encountered a fatal error'))
    pendingRequests.delete(id)
  }
}

export function resizeImage(src, size, quality) {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++
    pendingRequests.set(id, { resolve, reject })
    worker.postMessage({ id, src, size, quality })
  })
}
