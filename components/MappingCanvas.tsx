import React, { useRef, useEffect, useState, MouseEvent } from 'react';
import { BubbleGroup, Bubble } from '../types';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface MappingCanvasProps {
  imageSrc: string;
  groups: BubbleGroup[];
  activeValue: string | null;
  activeGroupId: string | null;
  bubbleRadiusPct: number;
  onAddBubble: (groupId: string, bubble: Bubble) => void;
  onUpdateBubble: (groupId: string, bubbleIndex: number, newBubble: Bubble) => void;
  onDeleteBubble: (groupId: string, bubbleIndex: number) => void;
  isGridMode?: boolean;
  onGridClick?: (xPct: number, yPct: number) => void;
  gridPoints?: { x: number; y: number }[];
}

const MappingCanvas: React.FC<MappingCanvasProps> = ({
  imageSrc,
  groups,
  activeValue,
  activeGroupId,
  bubbleRadiusPct,
  onAddBubble,
  onUpdateBubble,
  onDeleteBubble,
  isGridMode = false,
  onGridClick,
  gridPoints = []
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  // Viewport Transform State
  const [scale, setScale] = useState(1);
  
  // Interaction State
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); // In image pixels (natural)
  const [draggingBubble, setDraggingBubble] = useState<{ groupId: string, index: number } | null>(null);
  
  // Magnifier State
  const [magPosition, setMagPosition] = useState<'top' | 'bottom'>('top');

  // Force redraw on resize
  const [, setForceUpdate] = useState(0);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => setForceUpdate(n => n + 1);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load image & Initial Fit
  useEffect(() => {
    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
        setImg(image);
        
        // Initial Fit to Screen logic
        if (containerRef.current) {
             const cw = containerRef.current.clientWidth;
             const ch = containerRef.current.clientHeight;
             
             if (cw && ch && image.naturalWidth && image.naturalHeight) {
                 const padding = 40; // padding in pixels
                 const availW = cw - padding;
                 const availH = ch - padding;

                 const scaleW = availW / image.naturalWidth;
                 const scaleH = availH / image.naturalHeight;
                 
                 // Fit entirely
                 const fitScale = Math.min(scaleW, scaleH);
                 
                 // Apply fit scale, but allow it to be any value
                 setScale(fitScale);
             } else {
                 setScale(1);
             }
        }
    };
  }, [imageSrc]);

  // Main Draw Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions to NATURAL image size for high res drawing
    // CSS will handle the scaling display
    if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
    }

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // No context scaling needed because canvas is at natural size. 
    // We draw at 1:1 image coordinates.
    ctx.drawImage(img, 0, 0);

    // Draw Bubbles
    const drawWidth = img.naturalWidth;
    const drawHeight = img.naturalHeight;

    // Calculate line width to appear consistent regardless of CSS scale
    // e.g. if scale is 0.1, we need 20px line on canvas to show as 2px on screen
    const lineWidth = 2 / scale;
    const textSize = Math.max(12, bubbleRadiusPct * drawWidth); // Keep text readable

    groups.forEach((group) => {
      const isGroupActive = group.id === activeGroupId && !isGridMode;
      
      group.bubbles.forEach((bubble) => {
        const cx = bubble.x * drawWidth;
        const cy = bubble.y * drawHeight;
        const r = bubbleRadiusPct * drawWidth;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        
        // Style
        ctx.fillStyle = isGroupActive ? 'rgba(59, 130, 246, 0.4)' : 'rgba(100, 116, 139, 0.3)';
        if (isGroupActive && bubble.value === activeValue) {
           ctx.fillStyle = 'rgba(34, 197, 94, 0.7)'; // Brighter Green
        }
        
        ctx.fill();
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = isGroupActive ? '#2563EB' : '#64748B';
        ctx.stroke();

        // Draw Value Text
        ctx.fillStyle = '#1e293b';
        ctx.font = `bold ${textSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bubble.value, cx, cy);
      });
    });

    // Draw Grid Points
    if (isGridMode && gridPoints.length > 0) {
      gridPoints.forEach((pt, idx) => {
        const cx = pt.x * drawWidth;
        const cy = pt.y * drawHeight;
        
        ctx.beginPath();
        ctx.arc(cx, cy, 6 / scale, 0, 2 * Math.PI); // Dot size consistent
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      });
    }

  }, [img, groups, activeGroupId, activeValue, bubbleRadiusPct, scale, isGridMode, gridPoints]);


  const getMousePosInImage = (e: MouseEvent<HTMLElement>) => {
      if (!img || !canvasRef.current) return { x: 0, y: 0 };
      
      // Offset relative to the canvas element (which is scaled by CSS)
      const rect = canvasRef.current.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      
      // Convert to natural ratio
      // clientWidth is the CSS width (scaled)
      // naturalWidth is the canvas internal width
      const x = (clientX / rect.width) * img.naturalWidth;
      const y = (clientY / rect.height) * img.naturalHeight;
      
      return { x, y };
  };

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !img) return;
    const { x, y } = getMousePosInImage(e);

    // Grid Mode - defer to click handler
    if (isGridMode) return;

    const drawWidth = img.naturalWidth;
    const drawHeight = img.naturalHeight;
    const r = bubbleRadiusPct * drawWidth; 
    const hitThresholdSq = Math.pow(r, 2);

    for (const group of groups) {
        for (let i = group.bubbles.length - 1; i >= 0; i--) {
            const b = group.bubbles[i];
            const bx = b.x * drawWidth;
            const by = b.y * drawHeight;
            const distSq = Math.pow(x - bx, 2) + Math.pow(y - by, 2);

            if (distSq <= hitThresholdSq) {
                if (e.button === 2) { // Right click to delete
                    e.preventDefault();
                    onDeleteBubble(group.id, i);
                    return;
                }
                setDraggingBubble({ groupId: group.id, index: i });
                return;
            }
        }
    }
  };

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !img) return;
    
    // 1. Calculate Magnifier Position (UI logic)
    if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Define danger zone (top-right corner, approx 200x200px)
        // If mouse is here, move magnifier to bottom
        const inDangerZone = mouseX > (rect.width - 250) && mouseY < 250;
        
        if (inDangerZone && magPosition === 'top') {
            setMagPosition('bottom');
        } else if (!inDangerZone && magPosition === 'bottom') {
            setMagPosition('top');
        }
    }

    // 2. Logic for Bubbles
    const { x, y } = getMousePosInImage(e);
    setMousePos({ x, y });

    if (draggingBubble) {
        const drawWidth = img.naturalWidth;
        const drawHeight = img.naturalHeight;

        const xPct = Math.max(0, Math.min(1, x / drawWidth));
        const yPct = Math.max(0, Math.min(1, y / drawHeight));

        const group = groups.find(g => g.id === draggingBubble.groupId);
        if (group) {
            const bubble = group.bubbles[draggingBubble.index];
            onUpdateBubble(draggingBubble.groupId, draggingBubble.index, {
                ...bubble,
                x: xPct,
                y: yPct
            });
        }
    }
  };

  const handleMouseUp = (e: MouseEvent<HTMLCanvasElement>) => {
    if (draggingBubble) {
        setDraggingBubble(null);
        return;
    }
    
    if (!canvasRef.current || !img) return;

    if (!isGridMode && (!activeGroupId || !activeValue)) return;
    if (e.button !== 0) return; 

    const { x, y } = getMousePosInImage(e);

    const drawWidth = img.naturalWidth;
    const drawHeight = img.naturalHeight;

    const xPct = x / drawWidth;
    const yPct = y / drawHeight;

    if (isGridMode && onGridClick) {
        onGridClick(xPct, yPct);
    } else {
        if(xPct >= 0 && xPct <= 1 && yPct >= 0 && yPct <= 1) {
             onAddBubble(activeGroupId!, {
                value: activeValue!,
                x: xPct,
                y: yPct
            });
        }
    }
  };

  // Magnifier Rendering
  const renderMagnifier = () => {
      if (!img) return null;
      
      const magSize = 150; 
      const zoomLevel = 2.5; 

      // mousePos is already in Natural pixels
      const imgX = mousePos.x;
      const imgY = mousePos.y;

      const bgPos = `${-imgX * zoomLevel + magSize / 2}px ${-imgY * zoomLevel + magSize / 2}px`;
      const bgSize = `${img.naturalWidth * zoomLevel}px ${img.naturalHeight * zoomLevel}px`;
      
      const posClass = magPosition === 'top' ? 'top-4' : 'bottom-4';

      return (
          <div 
            className={`absolute right-4 ${posClass} border-2 border-slate-800 bg-white rounded shadow-2xl z-50 overflow-hidden pointer-events-none transition-all duration-300 ease-in-out`}
            style={{ width: magSize, height: magSize }}
          >
              <div 
                 style={{
                     width: '100%', height: '100%',
                     backgroundImage: `url(${imageSrc})`,
                     backgroundPosition: bgPos,
                     backgroundSize: bgSize,
                     backgroundRepeat: 'no-repeat'
                 }}
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-50">
                  <div className="w-full h-px bg-red-500"></div>
                  <div className="h-full w-px bg-red-500 absolute"></div>
              </div>
              <div className="absolute bottom-0 right-0 bg-black/70 text-white text-[10px] px-1">
                  {zoomLevel}x
              </div>
          </div>
      );
  };

  // Safe Zoom helpers
  const zoomIn = () => setScale(s => s * 1.25);
  // Allow zooming out to 5% to handle very large images on small screens
  const zoomOut = () => setScale(s => Math.max(s / 1.25, 0.05));
  
  // Fit Logic again (Reset)
  const fitToScreen = () => {
     if (containerRef.current && img) {
         const cw = containerRef.current.clientWidth;
         const ch = containerRef.current.clientHeight;
         const padding = 40;
         const availW = cw - padding;
         const availH = ch - padding;
         const scaleW = availW / img.naturalWidth;
         const scaleH = availH / img.naturalHeight;
         setScale(Math.min(scaleW, scaleH));
     } else {
         setScale(1);
     }
  };

  return (
    <div className={`relative w-full h-full shadow-lg rounded-lg bg-slate-200 border border-slate-300 select-none group flex flex-col overflow-hidden`}>
      
      {/* Toolbar */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 z-10 sticky-ui">
          <div className="bg-white rounded-lg shadow-md border border-slate-200 flex flex-col overflow-hidden">
            <button onClick={zoomIn} className="p-2 hover:bg-slate-100 active:bg-slate-200" title="Zoom In"><ZoomIn size={20} /></button>
            <button onClick={zoomOut} className="p-2 hover:bg-slate-100 active:bg-slate-200 border-t border-b" title="Zoom Out"><ZoomOut size={20} /></button>
            <button onClick={fitToScreen} className="p-2 hover:bg-slate-100 active:bg-slate-200" title="Fit to Screen"><Maximize size={20} /></button>
          </div>
          <div className="bg-black/70 text-white text-xs px-2 py-1 rounded text-center backdrop-blur-sm shadow-md">
             {(scale * 100).toFixed(0)}%
          </div>
      </div>
      
      {/* Magnifier */}
      {renderMagnifier()}

      {/* Scrollable Container */}
      <div ref={containerRef} className="flex-1 overflow-auto relative w-full h-full bg-slate-500/10">
        {img && (
            <div 
                style={{ 
                    width: img.naturalWidth * scale, 
                    height: img.naturalHeight * scale,
                    // Center the image if it's smaller than the container
                    margin: 'auto',
                    minWidth: 'min-content',
                    minHeight: 'min-content'
                }} 
                className="relative shadow-2xl bg-white"
            >
                <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onContextMenu={(e) => e.preventDefault()}
                    width={img.naturalWidth} // internal res
                    height={img.naturalHeight} // internal res
                    style={{ width: '100%', height: '100%', display: 'block' }} // CSS scaling
                    className={isGridMode ? 'cursor-crosshair' : 'cursor-default'}
                />
            </div>
        )}

        {!img && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            Loading Image...
            </div>
        )}
      </div>

      {isGridMode && (
         <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-bold animate-pulse pointer-events-none z-20">
            {gridPoints.length === 0 ? "Click TOP-LEFT" : "Click BOTTOM-RIGHT"}
         </div>
      )}
    </div>
  );
};

export default MappingCanvas;