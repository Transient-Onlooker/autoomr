import { Point } from "../types";

// Helper: Calculate distance between two points
const dist = (p1: Point, p2: Point) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

export interface NormalizedCorners {
    tl: Point;
    tr: Point;
    bl: Point;
    br: Point;
}

// --- Main Exported Functions ---

export const rotateImageBase64 = (src: string, degrees: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = src;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error("No context"));
                return;
            }
            
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate((degrees * Math.PI) / 180);
            ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
            
            resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
        img.onerror = reject;
    });
};

export const warpImageWithCorners = async (imageSource: string | File, corners: NormalizedCorners): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        if (typeof imageSource === 'string') img.src = imageSource;
        else img.src = URL.createObjectURL(imageSource);

        img.onload = () => {
            try {
                const w = img.naturalWidth;
                const h = img.naturalHeight;

                const srcPoints = [
                    { x: corners.tl.x * w, y: corners.tl.y * h },
                    { x: corners.tr.x * w, y: corners.tr.y * h },
                    { x: corners.br.x * w, y: corners.br.y * h },
                    { x: corners.bl.x * w, y: corners.bl.y * h }
                ];

                const w1 = dist(srcPoints[0], srcPoints[1]);
                const w2 = dist(srcPoints[3], srcPoints[2]);
                const h1 = dist(srcPoints[0], srcPoints[3]);
                const h2 = dist(srcPoints[1], srcPoints[2]);

                const maxWidth = Math.floor(Math.max(w1, w2));
                const maxHeight = Math.floor(Math.max(h1, h2));

                const outputCanvas = document.createElement('canvas');
                outputCanvas.width = maxWidth;
                outputCanvas.height = maxHeight;
                const outCtx = outputCanvas.getContext('2d');
                if (!outCtx) throw new Error("No output context");

                outCtx.fillStyle = "#FFFFFF";
                outCtx.fillRect(0, 0, maxWidth, maxHeight);

                const fullResCanvas = document.createElement('canvas');
                fullResCanvas.width = w;
                fullResCanvas.height = h;
                const fullResCtx = fullResCanvas.getContext('2d', { willReadFrequently: true });
                if (!fullResCtx) throw new Error("No full res context");
                fullResCtx.drawImage(img, 0, 0);

                const warpedData = perspectiveWarp(
                    fullResCtx.getImageData(0, 0, w, h),
                    srcPoints,
                    maxWidth,
                    maxHeight
                );

                outCtx.putImageData(warpedData, 0, 0);
                resolve(outputCanvas.toDataURL('image/jpeg', 0.9));
            } catch (e) {
                reject(e);
            }
        };
        img.onerror = reject;
    });
};

export const autoAlignImage = async (imageSource: string | File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    
    if (typeof imageSource === 'string') {
        img.src = imageSource;
    } else {
        img.src = URL.createObjectURL(imageSource);
    }

    img.onload = () => {
      try {
        const processWidth = 1000; // Efficient processing size
        const scale = processWidth / img.naturalWidth;
        const processHeight = Math.round(img.naturalHeight * scale);

        const canvas = document.createElement('canvas');
        canvas.width = processWidth;
        canvas.height = processHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error("No context");

        // White background to handle transparency
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, processWidth, processHeight);
        ctx.drawImage(img, 0, 0, processWidth, processHeight);

        const imageData = ctx.getImageData(0, 0, processWidth, processHeight);
        
        // --- Core Detection Logic ---
        const corners = detectCornersOtsu(imageData, processWidth, processHeight);

        if (!corners) {
            console.warn("Corner detection failed. Returns original.");
            resolve(img.src);
            return;
        }

        // Scale corners back to natural size
        const naturalCorners = {
            tl: { x: corners.tl.x / scale, y: corners.tl.y / scale },
            tr: { x: corners.tr.x / scale, y: corners.tr.y / scale },
            bl: { x: corners.bl.x / scale, y: corners.bl.y / scale },
            br: { x: corners.br.x / scale, y: corners.br.y / scale },
        };

        // Determine output size
        const w1 = dist(naturalCorners.tl, naturalCorners.tr);
        const w2 = dist(naturalCorners.bl, naturalCorners.br);
        const h1 = dist(naturalCorners.tl, naturalCorners.bl);
        const h2 = dist(naturalCorners.tr, naturalCorners.br);
        
        // Use FLOOR to ensure integer dimensions for canvas
        const maxWidth = Math.floor(Math.max(w1, w2));
        const maxHeight = Math.floor(Math.max(h1, h2));

        // Prepare Output
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = maxWidth;
        outputCanvas.height = maxHeight;
        const outCtx = outputCanvas.getContext('2d', { willReadFrequently: true });
        if (!outCtx) throw new Error("No output context");

        outCtx.fillStyle = "#FFFFFF";
        outCtx.fillRect(0, 0, maxWidth, maxHeight);

        // Get Full Res Data
        const fullResCanvas = document.createElement('canvas');
        fullResCanvas.width = img.naturalWidth;
        fullResCanvas.height = img.naturalHeight;
        const fullResCtx = fullResCanvas.getContext('2d', { willReadFrequently: true });
        if(!fullResCtx) throw new Error("No full res context");
        fullResCtx.drawImage(img, 0, 0);
        
        // Warp
        const srcPoints = [naturalCorners.tl, naturalCorners.tr, naturalCorners.br, naturalCorners.bl];
        const warpedData = perspectiveWarp(
            fullResCtx.getImageData(0, 0, img.naturalWidth, img.naturalHeight), 
            srcPoints, 
            maxWidth, 
            maxHeight
        );

        outCtx.putImageData(warpedData, 0, 0);

        // --- Orientation Check ---
        // Verify if the "top" timing marks (multiple black squares) are actually at the bottom.
        if (checkIfUpsideDown(outCtx, maxWidth, maxHeight)) {
            console.log("Auto-align: Detected upside down image based on timing marks. Rotating 180°.");
            
            // Create a temp canvas to hold current warped image
            const tempC = document.createElement('canvas');
            tempC.width = maxWidth;
            tempC.height = maxHeight;
            const tempCtx = tempC.getContext('2d');
            if (tempCtx) {
                tempCtx.putImageData(warpedData, 0, 0);
                
                // Clear and rotate output canvas
                outCtx.clearRect(0,0,maxWidth,maxHeight);
                outCtx.save();
                outCtx.translate(maxWidth/2, maxHeight/2);
                outCtx.rotate(Math.PI); // 180 degrees
                outCtx.drawImage(tempC, -maxWidth/2, -maxHeight/2);
                outCtx.restore();
            }
        }

        resolve(outputCanvas.toDataURL('image/jpeg', 0.9));

      } catch (e) {
        console.error("Alignment error:", e);
        resolve(img.src);
      }
    };

    img.onerror = reject;
  });
};

/**
 * Checks for timing marks (black squares) between corners.
 * Returns true if the bottom region has significantly more transitions than the top region.
 * We scan bands (multiple rows) instead of a single line to be robust.
 */
const checkIfUpsideDown = (ctx: CanvasRenderingContext2D, w: number, h: number): boolean => {
    // Force integer dimensions for safety
    const intW = Math.floor(w);
    const intH = Math.floor(h);

    // Scan horizontal strip between x=15% and x=85% to definitely avoid corner blocks
    const startX = Math.floor(intW * 0.15); 
    const endX = Math.floor(intW * 0.85);
    const scanWidth = endX - startX;
    
    if (scanWidth <= 0) return false;

    // Get full image data once
    const imgData = ctx.getImageData(0, 0, intW, intH);
    const data = imgData.data;
    const stride = imgData.width * 4; // Use actual image data width for stride

    // Helper to count black/white transitions in a specific row
    const countTransitionsInRow = (y: number, rowLength: number) => {
        const rowStartIdx = (y * stride) + (startX * 4);
        let transitions = 0;
        let isDark = false; 
        const THRESHOLD = 140; // Safe threshold for dark marks

        for (let i = 0; i < rowLength; i++) {
            const idx = rowStartIdx + (i * 4);
            // Bounds check
            if (idx + 2 >= data.length) break;

            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const currentIsDark = lum < THRESHOLD;
            
            if (currentIsDark !== isDark) {
                if (currentIsDark) {
                    transitions++; // White -> Black
                }
                isDark = currentIsDark;
            }
        }
        return transitions;
    };

    // Scan top 15% and bottom 15% of the image height
    // We look for the "max transitions" found in any single row within that band.
    const bandHeight = Math.floor(intH * 0.15);
    
    let maxTopTransitions = 0;
    // Scan rows in top band (skip very first 1% to avoid edge noise)
    const startY = Math.floor(intH * 0.01);
    for (let y = startY; y < bandHeight; y += 2) { 
        const t = countTransitionsInRow(y, scanWidth);
        if (t > maxTopTransitions) maxTopTransitions = t;
    }

    let maxBottomTransitions = 0;
    // Scan rows in bottom band
    const startBottomY = intH - bandHeight;
    const endBottomY = Math.floor(intH * 0.99);
    for (let y = startBottomY; y < endBottomY; y += 2) {
        const t = countTransitionsInRow(y, scanWidth);
        if (t > maxBottomTransitions) maxBottomTransitions = t;
    }

    // console.log(`Orientation Check - Max Top: ${maxTopTransitions}, Max Bottom: ${maxBottomTransitions}`);

    // Heuristic:
    // If bottom has significantly more markers (e.g. > 6) and is clearly the winner, flip it.
    if (maxBottomTransitions > 5 && maxBottomTransitions > (maxTopTransitions * 1.5)) {
        return true;
    }

    return false;
};


// --- Detection Logic with Otsu's Method ---

interface Blob {
  minX: number; maxX: number;
  minY: number; maxY: number;
  area: number;
  cx: number; cy: number;
}

const detectCornersOtsu = (imgData: ImageData, w: number, h: number): NormalizedCorners | null => {
    const { data } = imgData;
    const gray = new Uint8Array(w * h);

    // 1. Grayscale Conversion
    for (let i = 0; i < w * h; i++) {
        // Simple luminance
        gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }

    // 2. Otsu's Thresholding
    const histogram = new Int32Array(256);
    for (let i = 0; i < w * h; i++) histogram[gray[i]]++;

    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];

    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let maxVar = 0;
    let threshold = 0;
    const total = w * h;

    for (let t = 0; t < 256; t++) {
        wB += histogram[t];
        if (wB === 0) continue;
        wF = total - wB;
        if (wF === 0) break;

        sumB += t * histogram[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const varBetween = wB * wF * (mB - mF) * (mB - mF);

        if (varBetween > maxVar) {
            maxVar = varBetween;
            threshold = t;
        }
    }
    
    // Safety clamp for threshold
    threshold = Math.max(30, Math.min(230, threshold));

    // 3. Blob Detection
    const visited = new Uint8Array(w * h);
    const blobs: Blob[] = [];
    
    // Only scan every 2nd pixel
    for (let y = 2; y < h - 2; y += 2) {
        for (let x = 2; x < w - 2; x += 2) {
            const idx = y * w + x;
            if (visited[idx]) continue;

            if (gray[idx] < threshold) {
                const blob = floodFillOtsu(gray, w, h, x, y, visited, threshold);
                if (blob) blobs.push(blob);
            }
        }
    }

    // 4. Candidate Filtering
    const candidates = blobs.filter(b => {
        const bw = b.maxX - b.minX;
        const bh = b.maxY - b.minY;
        
        // Too small? 
        if (bw < 6 || bh < 6) return false;
        if (b.area < 25) return false;

        // Too big? 
        if (bw > w * 0.9 || bh > h * 0.9) return false;

        // Aspect Ratio
        const aspect = bw / bh;
        if (aspect < 0.15 || aspect > 6.0) return false;

        return true;
    });

    if (candidates.length < 4) return null;

    // 5. Quadrant-based Selection
    const cx = w / 2;
    const cy = h / 2;

    const getBestInQuad = (filterFn: (b: Blob) => boolean, targetX: number, targetY: number) => {
        const quadCandidates = candidates.filter(filterFn);
        if (quadCandidates.length === 0) return null;
        
        // Sort by distance to corner
        quadCandidates.sort((a, b) => {
            const distA = Math.pow(a.cx - targetX, 2) + Math.pow(a.cy - targetY, 2);
            const distB = Math.pow(b.cx - targetX, 2) + Math.pow(b.cy - targetY, 2);
            return distA - distB;
        });

        return quadCandidates[0];
    };

    const tl = getBestInQuad(b => b.cx < cx && b.cy < cy, 0, 0);
    const tr = getBestInQuad(b => b.cx >= cx && b.cy < cy, w, 0);
    const bl = getBestInQuad(b => b.cx < cx && b.cy >= cy, 0, h);
    const br = getBestInQuad(b => b.cx >= cx && b.cy >= cy, w, h);

    if (!tl || !tr || !bl || !br) return null;

    // CRITICAL FIX: Use the outermost corners of the blobs, not the center (cx, cy).
    return { 
        tl: {x: tl.minX, y: tl.minY}, 
        tr: {x: tr.maxX, y: tr.minY}, 
        bl: {x: bl.minX, y: bl.maxY}, 
        br: {x: br.maxX, y: br.maxY} 
    };
};

const floodFillOtsu = (
    gray: Uint8Array, 
    w: number, h: number, 
    startX: number, startY: number, 
    visited: Uint8Array, 
    threshold: number
): Blob | null => {
    // Standard iterative flood fill
    const stack = [startX, startY];
    let minX = startX, maxX = startX;
    let minY = startY, maxY = startY;
    let count = 0;
    const MAX_PIXELS = w * h * 0.4; // Safety break

    while (stack.length > 0) {
        const y = stack.pop()!;
        const x = stack.pop()!;
        const idx = y * w + x;

        if (visited[idx]) continue;
        visited[idx] = 1;
        count++;

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        if (count > MAX_PIXELS) return null; 

        // Check neighbors
        if (x + 1 < w) { if (!visited[idx+1] && gray[idx+1] < threshold) stack.push(x+1, y); }
        if (x - 1 >= 0) { if (!visited[idx-1] && gray[idx-1] < threshold) stack.push(x-1, y); }
        if (y + 1 < h) { if (!visited[idx+w] && gray[idx+w] < threshold) stack.push(x, y+1); }
        if (y - 1 >= 0) { if (!visited[idx-w] && gray[idx-w] < threshold) stack.push(x, y-1); }
    }

    return {
        minX, maxX, minY, maxY,
        area: count,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2
    };
};


// --- Warp Logic (Standard 4-point transform) ---

const perspectiveWarp = (srcData: ImageData, srcPoints: Point[], w: number, h: number): ImageData => {
  const dstData = new ImageData(Math.floor(w), Math.floor(h));
  const d = dstData.data;
  d.fill(255); // Opaque White init

  const s = srcData.data;
  const sw = srcData.width;
  const sh = srcData.height;

  // H maps Dst -> Src.
  const H = getHomographyMatrix(srcPoints, w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Perspective transform
      const u_w = H[0]*x + H[1]*y + H[2];
      const v_w = H[3]*x + H[4]*y + H[5];
      const scale = H[6]*x + H[7]*y + H[8];
      
      const u = u_w / scale;
      const v = v_w / scale;

      const uInt = Math.floor(u);
      const vInt = Math.floor(v);

      if (uInt >= 0 && uInt < sw && vInt >= 0 && vInt < sh) {
        const dstIdx = (y * Math.floor(w) + x) * 4;
        const srcIdx = (vInt * sw + uInt) * 4;

        d[dstIdx] = s[srcIdx];
        d[dstIdx+1] = s[srcIdx+1];
        d[dstIdx+2] = s[srcIdx+2];
        d[dstIdx+3] = 255;
      }
    }
  }
  return dstData;
};

const getHomographyMatrix = (src: Point[], w: number, h: number) => {
    const dst = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    const system = [];
    for(let i=0; i<4; i++) {
        const sx = dst[i].x; const sy = dst[i].y;
        const dx = src[i].x; const dy = src[i].y;
        system.push([sx, sy, 1, 0, 0, 0, -sx*dx, -sy*dx, dx]);
        system.push([0, 0, 0, sx, sy, 1, -sx*dy, -sy*dy, dy]);
    }
    
    // Gaussian elimination
    const N = 8;
    for (let i = 0; i < N; i++) {
        let pivot = i;
        for (let j = i + 1; j < N; j++) {
            if (Math.abs(system[j][i]) > Math.abs(system[pivot][i])) pivot = j;
        }
        [system[i], system[pivot]] = [system[pivot], system[i]];
        for (let j = i + 1; j < N; j++) {
            const factor = system[j][i] / system[i][i];
            for (let k = i; k < N + 1; k++) system[j][k] -= factor * system[i][k];
        }
    }
    const res = new Array(8);
    for (let i = N - 1; i >= 0; i--) {
        let sum = 0;
        for (let j = i + 1; j < N; j++) sum += system[i][j] * res[j];
        res[i] = (system[i][N] - sum) / system[i][i];
    }
    return [res[0], res[1], res[2], res[3], res[4], res[5], res[6], res[7], 1];
};