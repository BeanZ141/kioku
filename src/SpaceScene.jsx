import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { getThumbnail, saveThumbnail } from './thumbnailCache'
import { resizeImage } from './thumbnailWorkerClient'

/* ─────────── deterministic random ─────────── */
function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

/* ─────────── layout modes ─────────── */

/** Spherical — golden-angle distribution with radial misalignment (back & forth) */
function layoutSpherical(count, gapX, gapY, gapZ) {
  const rand = seededRandom(42)
  const positions = []
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))

  for (let i = 0; i < count; i++) {
    const t = i / Math.max(count - 1, 1)

    // Base spherical angles/ratios
    const yVal = (t * 2 - 1)
    const theta = goldenAngle * i
    const rBase = Math.sqrt(1 - yVal * yVal)

    // Apply spreads to base axes
    const x = Math.cos(theta) * rBase * count * gapX * 0.05
    const y = yVal * count * gapY * 0.03
    const z = Math.sin(theta) * rBase * count * gapZ * 0.05

    // Misalign back & forth along radial direction
    const posVec = new THREE.Vector3(x, y, z)
    const dist = posVec.length() || 1
    const dir = posVec.clone().normalize()

    // Move back/forth along radial line
    const maxGap = Math.max(gapX, gapY, gapZ)
    const radialOffset = (rand() - 0.5) * maxGap * 1.5
    posVec.addScaledVector(dir, radialOffset)

    // Subtle random jitter
    posVec.x += (rand() - 0.5) * gapX * 0.3
    posVec.y += (rand() - 0.5) * gapY * 0.3
    posVec.z += (rand() - 0.5) * gapZ * 0.3

    positions.push(posVec)
  }
  return positions
}

/** Scattered — rectangular scatter in a box volume */
function layoutScattered(count, gapX, gapY, gapZ) {
  const rand = seededRandom(77)
  const positions = []
  const extentX = Math.cbrt(count) * gapX * 0.8
  const extentY = Math.cbrt(count) * gapY * 0.8
  const extentZ = Math.cbrt(count) * gapZ * 0.8

  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * extentX * 2
    const y = (rand() - 0.5) * extentY * 2
    const z = (rand() - 0.5) * extentZ * 2
    positions.push(new THREE.Vector3(x, y, z))
  }
  return positions
}

const LAYOUTS = { spherical: layoutSpherical, scattered: layoutScattered }


/* ─────────── reusable vectors (avoid GC in hot loop) ─────────── */
const _tmpDisp = new THREE.Vector3()
const _tmpPush = new THREE.Vector3()
const _tmpScale = new THREE.Vector3()
const _tmpPos = new THREE.Vector3()
const _prevMouse = new THREE.Vector2(-9999, -9999)

/* ─────────── hover scattering effect controls ─────────── */
const SCATTER_RADIUS = 30.0
const SCATTER_STRENGTH = 25.0

/* ─────────── texture optimisation ─────────── */
const MAX_TEX_SIZE = 172
const MAX_LOADED_TEXTURES = 500
const CONCURRENT_LOADS = 6

const PLACEHOLDER_COLORS = [
  0x2a2a2a, 0x1e2a35, 0x2a1e2a, 0x1e352a, 0x35301e,
  0x252530, 0x302528, 0x28302a, 0x2d2525, 0x25282d,
]

function canvasFallbackTex(img, w, h, mipmaps, minFilter) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(img, 0, 0, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.generateMipmaps = mipmaps
  tex.minFilter = minFilter
  tex.magFilter = THREE.LinearFilter
  tex.flipY = true
  tex.userData = { aspect: img.naturalWidth / img.naturalHeight }
  return tex
}
function proxyR2Url(url) {
  if (!url) return url
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  const r2Domain = 'pub-9ef80b3adaf74b38bd2c3bc8bfd4ccec.r2.dev'
  if (isLocalhost && url.includes(r2Domain)) {
    return url.replace(`https://${r2Domain}`, '/r2-media')
  }
  return url
}

async function loadImageTexture(target, maxSize, opts = {}) {
  const { mipmaps = false, minFilter = THREE.LinearFilter } = opts
  const isItem = typeof target === 'object' && target !== null
  const rawSrc = isItem ? (target.spaceSrc || target.thumbSrc || target.src || target.originalSrc) : target
  if (!rawSrc) throw new Error('No image URL available')

  const src = proxyR2Url(rawSrc)
  const idKey = isItem ? (target.id || target.filename) : rawSrc
  const cacheKey = `${idKey}-${maxSize}-0.7`

  let blob = await getThumbnail(cacheKey)

  if (!blob) {
    try {
      blob = await resizeImage(src, maxSize, 0.7)
      await saveThumbnail(cacheKey, blob)
    } catch (err) {
      console.warn(`Space Scene: Failed to downscale image via worker: ${src}`, err)
      return new Promise((resolve, reject) => {
        const img = new Image()
        const isAbsolute = src.startsWith('http://') || src.startsWith('https://')
        const isSameOrigin = isAbsolute ? src.startsWith(window.location.origin) : true
        if (!isSameOrigin) {
          img.crossOrigin = 'anonymous'
        }
        img.onload = () => {
          let w = img.naturalWidth, h = img.naturalHeight
          if (w > maxSize || h > maxSize) {
            const scale = maxSize / Math.max(w, h)
            w = Math.round(w * scale)
            h = Math.round(h * scale)
          }
          resolve(canvasFallbackTex(img, w, h, mipmaps, minFilter))
        }
        img.onerror = (e) => {
          console.error(`Space Scene: Raw fallback image loading failed: ${src}`, e)
          reject(new Error(`Failed to load raw image: ${src}`))
        }
        img.src = src
      })
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let w = img.naturalWidth, h = img.naturalHeight
      resolve(canvasFallbackTex(img, w, h, mipmaps, minFilter))
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(objectUrl)
      console.error(`Space Scene: Failed to render blob texture: ${cacheKey}`, e)
      reject(new Error('Failed to render blob'))
    }
    img.src = objectUrl
  })
}

async function loadThumbnailTexture(item) {
  return loadImageTexture(item, MAX_TEX_SIZE)
}

const loadHighQualityTexture = (src) => loadImageTexture(src, 1024, {
  mipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, quality: 'high'
})

function batchLoadTextures(jobs, concurrency = CONCURRENT_LOADS) {
  let cancelled = false
  let cursor = 0
  const textures = []

  async function next() {
    while (cursor < jobs.length && !cancelled) {
      const idx = cursor++
      const job = jobs[idx]
      try {
        const tex = await loadThumbnailTexture(job.item)
        if (cancelled) { tex.dispose(); return }
        textures.push(tex)
        job.onLoaded(tex)
      } catch (err) {
        console.error(`Space Scene: Failed to load item texture: ${job.item.id || job.item.filename}`, err)
        job.onFailed?.()
      } finally {
        if (!cancelled) job.onSettled?.()
      }
    }
  }

  for (let i = 0; i < concurrency; i++) next()

  return {
    abort() { cancelled = true; textures.forEach((t) => t.dispose()) },
    textures,
  }
}

/* ─────────── constants ─────────── */
const BOUNDS = 300 // Expanded bounds for camera panning
const DEFAULT_ROTATE = 0

/* ─────────── SpaceScene ─────────── */
export default function SpaceScene({ media = [] }) {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const loaderRef = useRef(null)

  // Interactive / Animating States
  const mouseRef = useRef(new THREE.Vector2(-9999, -9999))
  const hoveredMeshRef = useRef(null)
  const targetCamPosRef = useRef(null)
  const targetLookAtRef = useRef(null)
  const animatingCameraRef = useRef(false)
  const initialCamPos = useRef(new THREE.Vector3(0, 0, 60))

  // Camera zoom-back references
  const preZoomCameraPos = useRef(null)
  const preZoomCameraTarget = useRef(null)
  const focusedMeshRef = useRef(null)
  const pendingHQRef = useRef(null)

  // Shared single geometry for WebGL performance
  const sharedGeometryRef = useRef(new THREE.PlaneGeometry(1, 1))
  const fpsRef = useRef(null)

  const [unsupported, setUnsupported] = useState(false)

  // Layout-specific defaults (Spherical is active initially)
  const [gapX, setGapX] = useState(5)
  const [gapY, setGapY] = useState(7.5)
  const [gapZ, setGapZ] = useState(5)
  const [imageSize, setImageSize] = useState(8)
  const [autoRotate, setAutoRotate] = useState(DEFAULT_ROTATE)
  const [layout, setLayout] = useState('spherical')
  const [devPlanes, setDevPlanes] = useState(false)
  const [loadProgress, setLoadProgress] = useState('')
  const [allLoaded, setAllLoaded] = useState(false)


  // FPS tracking refs
  const lastFpsUpdateRef = useRef(performance.now())
  const frameCountRef = useRef(0)

  // Refs to avoid stale closures in event handlers and loop
  const gapXRef = useRef(gapX)
  const gapYRef = useRef(gapY)
  const gapZRef = useRef(gapZ)
  const imageSizeRef = useRef(imageSize)
  const layoutRef = useRef(layout)
  const allLoadedRef = useRef(allLoaded)

  useEffect(() => { gapXRef.current = gapX }, [gapX])
  useEffect(() => { gapYRef.current = gapY }, [gapY])
  useEffect(() => { gapZRef.current = gapZ }, [gapZ])
  useEffect(() => { imageSizeRef.current = imageSize }, [imageSize])
  useEffect(() => { layoutRef.current = layout }, [layout])
  useEffect(() => { allLoadedRef.current = allLoaded }, [allLoaded])

  // Handles setting the layout state and resetting defaults as requested
  const handleSetLayout = (newLayout) => {
    setLayout(newLayout)
    if (newLayout === 'scattered') {
      setImageSize(8)
      setGapX(25)
      setGapY(15)
      setGapZ(24)
    } else if (newLayout === 'spherical') {
      setImageSize(8)
      setGapX(5)
      setGapY(7.5)
      setGapZ(5)
    }
  }

  // Swaps all other high-quality textures back to their low-quality thumbnails
  const revertHQTextures = (exceptMesh) => {
    const s = sceneRef.current
    if (!s) return
    s.meshes.forEach((mesh) => {
      if (mesh !== exceptMesh) {
        if (!mesh.userData.isHighQuality && mesh.renderOrder === 0) return
        if (mesh.userData.isHighQuality && mesh.userData.thumbnailTex) {
          const hqMap = mesh.material.map
          mesh.material.map = mesh.userData.thumbnailTex
          mesh.userData.isHighQuality = false

          if (hqMap && hqMap !== mesh.userData.thumbnailTex) {
            hqMap.dispose()
          }
        }

        // Revert depth and order settings
        mesh.renderOrder = 0
        if (mesh.material) {
          mesh.material.depthTest = true
        }

        // Restore baseScale based on aspect ratio
        const aspect = mesh.userData.aspect || 1
        const curSize = imageSizeRef.current
        const w = aspect >= 1 ? curSize : curSize * aspect
        const h = aspect >= 1 ? curSize / aspect : curSize
        mesh.userData.baseScale.set(w, h, 1)
      }
    })
  }

  // Loads the original quality image texture for the focused mesh
  const triggerHQTextureLoad = (mesh) => {
    const item = mesh.userData.item
    if (item && !mesh.userData.isHighQuality) {
      if (pendingHQRef.current) {
        if (window.cancelIdleCallback) window.cancelIdleCallback(pendingHQRef.current)
        else window.clearTimeout(pendingHQRef.current)
      }
      const start = () => loadHighQualityTexture(item.src || item.originalSrc).then((tex) => {
        if (focusedMeshRef.current !== mesh) {
          tex.dispose()
          return
        }

        revertHQTextures(mesh)

        const oldMap = mesh.material.map
        mesh.material.map = tex

        // Render in front of any other image in Focused Detail Mode
        mesh.material.depthTest = false
        mesh.renderOrder = 999

        mesh.userData.isHighQuality = true

        if (oldMap && oldMap !== mesh.userData.thumbnailTex) {
          oldMap.dispose()
        }

        const aspect = tex.userData.aspect || 1
        mesh.userData.aspect = aspect
        const curSize = imageSizeRef.current
        const w = aspect >= 1 ? curSize : curSize * aspect
        const h = aspect >= 1 ? curSize / aspect : curSize
        mesh.userData.baseScale.set(w, h, 1)
      }).catch((err) => {
        console.error('Failed to load high quality texture', err)
      })
      pendingHQRef.current = window.requestIdleCallback
        ? window.requestIdleCallback(start, { timeout: 1500 })
        : window.setTimeout(start, 250)
    }
  }

  /* ──── initialise Three.js once ──── */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    let renderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
      })
    } catch {
      setUnsupported(true)
      return undefined
    }

    if (!renderer.getContext()) {
      setUnsupported(true)
      renderer.dispose()
      return undefined
    }

    renderer.shadowMap.enabled = false
    renderer.toneMapping = THREE.NoToneMapping
    renderer.outputColorSpace = THREE.SRGBColorSpace

    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      console.warn('WebGL context lost — pausing.')
    })
    renderer.domElement.addEventListener('webglcontextrestored', () => {
      console.info('WebGL context restored.')
    })

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25))
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setClearColor(0x0f0f0f)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()

    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      800
    )
    camera.position.copy(initialCamPos.current)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 2
    controls.maxDistance = 400
    controls.maxPolarAngle = Math.PI * 0.95
    controls.minPolarAngle = Math.PI * 0.05
    controls.target.set(0, 0, 0)
    controls.autoRotateSpeed = 0
    controls.update()

    const preventCtx = (e) => e.preventDefault()
    renderer.domElement.addEventListener('contextmenu', preventCtx)

    const applyTheme = () => {
      const dark = document.documentElement.dataset.theme === 'dark'
      const bg = dark ? 0x0f0f0f : 0xf0f0ee
      renderer.setClearColor(bg)

      // Dynamically update placeholders color on theme change
      if (sceneRef.current) {
        sceneRef.current.meshes.forEach((mesh) => {
          if (mesh.material && !mesh.material.map) {
            mesh.material.color.set(dark ? 0xffffff : 0x000000)
            mesh.material.needsUpdate = true
          }
        })
      }
    }
    applyTheme()
    const themeObs = new MutationObserver(applyTheme)
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    sceneRef.current = { scene, camera, renderer, controls, meshes: [] }

    /* Interaction Setup */
    const raycaster = new THREE.Raycaster()

    const onPointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }

    const onPointerLeave = () => {
      mouseRef.current.set(-9999, -9999)
    }

    let startX = 0
    let startY = 0
    let startTime = 0

    const onPointerDown = (e) => {
      // A new gesture takes precedence over any in-flight camera motion.
      animatingCameraRef.current = false
      startX = e.clientX
      startY = e.clientY
      startTime = Date.now()
    }

    const onPointerUp = (e) => {
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      const dist = Math.hypot(dx, dy)
      const duration = Date.now() - startTime

      if (dist > 5 || duration > 300) return

      if (e.button === 2) {
        revertHQTextures(null)
        if (preZoomCameraPos.current && preZoomCameraTarget.current) {
          targetLookAtRef.current = preZoomCameraTarget.current.clone()
          targetCamPosRef.current = preZoomCameraPos.current.clone()
        } else {
          targetLookAtRef.current = new THREE.Vector3(0, 0, 0)
          targetCamPosRef.current = initialCamPos.current.clone()
        }
        animatingCameraRef.current = true
        focusedMeshRef.current = null
        return
      }

      // Clean left click: zoom to hit image, load high-quality
      if (e.button === 0) {
        if (!allLoadedRef.current) return // Disable clicks during loading!

        raycaster.setFromCamera(mouseRef.current, camera)
        const intersects = raycaster.intersectObjects(sceneRef.current.meshes)

        if (intersects.length > 0) {
          const hitMesh = intersects[0].object

          revertHQTextures(hitMesh)

          if (focusedMeshRef.current === null) {
            preZoomCameraPos.current = camera.position.clone()
            preZoomCameraTarget.current = controls.target.clone()
          }

          focusedMeshRef.current = hitMesh

          hitMesh.renderOrder = 999
          if (hitMesh.material) {
            hitMesh.material.depthTest = false
          }

          targetLookAtRef.current = hitMesh.position.clone()

          const canvasHeight = renderer.domElement.clientHeight
          const padding = 45
          const r = Math.max((canvasHeight - padding) / canvasHeight, 0.5)
          const fovRad = camera.fov * (Math.PI / 360)

          const h3D = hitMesh.userData.baseScale.y * 2.4
          const camDist = h3D / (2 * r * Math.tan(fovRad))

          targetCamPosRef.current = new THREE.Vector3(
            hitMesh.position.x,
            hitMesh.position.y,
            hitMesh.position.z + camDist
          )

          animatingCameraRef.current = true

          triggerHQTextureLoad(hitMesh)
        }
      }
    }

    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerleave', onPointerLeave)
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    let frameId = null
    let disposed = false

    const clampTarget = () => {
      const t = controls.target
      t.x = THREE.MathUtils.clamp(t.x, -BOUNDS, BOUNDS)
      t.y = THREE.MathUtils.clamp(t.y, -BOUNDS, BOUNDS)
      t.z = THREE.MathUtils.clamp(t.z, -BOUNDS, BOUNDS)
    }

    const animate = () => {
      if (disposed) return
      frameId = requestAnimationFrame(animate)

      // Calculate FPS (update once every 1 second)
      frameCountRef.current++
      const timeNow = performance.now()
      if (timeNow - lastFpsUpdateRef.current >= 1000) {
        const calculatedFps = Math.round((frameCountRef.current * 1000) / (timeNow - lastFpsUpdateRef.current))
        if (fpsRef.current) fpsRef.current.textContent = calculatedFps + ' FPS'
        frameCountRef.current = 0
        lastFpsUpdateRef.current = timeNow
      }

      const s = sceneRef.current
      if (!s) return

      // Camera smooth zoom / tracking
      if (animatingCameraRef.current && targetCamPosRef.current && targetLookAtRef.current) {
        camera.position.lerp(targetCamPosRef.current, 0.16)
        controls.target.lerp(targetLookAtRef.current, 0.16)

        if (camera.position.distanceTo(targetCamPosRef.current) < 0.05 &&
          controls.target.distanceTo(targetLookAtRef.current) < 0.05) {
          animatingCameraRef.current = false
        }
      }

      // Only raycast when mouse has actually moved
      let currentHovered = null
      const mouseChanged = mouseRef.current.x !== _prevMouse.x || mouseRef.current.y !== _prevMouse.y
      if (mouseChanged) {
        _prevMouse.copy(mouseRef.current)
        if (allLoadedRef.current) {
          raycaster.setFromCamera(mouseRef.current, camera)
          const intersects = raycaster.intersectObjects(s.meshes)
          if (intersects.length > 0) {
            currentHovered = intersects[0].object
          }
        }
      } else {
        currentHovered = hoveredMeshRef.current
      }
      hoveredMeshRef.current = currentHovered

      // Update positions and scales of meshes (zero allocations)
      s.meshes.forEach((mesh) => {
        let targetScale = 1.0
        const basePos = mesh.userData.basePosition
        if (!basePos) return

        _tmpDisp.set(0, 0, 0)

        const isFocused = focusedMeshRef.current === mesh

        if (isFocused) {
          targetScale = 2.4
        } else if (currentHovered) {
          if (mesh === currentHovered) {
            targetScale = 1.7
          } else {
            const dist = basePos.distanceTo(currentHovered.userData.basePosition)
            if (dist < SCATTER_RADIUS && dist > 0) {
              _tmpPush.subVectors(basePos, currentHovered.userData.basePosition).normalize()
              const strength = (1.0 - dist / SCATTER_RADIUS) * SCATTER_STRENGTH
              _tmpDisp.copy(_tmpPush).multiplyScalar(strength)
            }
          }
        }

        // Scale using pre-allocated vector
        const baseScale = mesh.userData.baseScale
        _tmpScale.copy(baseScale).multiplyScalar(targetScale)
        mesh.scale.lerp(_tmpScale, 0.12)

        // Displace using pre-allocated vector
        _tmpPos.copy(basePos).add(_tmpDisp)
        mesh.position.lerp(_tmpPos, 0.1)

        if (layoutRef.current === 'spherical') {
          mesh.lookAt(camera.position)
        } else {
          mesh.rotation.set(0, 0, 0)
        }
      })

      clampTarget()
      controls.update()
      renderer.render(scene, camera)
    }

    const onVis = () => {
      if (document.hidden) {
        if (frameId != null) { cancelAnimationFrame(frameId); frameId = null }
      } else if (!disposed) { animate() }
    }
    document.addEventListener('visibilitychange', onVis)

    const resizeObs = new ResizeObserver(() => {
      const w = container.clientWidth
      const h = container.clientHeight
      if (w === 0 || h === 0) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    })
    resizeObs.observe(container)

    animate()

    return () => {
      disposed = true
      if (frameId != null) cancelAnimationFrame(frameId)
      document.removeEventListener('visibilitychange', onVis)
      themeObs.disconnect()
      resizeObs.disconnect()

      if (renderer && renderer.domElement) {
        renderer.domElement.removeEventListener('contextmenu', preventCtx)
        renderer.domElement.removeEventListener('pointermove', onPointerMove)
        renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
        renderer.domElement.removeEventListener('pointerdown', onPointerDown)
        renderer.domElement.removeEventListener('pointerup', onPointerUp)
      }
      controls.dispose()

      if (loaderRef.current) { loaderRef.current.abort(); loaderRef.current = null }
      if (pendingHQRef.current) {
        if (window.cancelIdleCallback) window.cancelIdleCallback(pendingHQRef.current)
        else window.clearTimeout(pendingHQRef.current)
      }

      const s = sceneRef.current
      if (s) {
        s.meshes.forEach((m) => {
          s.scene.remove(m)
          // Do not dispose shared geometry per mesh!
          if (m.userData.thumbnailTex) m.userData.thumbnailTex.dispose()
          if (m.material.map && m.material.map !== m.userData.thumbnailTex) {
            m.material.map.dispose()
          }
          m.material.dispose()
        })
      }

      sharedGeometryRef.current.dispose() // Clean up the shared geometry

      scene.traverse((obj) => {
        if (obj.geometry && obj.geometry !== sharedGeometryRef.current) obj.geometry.dispose()
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose()
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
          else obj.material.dispose()
        }
      })

      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
      sceneRef.current = null
    }
  }, []) // Run once

  /* ──── rebuild meshes when media or devPlanes changes ──── */
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return

    if (loaderRef.current) { loaderRef.current.abort(); loaderRef.current = null }

    s.meshes.forEach((m) => {
      s.scene.remove(m)
      if (m.userData.thumbnailTex) m.userData.thumbnailTex.dispose()
      if (m.material.map && m.material.map !== m.userData.thumbnailTex) {
        m.material.map.dispose()
      }
      m.material.dispose()
    })
    s.meshes = []
    setLoadProgress('')
    setAllLoaded(false) // Reset loading state to keep images at (0, 0, 0) during load

    if (!media.length) return

    const loadCount = Math.min(media.length, MAX_LOADED_TEXTURES)
    const dark = document.documentElement.dataset.theme === 'dark'
    const placeholderColor = dark ? 0xffffff : 0x000000

    /* create ALL meshes with placeholder colors using pre-calculated dimensions */
    const sharedGeometry = sharedGeometryRef.current
    const meshes = media.map((item, i) => {
      const mat = new THREE.MeshBasicMaterial({
        color: placeholderColor,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(sharedGeometry, mat)
      mesh.position.set(0, 0, 0)
      mesh.rotation.set(0, 0, 0)
      mesh.visible = false

      // Calculate initial rectangular aspect ratios using metadata (if available)
      const wNum = Number(item.width)
      const hNum = Number(item.height)
      const initialAspect = (wNum > 0 && hNum > 0) ? (wNum / hNum) : 1

      mesh.userData = {
        basePosition: new THREE.Vector3(0, 0, 0),
        baseScale: new THREE.Vector3(1, 1, 1),
        aspect: initialAspect,
        thumbnailTex: null,
        isHighQuality: false,
        item: item
      }

      s.scene.add(mesh)
      return mesh
    })
    s.meshes = meshes

    /* skip texture loading in dev-planes mode */
    if (devPlanes) {
      setAllLoaded(true)
      return
    }

    // Place the constellation immediately. Textures fill in progressively, so one
    // unavailable image cannot hold the whole scene hostage.
    setAllLoaded(true)
    let settled = 0
    let failed = 0
    const jobs = media.slice(0, loadCount).map((item, i) => ({
      item: item,
      onLoaded(tex) {
        const mesh = meshes[i]
        if (!mesh) return

        const aspect = tex.userData.aspect || 1
        mesh.userData.aspect = aspect
        mesh.userData.thumbnailTex = tex

        const curSize = imageSizeRef.current
        const w = aspect >= 1 ? curSize : curSize * aspect
        const h = aspect >= 1 ? curSize / aspect : curSize
        mesh.userData.baseScale.set(w, h, 1)

        mesh.material.map = tex
        mesh.material.color.set(0xffffff)
        mesh.material.needsUpdate = true
        mesh.visible = true
      },
      onSettled() {
        settled++
        setLoadProgress(`${settled} / ${jobs.length}`)
        if (settled >= jobs.length) {
          setLoadProgress('')
        }
      },
      onFailed() { failed++ },
    }))

    loaderRef.current = batchLoadTextures(jobs, CONCURRENT_LOADS)

    return () => {
      if (loaderRef.current) { loaderRef.current.abort(); loaderRef.current = null }
    }
  }, [media, devPlanes])

  /* ──── update positions/scales when layout or gap/size sliders change ──── */
  useEffect(() => {
    const s = sceneRef.current
    if (!s || !s.meshes.length) return

    // Keep visibility false and basePositions at (0, 0, 0) during loads
    s.meshes.forEach((mesh) => {
      mesh.visible = allLoaded
    })

    if (!allLoaded) {
      s.meshes.forEach((mesh) => {
        mesh.userData.basePosition.set(0, 0, 0)
        const aspect = mesh.userData.aspect || 1
        const w = aspect >= 1 ? imageSize : imageSize * aspect
        const h = aspect >= 1 ? imageSize / aspect : imageSize
        mesh.userData.baseScale.set(w, h, 1)
      })
      return
    }

    const layoutFn = LAYOUTS[layout] || layoutSpherical
    const positions = layoutFn(media.length, gapX, gapY, gapZ)

    s.meshes.forEach((mesh, i) => {
      if (!positions[i]) return
      mesh.userData.basePosition.copy(positions[i])

      const aspect = mesh.userData.aspect || 1
      const w = aspect >= 1 ? imageSize : imageSize * aspect
      const h = aspect >= 1 ? imageSize / aspect : imageSize
      mesh.userData.baseScale.set(w, h, 1)
    })
  }, [media, gapX, gapY, gapZ, imageSize, layout, allLoaded])

  // Dynamically auto-fits and centers the camera frame when loading completes or layout changes
  useEffect(() => {
    const s = sceneRef.current
    if (!s || !s.meshes.length || !allLoaded) return

    if (layout === 'spherical') {
      const newPos = new THREE.Vector3(0, 0, 0)
      initialCamPos.current.copy(newPos)
      s.camera.position.copy(newPos)
      s.controls.target.set(0, 0, -0.01)
      s.controls.update()
      return
    }

    const box = new THREE.Box3()
    s.meshes.forEach((mesh) => {
      box.expandByPoint(mesh.userData.basePosition)
    })

    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const fov = s.camera.fov * (Math.PI / 180)
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2))
    cameraZ = Math.max(cameraZ * 1.25, 40) // Minimum distance boundary

    const newPos = new THREE.Vector3(center.x, center.y + maxDim * 0.05, center.z + cameraZ)
    initialCamPos.current.copy(newPos)
    s.camera.position.copy(newPos)
    s.controls.target.copy(center)
    s.controls.update()
  }, [allLoaded, layout])

  /* ──── auto-rotate ──── */
  useEffect(() => {
    const s = sceneRef.current
    if (!s?.controls) return
    s.controls.autoRotate = autoRotate > 0
    s.controls.autoRotateSpeed = autoRotate
  }, [autoRotate])

  /* ──── helpers ──── */
  const slider = useCallback((label, value, setter, min, max, step) => (
    <label className="space-slider" key={label}>
      <span className="space-slider-label">{label}</span>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => setter(Number(e.target.value))}
      />
      <span className="space-slider-value">{value}</span>
    </label>
  ), [])

  const isLoading = loadProgress !== ''
  const totalToLoad = media.length ? Math.min(media.length, MAX_LOADED_TEXTURES) : 0

  if (unsupported) {
    return <div className="space-fallback">WebGL is unavailable in this browser.</div>
  }

  return (
    <div className="space-scene-wrap">
      <div
        className="space-canvas"
        ref={containerRef}
        aria-label="Interactive three-dimensional image constellation"
      />

      <div className="space-fps-counter" ref={fpsRef}>0 FPS</div>

      {isLoading && (
        <div className="space-load-overlay">
          <div className="space-load-card">
            <div className="space-load-indicator" />
            <div className="space-load-info">
              <p className="space-load-text">Loading {loadProgress}</p>
              <div className="space-load-bar">
                <div
                  className="space-load-bar-fill"
                  style={{ width: `${(parseInt(loadProgress) / totalToLoad) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <aside className="space-controls">
        <p className="space-controls-label">Controls</p>
        <div className="space-controls-body">

          {/* layout toggle */}
          <div className="space-toggle-row">
            <span className="space-slider-label">Layout</span>
            <div className="space-toggle-group">
              <button
                type="button"
                className={`space-toggle-btn${layout === 'spherical' ? ' active' : ''}`}
                onClick={() => handleSetLayout('spherical')}
              >
                Spherical
              </button>
              <button
                type="button"
                className={`space-toggle-btn${layout === 'scattered' ? ' active' : ''}`}
                onClick={() => handleSetLayout('scattered')}
              >
                Scattered
              </button>
            </div>
          </div>

          {slider('Spread X', gapX, setGapX, 2, 24, 0.5)}
          {slider('Spread Y', gapY, setGapY, 2, 24, 0.5)}
          {slider('Spread Z', gapZ, setGapZ, 2, 24, 0.5)}
          {slider('Image size', imageSize, setImageSize, 1, 16, 0.2)}
          {slider('Auto-rotate', autoRotate, setAutoRotate, 0, 4, 0.1)}

          {/* dev toggle */}
          <div className="space-toggle-row">
            <span className="space-slider-label">Dev planes</span>
            <button
              type="button"
              className={`space-toggle-btn${devPlanes ? ' active' : ''}`}
              onClick={() => setDevPlanes((v) => !v)}
            >
              {devPlanes ? 'on' : 'off'}
            </button>
          </div>

        </div>
      </aside>
    </div>
  )
}
