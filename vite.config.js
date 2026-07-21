import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import * as exifr from 'exifr'
import sharp from 'sharp'

const cameraShowcasePlugin = () => {
  const cameraDir = process.env.KIOKU_CAMERA_DIR || 'E:\\Camera';
  const cacheFilePath = path.resolve('.camera_cache.json');

  const getDeterministicTags = (filename) => {
    const name = filename.toLowerCase();
    const assigned = [];
    if (name.includes('nature') || name.includes('land') || name.includes('sky') || name.includes('tree') || name.includes('forest') || name.includes('field') || name.includes('grass')) assigned.push('Nature');
    if (name.includes('travel') || name.includes('trip') || name.includes('vacation') || name.includes('mountain') || name.includes('lake') || name.includes('sea') || name.includes('beach')) assigned.push('Travel');
    if (name.includes('people') || name.includes('man') || name.includes('woman') || name.includes('face') || name.includes('person') || name.includes('crowd') || name.includes('portrait')) assigned.push('People');
    if (name.includes('animal') || name.includes('cat') || name.includes('dog') || name.includes('bird') || name.includes('pet') || name.includes('horse') || name.includes('wild')) assigned.push('Animals');
    if (name.includes('architecture') || name.includes('building') || name.includes('city') || name.includes('house') || name.includes('street') || name.includes('tower') || name.includes('bridge') || name.includes('urban')) assigned.push('Architecture');
    if (name.includes('food') || name.includes('eat') || name.includes('drink') || name.includes('cook') || name.includes('fruit') || name.includes('dinner')) assigned.push('Food');
    
    // Fallback/Deterministic assignment if no keywords match, to populate categories
    if (assigned.length === 0) {
      const categories = ['Nature', 'Travel', 'People', 'Animals', 'Architecture', 'Food', 'Objects'];
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      const index = Math.abs(hash) % categories.length;
      assigned.push(categories[index]);
      
      // Maybe add a second tag deterministically
      if (Math.abs(hash) % 3 === 0) {
        assigned.push(categories[(index + 2) % categories.length]);
      }
    }
    return assigned;
  };

  const localMediaMiddleware = async (req, res, next) => {
    if (req.url === '/api/media') {
      try {
        if (!fs.existsSync(cameraDir)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Directory ${cameraDir} does not exist.` }));
          return;
        }

        // 1. Read directory
        const files = await fs.promises.readdir(cameraDir);
        const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);
        
        const imageFiles = [];
        for (const file of files) {
          if (file.startsWith('.') || file.startsWith('$') || file.includes('.trashed-')) continue;
          const ext = path.extname(file).toLowerCase();
          if (!imageExtensions.has(ext)) continue;
          
          const filePath = path.join(cameraDir, file);
          const stat = await fs.promises.stat(filePath);
          if (stat.isFile()) {
            imageFiles.push({ file, filePath, stat });
          }
        }

        // Sort newest first based on mtime
        imageFiles.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

        // 2. Load existing cache
        let cache = {};
        if (fs.existsSync(cacheFilePath)) {
          try {
            cache = JSON.parse(await fs.promises.readFile(cacheFilePath, 'utf8'));
          } catch (e) {
            // Ignore cache read errors
          }
        }

        let cacheUpdated = false;
        const mediaItems = await Promise.all(imageFiles.map(async ({ file, stat, filePath }, index) => {
          const fileKey = `${file}-${stat.size}-${stat.mtimeMs}`;
          
          // Check cache first
          if (cache[fileKey]) {
            // Restore correct ID order based on current sorted scan list
            return {
              ...cache[fileKey],
              id: `local-${index}-${file}`
            };
          }

          // Parse EXIF
          let width = 3840;
          let height = 2160;
          let dateTaken = stat.mtime.toISOString();
          let camera = 'Unknown Camera';
          let lens = null;
          let location = null;
          let megapixels = '—';

          try {
            const parseFn = exifr.default?.parse || exifr.parse;
            const exif = await parseFn(filePath, { gps: true }).catch(() => null);
            if (exif) {
              if (exif.ExifImageWidth && exif.ExifImageHeight) {
                width = exif.ExifImageWidth;
                height = exif.ExifImageHeight;
              } else if (exif.ImageWidth && exif.ImageHeight) {
                width = exif.ImageWidth;
                height = exif.ImageHeight;
              }
              
              if (exif.DateTimeOriginal || exif.CreateDate) {
                const exifDate = new Date(exif.DateTimeOriginal || exif.CreateDate);
                if (!isNaN(exifDate.getTime())) {
                  dateTaken = exifDate.toISOString();
                }
              }

              if (exif.Make || exif.Model) {
                camera = [exif.Make, exif.Model].filter(Boolean).join(' ');
              }

              if (exif.LensModel) {
                lens = exif.LensModel;
              }

              if (exif.latitude && exif.longitude) {
                location = `${exif.latitude.toFixed(4)}, ${exif.longitude.toFixed(4)}`;
              }

              if (width && height && !isNaN(width) && !isNaN(height)) {
                megapixels = `${((width * height) / 1e6).toFixed(1)} MP`;
              }
            }
          } catch (e) {
            // Ignore EXIF parse error
          }

          const fileSize = `${(stat.size / 1024 / 1024).toFixed(1)} MB`;
          const mimeType = file.endsWith('.png') ? 'image/png' : 
                           (file.endsWith('.webp') ? 'image/webp' : 'image/jpeg');

          const tags = getDeterministicTags(file);

          const item = {
            id: `local-${index}-${file}`,
            src: `/media/${encodeURIComponent(file)}`,
            thumbSrc: `/media/${encodeURIComponent(file)}?w=400`,
            filename: file,
            dateTaken,
            tags,
            note: 'Local showcase image',
            width,
            height,
            megapixels,
            fileSize,
            type: mimeType,
            location,
            camera,
            lens,
            imported: true
          };

          cache[fileKey] = item;
          cacheUpdated = true;
          return item;
        }));

        // 3. Save cache if new files were processed
        if (cacheUpdated) {
          // Clean up cache keys that are no longer in the current scan
          const currentKeys = new Set(imageFiles.map(({ file, stat }) => `${file}-${stat.size}-${stat.mtimeMs}`));
          for (const key of Object.keys(cache)) {
            if (!currentKeys.has(key)) {
              delete cache[key];
            }
          }
          await fs.promises.writeFile(cacheFilePath, JSON.stringify(cache, null, 2), 'utf8');
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mediaItems));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.url.startsWith('/media/')) {
      try {
        const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const filename = decodeURIComponent(urlObj.pathname.slice(7));
        const filePath = path.join(cameraDir, filename);

        // Security check
        const resolvedPath = path.resolve(filePath);
        const resolvedCameraDir = path.resolve(cameraDir);
        if (!resolvedPath.startsWith(resolvedCameraDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          const etag = `W/"${stat.size}-${stat.mtimeMs}"`;
          const lastModified = stat.mtime.toUTCString();

          // Standard 304 cache validation
          if (req.headers['if-none-match'] === etag || req.headers['if-modified-since'] === lastModified) {
            res.writeHead(304);
            res.end();
            return;
          }

          const widthParam = urlObj.searchParams.get('w');
          const width = widthParam ? parseInt(widthParam, 10) : null;

          if (width && !isNaN(width)) {
            const thumbDir = path.resolve('.camera_thumbs');
            if (!fs.existsSync(thumbDir)) {
              fs.mkdirSync(thumbDir, { recursive: true });
            }
            const ext = path.extname(filename);
            const thumbName = `${path.basename(filename, ext)}-w${width}-${stat.size}-${stat.mtimeMs}.webp`;
            const thumbPath = path.join(thumbDir, thumbName);

            // Serve cached thumbnail if it exists
            if (fs.existsSync(thumbPath)) {
              const thumbStat = fs.statSync(thumbPath);
              const thumbEtag = `W/"${thumbStat.size}-${thumbStat.mtimeMs}"`;
              const thumbLastModified = thumbStat.mtime.toUTCString();

              if (req.headers['if-none-match'] === thumbEtag || req.headers['if-modified-since'] === thumbLastModified) {
                res.writeHead(304);
                res.end();
                return;
              }

              res.writeHead(200, {
                'Content-Type': 'image/webp',
                'Cache-Control': 'public, max-age=31536000, immutable',
                'ETag': thumbEtag,
                'Last-Modified': thumbLastModified
              });
              fs.createReadStream(thumbPath).pipe(res);
              return;
            }

            // Generate thumbnail using sharp
            try {
              await sharp(filePath)
                .resize(width)
                .webp({ quality: 80 })
                .toFile(thumbPath);

              const thumbStat = fs.statSync(thumbPath);
              const thumbEtag = `W/"${thumbStat.size}-${thumbStat.mtimeMs}"`;
              const thumbLastModified = thumbStat.mtime.toUTCString();

              res.writeHead(200, {
                'Content-Type': 'image/webp',
                'Cache-Control': 'public, max-age=31536000, immutable',
                'ETag': thumbEtag,
                'Last-Modified': thumbLastModified
              });
              fs.createReadStream(thumbPath).pipe(res);
              return;
            } catch (err) {
              console.error('Error generating thumbnail:', err);
              // Fall through to serve original image
            }
          }

          const ext = path.extname(filePath).toLowerCase();
          let contentType = 'application/octet-stream';
          if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
          else if (ext === '.png') contentType = 'image/png';
          else if (ext === '.webp') contentType = 'image/webp';

          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'ETag': etag,
            'Last-Modified': lastModified
          });
          fs.createReadStream(filePath).pipe(res);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      } catch (e) {
        console.error('Media serving error:', e);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
      return;
    }

    next();
  };

  return {
    name: 'camera-showcase',
    configureServer(server) {
      server.middlewares.use(localMediaMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(localMediaMiddleware);
    }
  };
};

export default defineConfig({
  plugins: [react(), cameraShowcasePlugin()],
  server: {
    proxy: {
      '/r2-media': {
        target: 'https://pub-9ef80b3adaf74b38bd2c3bc8bfd4ccec.r2.dev',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/r2-media/, '')
      }
    }
  }
})
