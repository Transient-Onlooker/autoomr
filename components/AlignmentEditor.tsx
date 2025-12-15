import React, { useEffect, useRef, useState } from 'react';
import { ScanEye, Check } from 'lucide-react';
import { NormalizedCorners } from '../services/imageProcessing';

interface AlignmentEditorProps {
  imageSrc: string;
  onConfirm: (corners: NormalizedCorners) => void;
  onCancel: () => void;
}

export const AlignmentEditor: React.FC<AlignmentEditorProps> = ({ imageSrc, onConfirm, onCancel }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [corners, setCorners] = useState<NormalizedCorners>({
    tl: { x: 0.05, y: 0.05 },
    tr: { x: 0.95, y: 0.05 },
    bl: { x: 0.05, y: 0.95 },
    br: { x: 0.95, y: 0.95 }
  });
  const [dragging, setDragging] = useState<keyof NormalizedCorners | null>(null);

  const handleDragStart = (key: keyof NormalizedCorners) => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setDragging(key);
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging || !containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      let x = (clientX - rect.left) / rect.width;
      let y = (clientY - rect.top) / rect.height;
      
      // Clamp
      x = Math.max(0, Math.min(1, x));
      y = Math.max(0, Math.min(1, y));
      
      setCorners(prev => ({
        ...prev,
        [dragging]: { x, y }
      }));
    };

    const handleUp = () => setDragging(null);

    if (dragging) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('touchmove', handleMove);
      window.addEventListener('mouseup', handleUp);
      window.addEventListener('touchend', handleUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchend', handleUp);
    };
  }, [dragging]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="text-white mb-4 text-center">
        <h2 className="text-xl font-bold flex items-center justify-center gap-2">
           <ScanEye /> Manual Alignment
        </h2>
        <p className="text-sm text-gray-300">Drag the 4 corners to the marks on your paper.</p>
      </div>

      <div className="relative w-full max-w-4xl h-[70vh] bg-gray-800 rounded-lg shadow-2xl overflow-hidden border border-gray-700">
         <div ref={containerRef} className="relative w-full h-full">
            <img src={imageSrc} className="w-full h-full object-contain pointer-events-none select-none" alt="Reference" />
            
            {/* SVG Overlay for Lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <polygon 
                    points={`
                        ${corners.tl.x * 100}% ${corners.tl.y * 100}%, 
                        ${corners.tr.x * 100}% ${corners.tr.y * 100}%, 
                        ${corners.br.x * 100}% ${corners.br.y * 100}%, 
                        ${corners.bl.x * 100}% ${corners.bl.y * 100}%
                    `}
                    fill="rgba(59, 130, 246, 0.2)"
                    stroke="#3b82f6"
                    strokeWidth="2"
                    strokeDasharray="4"
                />
            </svg>

            {/* Draggable Handles */}
            {(Object.keys(corners) as Array<keyof NormalizedCorners>).map((key) => (
                <div
                    key={key}
                    onMouseDown={handleDragStart(key)}
                    onTouchStart={handleDragStart(key)}
                    className="absolute w-8 h-8 -ml-4 -mt-4 bg-blue-500 border-2 border-white rounded-full shadow-lg cursor-move flex items-center justify-center text-[10px] font-bold text-white hover:scale-110 transition-transform z-10"
                    style={{ left: `${corners[key].x * 100}%`, top: `${corners[key].y * 100}%` }}
                >
                    {key.toUpperCase()}
                </div>
            ))}
         </div>
      </div>

      <div className="mt-6 flex gap-4">
         <button 
            onClick={onCancel}
            className="px-6 py-2 rounded-full bg-gray-700 text-white font-medium hover:bg-gray-600"
         >
            Cancel
         </button>
         <button 
            onClick={() => onConfirm(corners)}
            className="px-6 py-2 rounded-full bg-blue-600 text-white font-bold hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-500/30"
         >
            <Check size={18} /> Apply Correction
         </button>
      </div>
    </div>
  );
};
