
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Settings, Check, FileText, Play, Plus, Trash2, ArrowRight, HelpCircle, Save, FolderOpen, Grid, MousePointer2, Edit2, RotateCcw, RotateCw, X, FileDown, FileUp, SlidersHorizontal, Hash, KeyRound, Layers, Download, ChevronLeft, Loader2, ScanEye, Crop, AlertTriangle } from 'lucide-react';
import MappingCanvas from './components/MappingCanvas';
import ResultsView from './components/ResultsView';
import { AlignmentEditor } from './components/AlignmentEditor';
import { processOmrSheet } from './services/gradingLogic';
import { autoAlignImage, warpImageWithCorners, NormalizedCorners, rotateImageBase64 } from './services/imageProcessing';
import { OmrTemplate, BubbleGroup, Bubble, GradingResult } from './types';

// Initial Empty Template
const initialTemplate: OmrTemplate = {
  imageUrl: '',
  bubbleRadius: 0.012, // Default ~1.2% of width
  threshold: 0.6, // Default 60% fill required
  groups: [],
};

export default function App() {
  // Application State
  const [step, setStep] = useState<'upload_template' | 'mapping' | 'upload_filled' | 'grading' | 'results' | 'batch_results' | 'batch_detail'>('upload_template');
  const [template, setTemplate] = useState<OmrTemplate>(initialTemplate);
  
  // History State for Undo/Redo
  const [history, setHistory] = useState<OmrTemplate[]>([]);
  const [future, setFuture] = useState<OmrTemplate[]>([]);

  const [filledImage, setFilledImage] = useState<string | null>(null);
  const [filledFileName, setFilledFileName] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<GradingResult | null>(null);
  
  // Alignment State
  const [rawImageForAlignment, setRawImageForAlignment] = useState<string | null>(null);
  const [isAlignmentEditorOpen, setIsAlignmentEditorOpen] = useState(false);

  // Batch State
  const [batchResults, setBatchResults] = useState<GradingResult[]>([]);
  const [activeBatchResult, setActiveBatchResult] = useState<GradingResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");

  // Mapping State
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeValue, setActiveValue] = useState<string | null>(null);
  const [newGroupLabel, setNewGroupLabel] = useState('');
  const [newGroupType, setNewGroupType] = useState<'identity' | 'question'>('question');
  const [newGroupPoints, setNewGroupPoints] = useState(1);
  const [newGroupCorrect, setNewGroupCorrect] = useState(''); 

  // Edit Mode State
  const [editingGroup, setEditingGroup] = useState<BubbleGroup | null>(null);
  const [isEditingRadius, setIsEditingRadius] = useState(false);
  const [isEditingThreshold, setIsEditingThreshold] = useState(false);

  // Grid Generator State
  const [isGridMode, setIsGridMode] = useState(false);
  const [gridPoints, setGridPoints] = useState<{x:number, y:number}[]>([]);
  const [gridStartNo, setGridStartNo] = useState(1);
  const [gridCount, setGridCount] = useState(5);
  const [gridOptions, setGridOptions] = useState("1,2,3,4,5");
  const [gridDirection, setGridDirection] = useState<'horizontal' | 'vertical'>('horizontal');
  const [gridType, setGridType] = useState<'question' | 'identity'>('question');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ansKeyInputRef = useRef<HTMLInputElement>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);

  // --- History Management ---
  const updateTemplateWithHistory = (newTemplate: OmrTemplate) => {
      setHistory(prev => [...prev, template]);
      setFuture([]); // Clear redo stack on new action
      setTemplate(newTemplate);
  };

  const undo = useCallback(() => {
      if (history.length === 0) return;
      const previous = history[history.length - 1];
      const newHistory = history.slice(0, -1);
      
      setFuture(prev => [template, ...prev]);
      setTemplate(previous);
      setHistory(newHistory);
  }, [history, template]);

  const redo = useCallback(() => {
      if (future.length === 0) return;
      const next = future[0];
      const newFuture = future.slice(1);

      setHistory(prev => [...prev, template]);
      setTemplate(next);
      setFuture(newFuture);
  }, [future, template]);


  // --- Keyboard Shortcuts ---
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (step !== 'mapping') return;

          // Undo/Redo
          if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
              e.preventDefault();
              undo();
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
              e.preventDefault();
              redo();
          }

          // Number keys 1-5 to switch Active Value
          if (['1', '2', '3', '4', '5', '0', '6', '7', '8', '9'].includes(e.key)) {
              // Ignore if typing in an input
              if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
              setActiveValue(e.key);
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, undo, redo]);


  // --- Handlers ---
  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsProcessing(true);
      setProcessingStatus("Aligning template...");
      
      // Store raw image for manual alignment
      const rawUrl = URL.createObjectURL(file);
      setRawImageForAlignment(rawUrl);

      try {
          const alignedDataUrl = await autoAlignImage(file);
          setTemplate(prev => ({ ...prev, imageUrl: alignedDataUrl }));
          setStep('mapping');
      } catch (err) {
          alert("Failed to process image: " + err);
      } finally {
          setIsProcessing(false);
      }
    }
  };

  const handleFilledUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFilledFileName(file.name);
      setIsProcessing(true);
      setProcessingStatus("Aligning scan...");

      const rawUrl = URL.createObjectURL(file);
      setRawImageForAlignment(rawUrl);

      try {
          const alignedDataUrl = await autoAlignImage(file);
          setFilledImage(alignedDataUrl);
          setStep('grading'); // Ready to grade
      } catch (err) {
          alert("Failed to process image: " + err);
      } finally {
          setIsProcessing(false);
      }
    }
  };

  const handleManualAlignment = async (corners: NormalizedCorners) => {
    if (!rawImageForAlignment) return;
    setIsProcessing(true);
    setProcessingStatus("Applying manual correction...");
    setIsAlignmentEditorOpen(false);

    try {
        const warpedUrl = await warpImageWithCorners(rawImageForAlignment, corners);
        
        if (step === 'mapping') {
            setTemplate(prev => ({ ...prev, imageUrl: warpedUrl }));
        } else if (step === 'grading' || step === 'upload_filled') {
            setFilledImage(warpedUrl);
            setStep('grading');
        }
    } catch (e) {
        alert("Warping failed: " + e);
    } finally {
        setIsProcessing(false);
    }
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      
      setIsProcessing(true);
      const files = Array.from(e.target.files) as File[];
      const results: GradingResult[] = [];
      const threshold = template.threshold !== undefined ? template.threshold : 0.6;

      try {
          for (let i = 0; i < files.length; i++) {
              const file = files[i];
              setProcessingStatus(`Processing ${i+1}/${files.length}: ${file.name}`);
              
              // 1. Initial Attempt: Auto Align
              const alignedDataUrl = await autoAlignImage(file);
              
              // 2. Initial Grade
              let res = await processOmrSheet(template, alignedDataUrl, threshold, file.name);

              // 3. Heuristic Check for Rotation
              // If the result looks invalid (e.g., no ID marks detected when ID fields exist, 
              // or very few bubbles marked overall), try rotating 180 degrees.
              const idGroups = res.groups.filter(g => g.type === 'identity');
              const hasIdMarks = idGroups.some(g => g.markedValues.length > 0);
              const totalMarks = res.groups.reduce((acc, g) => acc + g.bubbles.filter(b => b.isMarked).length, 0);
              const totalBubbles = res.groups.reduce((acc, g) => acc + g.bubbles.length, 0);

              // Heuristic: If we expect ID but found none, OR if less than 2 marks found in total (and there are bubbles),
              // it's likely flipped.
              const suspicious = (idGroups.length > 0 && !hasIdMarks) || (totalBubbles > 10 && totalMarks < 3);

              if (suspicious) {
                  setProcessingStatus(`Auto-rotating ${i+1}/${files.length}...`);
                  // Rotate the aligned image (which might be upside down) 180 degrees
                  const rotatedUrl = await rotateImageBase64(alignedDataUrl, 180);
                  
                  // Grade again
                  const resRotated = await processOmrSheet(template, rotatedUrl, threshold, file.name);
                  
                  // Compare
                  const idMarksRotated = resRotated.groups.filter(g => g.type === 'identity' && g.markedValues.length > 0).length;
                  const totalMarksRotated = resRotated.groups.reduce((acc, g) => acc + g.bubbles.filter(b => b.isMarked).length, 0);

                  if (idMarksRotated > 0 || totalMarksRotated > totalMarks) {
                      res = resRotated; // Accept the rotated result
                  }
              }

              results.push(res);
          }
          setBatchResults(results);
          setStep('batch_results');
      } catch (err) {
          alert("Error during batch processing: " + err);
      } finally {
          setIsProcessing(false);
          setProcessingStatus("");
          // Reset input so same files can be selected again if needed
          if (batchInputRef.current) batchInputRef.current.value = '';
      }
  };

  // ... (Keep existing helpers: addGroup, saveGroupEdit, deleteGroup, handleClearAll, handleAddBubble, handleUpdateBubble, handleDeleteBubble, startGridTool, handleGridClick, generateGrid, saveTemplate, loadTemplate, exportAnswerKey, importAnswerKey) ...

  const addGroup = () => {
    if (!newGroupLabel) return;
    const newGroup: BubbleGroup = {
      id: crypto.randomUUID(),
      label: newGroupLabel,
      type: newGroupType,
      bubbles: [],
      points: newGroupType === 'question' ? newGroupPoints : undefined,
      correctAnswer: newGroupType === 'question' ? (newGroupCorrect ? newGroupCorrect.split(',').map(s => s.trim()) : []) : undefined
    };
    updateTemplateWithHistory({
      ...template,
      groups: [...template.groups, newGroup]
    });
    setNewGroupLabel('');
    setActiveGroupId(newGroup.id);
    setActiveValue(newGroupType === 'identity' ? '0' : '1');
  };

  const saveGroupEdit = () => {
      if (!editingGroup) return;
      updateTemplateWithHistory({
          ...template,
          groups: template.groups.map(g => g.id === editingGroup.id ? editingGroup : g)
      });
      setEditingGroup(null);
  };

  const deleteGroup = (id: string) => {
      updateTemplateWithHistory({
          ...template,
          groups: template.groups.filter(g => g.id !== id)
      });
      if (activeGroupId === id) setActiveGroupId(null);
  };

  const handleClearAll = () => {
    if (template.groups.length === 0) return;
    updateTemplateWithHistory({
      ...template,
      groups: []
    });
    setActiveGroupId(null);
    setEditingGroup(null);
  };

  const handleAddBubble = (groupId: string, bubble: Bubble) => {
    const groupIndex = template.groups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) return;
    const group = template.groups[groupIndex];
    const existingIndex = group.bubbles.findIndex(b => b.value === bubble.value);
    let newBubbles = [...group.bubbles];
    if (existingIndex !== -1) {
        newBubbles[existingIndex] = bubble;
    } else {
        newBubbles.push(bubble);
    }
    const newGroups = [...template.groups];
    newGroups[groupIndex] = { ...group, bubbles: newBubbles };
    updateTemplateWithHistory({ ...template, groups: newGroups });
  };

  const handleUpdateBubble = (groupId: string, bubbleIndex: number, newBubble: Bubble) => {
      const groupIndex = template.groups.findIndex(g => g.id === groupId);
      if (groupIndex === -1) return;
      const group = template.groups[groupIndex];
      const newBubbles = [...group.bubbles];
      newBubbles[bubbleIndex] = newBubble;
      const newGroups = [...template.groups];
      newGroups[groupIndex] = { ...group, bubbles: newBubbles };
      setTemplate({ ...template, groups: newGroups });
  };

  const handleDeleteBubble = (groupId: string, bubbleIndex: number) => {
    const groupIndex = template.groups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) return;
    const group = template.groups[groupIndex];
    const newBubbles = [...group.bubbles];
    newBubbles.splice(bubbleIndex, 1);
    const newGroups = [...template.groups];
    newGroups[groupIndex] = { ...group, bubbles: newBubbles };
    updateTemplateWithHistory({ ...template, groups: newGroups });
  };

  const startGridTool = () => {
    setIsGridMode(true);
    setGridPoints([]);
    setActiveGroupId(null);
  };

  const handleGridClick = (x: number, y: number) => {
    const newPoints = [...gridPoints, { x, y }];
    setGridPoints(newPoints);
    if (newPoints.length === 2) {
      generateGrid(newPoints[0], newPoints[1]);
      setIsGridMode(false);
      setGridPoints([]);
    }
  };

  const generateGrid = (p1: {x:number, y:number}, p2: {x:number, y:number}) => {
    const options = gridOptions.split(',').map(s => s.trim()).filter(s => s);
    if (options.length === 0) return;
    const newGroups: BubbleGroup[] = [];
    const isHorizontal = gridDirection === 'horizontal';
    const numGroups = gridCount;
    const numBubblesPerGroup = options.length;
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    const groupStepX = isHorizontal ? 0 : (numGroups > 1 ? (maxX - minX) / (numGroups - 1) : 0);
    const groupStepY = isHorizontal ? (numGroups > 1 ? (maxY - minY) / (numGroups - 1) : 0) : 0;
    const bubbleStepX = isHorizontal ? (numBubblesPerGroup > 1 ? (maxX - minX) / (numBubblesPerGroup - 1) : 0) : 0;
    const bubbleStepY = isHorizontal ? 0 : (numBubblesPerGroup > 1 ? (maxY - minY) / (numBubblesPerGroup - 1) : 0);

    for (let g = 0; g < numGroups; g++) {
      const groupBubbles: Bubble[] = [];
      const currentLabel = (gridStartNo + g).toString();
      const groupOriginX = isHorizontal ? minX : minX + (g * groupStepX);
      const groupOriginY = isHorizontal ? minY + (g * groupStepY) : minY;
      for (let b = 0; b < numBubblesPerGroup; b++) {
        const bx = groupOriginX + (b * bubbleStepX);
        const by = groupOriginY + (b * bubbleStepY);
        groupBubbles.push({
          value: options[b],
          x: bx,
          y: by
        });
      }
      newGroups.push({
        id: crypto.randomUUID(),
        label: currentLabel,
        type: gridType, 
        bubbles: groupBubbles,
        points: gridType === 'question' ? undefined : undefined,
        correctAnswer: gridType === 'question' ? [] : undefined 
      });
    }
    updateTemplateWithHistory({
      ...template,
      groups: [...template.groups, ...newGroups]
    });
    setGridStartNo(prev => prev + numGroups);
  };

  const saveTemplate = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(template));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "omr_template.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const loadTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const loaded = JSON.parse(evt.target?.result as string);
            if (loaded.groups && Array.isArray(loaded.groups)) {
                updateTemplateWithHistory(loaded);
                setActiveGroupId(null);
                setStep('mapping');
            } else {
                alert("Invalid template file format.");
            }
        } catch(err) {
            alert("Failed to parse JSON.");
        }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const exportAnswerKey = () => {
      const questions = template.groups.filter(g => g.type === 'question');
      questions.sort((a, b) => {
         const na = parseInt(a.label);
         const nb = parseInt(b.label);
         if (!isNaN(na) && !isNaN(nb)) return na - nb;
         return a.label.localeCompare(b.label);
      });
      let content = "Label | Points | Answer\n";
      content += "-----------------------\n";
      questions.forEach(q => {
          const pts = (q.points !== undefined && q.points !== null) ? q.points : '-';
          let ans = '-';
          if (q.correctAnswer && q.correctAnswer.length > 0) {
              const joined = q.correctAnswer.join(',').trim();
              if (joined !== '') ans = joined;
          }
          content += `${q.label} | ${pts} | ${ans}\n`;
      });
      const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(content);
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "answer_key.txt");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
  };

  const importAnswerKey = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          const lines = text.split('\n');
          let newGroups = [...template.groups];
          let updatedCount = 0;
          lines.forEach(line => {
              line = line.trim();
              if (!line || line.startsWith('Label') || line.startsWith('--')) return;
              const parts = line.split('|').map(p => p.trim());
              if (parts.length >= 3) {
                  const label = parts[0];
                  const pointsStr = parts[1];
                  const ansStr = parts[2];
                  const gIndex = newGroups.findIndex(g => g.label === label && g.type === 'question');
                  if (gIndex !== -1) {
                      const group = { ...newGroups[gIndex] };
                      if (pointsStr === '-') {
                          group.points = undefined;
                      } else {
                          const pts = parseFloat(pointsStr);
                          if (!isNaN(pts)) group.points = pts;
                      }
                      if (ansStr === '-') {
                          group.correctAnswer = undefined; 
                      } else {
                          const parsedAns = ansStr.split(',').map(s => s.trim()).filter(s => s);
                          if (parsedAns.length > 0) {
                             group.correctAnswer = parsedAns;
                          } else {
                             group.correctAnswer = undefined;
                          }
                      }
                      newGroups[gIndex] = group;
                      updatedCount++;
                  }
              }
          });
          if (updatedCount > 0) {
              updateTemplateWithHistory({ ...template, groups: newGroups });
              alert(`Updated ${updatedCount} questions from file.`);
          } else {
              alert("No matching labels found or invalid file format.");
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  const runGrading = async () => {
    if (!filledImage) return;
    setIsProcessing(true);
    setProcessingStatus("Grading...");
    try {
      const threshold = template.threshold !== undefined ? template.threshold : 0.6;
      const res = await processOmrSheet(template, filledImage, threshold, filledFileName);
      setResult(res);
      setStep('results');
    } catch (err) {
      alert("Error processing image: " + err);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadBatchCSV = () => {
      if(batchResults.length === 0) return;
      let csv = "ID/File,Total Score,Max Score,Correct,Incorrect,Unmarked\n";
      batchResults.forEach(res => {
          let id = res.fileName || "Unknown";
          const idGroups = res.groups.filter(g => g.type === 'identity');
          if (idGroups.length > 0) {
               // Check for error: Not exactly one mark
               const hasError = idGroups.some(g => g.markedValues.length !== 1);
               if (hasError) {
                   id = `ERROR_${res.fileName}`;
               } else {
                   const idVal = idGroups.map(g => g.markedValues.join('')).join('');
                   if(idVal) id = idVal;
               }
          }
          const correctCount = res.groups.filter(g => g.type === 'question' && g.isCorrect).length;
          const incorrectCount = res.groups.filter(g => g.type === 'question' && g.isCorrect === false).length;
          const unmarkedCount = res.groups.filter(g => g.type === 'question' && g.markedValues.length === 0).length;
          csv += `${id},${res.totalScore},${res.maxScore},${correctCount},${incorrectCount},${unmarkedCount}\n`;
      });
      const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "batch_results.csv");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
  };

  // --- Render Steps ---

  return (
    <>
      {isAlignmentEditorOpen && rawImageForAlignment && (
         <AlignmentEditor 
            imageSrc={rawImageForAlignment}
            onConfirm={handleManualAlignment}
            onCancel={() => setIsAlignmentEditorOpen(false)}
         />
      )}

      {isProcessing && (
          <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
              <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
                  <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                  <div className="text-xl font-semibold text-slate-800">{processingStatus}</div>
                  <p className="text-slate-500 text-sm">Aligning and analyzing OMR sheet...</p>
              </div>
          </div>
      )}

      {/* Main Content Router */}
      {(() => {
        if (step === 'upload_template') {
            return (
              <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-6">
                  <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto text-blue-600">
                    <Upload size={32} />
                  </div>
                  <div>
                    <h1 className="text-3xl font-extrabold text-blue-600 mb-2 tracking-tight">AutoOMR V1.3</h1>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Setup OMR Template</h2>
                    <p className="text-gray-500">Upload a blank OMR sheet to begin mapping.</p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <label className="block w-full cursor-pointer group">
                        <div className="w-full h-32 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center group-hover:border-blue-500 transition-colors">
                        <span className="text-gray-400 font-medium group-hover:text-blue-500">Select Image File</span>
                        </div>
                        <input type="file" accept="image/*" onChange={handleTemplateUpload} className="hidden" />
                    </label>

                    <div className="relative flex py-2 items-center">
                        <div className="flex-grow border-t border-gray-200"></div>
                        <span className="flex-shrink-0 mx-4 text-gray-400 text-sm">OR</span>
                        <div className="flex-grow border-t border-gray-200"></div>
                    </div>

                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                        <FolderOpen size={20} /> Load Existing JSON
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={loadTemplate} 
                        className="hidden" 
                        accept=".json" 
                    />
                  </div>
                </div>
              </div>
            );
        }

        if (step === 'mapping') {
            const activeGroup = template.groups.find(g => g.id === activeGroupId);
            const paletteOptions = activeGroup?.type === 'identity' 
              ? ['0','1','2','3','4','5','6','7','8','9'] 
              : ['1','2','3','4','5'];

            return (
              <div className="h-screen flex flex-col">
                <header className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm z-10 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-600 text-white p-2 rounded-lg"><Settings size={20} /></div>
                    <h1 className="font-bold text-xl text-slate-800">Template Mapper</h1>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Manual Alignment Trigger */}
                    <button 
                       onClick={() => setIsAlignmentEditorOpen(true)}
                       className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg mr-2"
                       title="Fix twisted or misaligned image"
                    >
                       <Crop size={18} /> Fix Alignment
                    </button>

                    <div className="flex items-center gap-1 border-r pr-4 mr-2 border-gray-200">
                        <button onClick={() => ansKeyInputRef.current?.click()} className="p-2 text-slate-600 hover:bg-slate-100 rounded text-xs font-medium"><FileUp size={18} /></button>
                        <input type="file" ref={ansKeyInputRef} onChange={importAnswerKey} className="hidden" accept=".txt" />
                        <button onClick={exportAnswerKey} className="p-2 text-slate-600 hover:bg-slate-100 rounded text-xs font-medium"><FileDown size={18} /></button>
                    </div>

                    <div className="flex items-center gap-1 border-r pr-4 mr-2 border-gray-200">
                       <button onClick={undo} disabled={history.length === 0} className="p-2 text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30"><RotateCcw size={18} /></button>
                       <button onClick={redo} disabled={future.length === 0} className="p-2 text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30"><RotateCw size={18} /></button>
                    </div>

                    <input type="file" ref={fileInputRef} onChange={loadTemplate} className="hidden" accept=".json" />
                    <button onClick={() => fileInputRef.current?.click()} className="text-slate-600 hover:text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg text-sm font-medium"><FolderOpen size={18} /> Load</button>
                    <button onClick={saveTemplate} className="text-slate-600 hover:text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg text-sm font-medium border-r pr-4 mr-2 border-gray-200"><Save size={18} /> Save</button>

                    <button 
                      onClick={() => { setStep('upload_filled'); setFilledImage(null); }} 
                      disabled={template.groups.length === 0}
                      className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
                    >
                      Finish Mapping <ArrowRight size={18} />
                    </button>
                  </div>
                </header>

                <div className="flex flex-1 overflow-hidden">
                  <aside className="w-80 bg-white border-r flex flex-col overflow-y-auto z-10 shadow-lg custom-scrollbar shrink-0">
                    {/* ... (Keep Sidebar Content: Grid, Manual Add, List, Radius/Threshold) ... */}
                    <div className="p-4 border-b space-y-3 bg-indigo-50/50">
                       <div className="flex items-center gap-2 text-indigo-700 font-bold mb-1">
                         <Grid size={18} />
                         <h2>Smart Grid Generator</h2>
                       </div>
                       <div className="grid grid-cols-2 gap-2">
                         <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Start #</label>
                            <input type="number" value={gridStartNo} onChange={e => setGridStartNo(Number(e.target.value))} className="w-full text-sm p-1.5 border rounded bg-white text-slate-900" />
                         </div>
                         <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Count</label>
                            <input type="number" value={gridCount} onChange={e => setGridCount(Number(e.target.value))} className="w-full text-sm p-1.5 border rounded bg-white text-slate-900" />
                         </div>
                       </div>
                       <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Options</label>
                          <input type="text" value={gridOptions} onChange={e => setGridOptions(e.target.value)} className="w-full text-sm p-1.5 border rounded bg-white text-slate-900" placeholder="1,2,3,4,5" />
                       </div>
                       <div>
                         <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Orientation</label>
                         <div className="flex gap-2 mb-2">
                           <button onClick={() => setGridDirection('horizontal')} className={`flex-1 py-1.5 text-xs rounded border ${gridDirection === 'horizontal' ? 'bg-indigo-100 border-indigo-300 text-indigo-800 font-semibold' : 'bg-white border-slate-200 text-slate-600'}`}>Vertical Stack</button>
                           <button onClick={() => setGridDirection('vertical')} className={`flex-1 py-1.5 text-xs rounded border ${gridDirection === 'vertical' ? 'bg-indigo-100 border-indigo-300 text-indigo-800 font-semibold' : 'bg-white border-slate-200 text-slate-600'}`}>Horizontal Stack</button>
                         </div>
                       </div>
                       <div>
                         <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Region Type</label>
                         <div className="flex gap-2">
                           <button onClick={() => setGridType('question')} className={`flex-1 py-1.5 text-xs rounded border flex items-center justify-center gap-1 ${gridType === 'question' ? 'bg-indigo-100 border-indigo-300 text-indigo-800 font-semibold' : 'bg-white border-slate-200 text-slate-600'}`}><HelpCircle size={12} /> Question</button>
                           <button onClick={() => setGridType('identity')} className={`flex-1 py-1.5 text-xs rounded border flex items-center justify-center gap-1 ${gridType === 'identity' ? 'bg-indigo-100 border-indigo-300 text-indigo-800 font-semibold' : 'bg-white border-slate-200 text-slate-600'}`}><Hash size={12} /> ID/Data</button>
                         </div>
                       </div>
                       <button onClick={startGridTool} disabled={isGridMode} className={`w-full py-2 rounded text-sm font-bold flex items-center justify-center gap-2 transition-all ${isGridMode ? 'bg-red-500 text-white animate-pulse' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}>{isGridMode ? <MousePointer2 size={16} /> : <Grid size={16} />} {isGridMode ? "Select on Canvas..." : "Grid Tool"}</button>
                    </div>

                    <div className="p-4 border-b space-y-4">
                      <h2 className="font-semibold text-slate-700 flex items-center gap-2 text-sm"><Plus size={16} /> Manual Add Single</h2>
                      <div className="space-y-3">
                        <input type="text" placeholder="Label (e.g. '1')" value={newGroupLabel} onChange={e => setNewGroupLabel(e.target.value)} className="w-full border rounded p-2 text-sm bg-white text-slate-900" />
                        <select value={newGroupType} onChange={(e: any) => setNewGroupType(e.target.value)} className="w-full border rounded p-2 text-sm bg-white text-slate-900"><option value="question">Question Field</option><option value="identity">Identity Column</option></select>
                        <button onClick={addGroup} disabled={!newGroupLabel} className="w-full bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 py-2 rounded flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-50">Add Region</button>
                      </div>
                    </div>

                    <div className="p-4 flex-1 space-y-2">
                      <div className="flex justify-between items-center mb-2">
                        <h2 className="font-semibold text-slate-700">Regions List</h2>
                        {template.groups.length > 0 && (<button onClick={handleClearAll} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"><Trash2 size={12} /> Clear</button>)}
                      </div>
                      {template.groups.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No regions defined</p>}
                      {template.groups.map(g => (
                        <div key={g.id} onClick={() => { setActiveGroupId(g.id); setActiveValue(g.type === 'identity' ? '0' : '1'); }} className={`p-3 rounded-lg cursor-pointer border transition-all relative group ${activeGroupId === g.id ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-white border-transparent hover:bg-gray-50'}`}>
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="font-medium text-sm text-slate-800">{g.type === 'identity' ? 'ID:' : 'Q:'} {g.label}</div>
                              <div className="text-xs text-slate-500">{g.bubbles.length} bubbles • Ans: {g.correctAnswer?.join(',') || '-'}</div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button onClick={(e) => { e.stopPropagation(); setEditingGroup(g); }} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded" title="Edit"><Edit2 size={14} /></button>
                                <button onClick={(e) => { e.stopPropagation(); deleteGroup(g.id); }} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-100 rounded" title="Delete"><Trash2 size={14} /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="p-4 border-t bg-slate-50 space-y-4">
                       <div className="space-y-1">
                           <div className="flex items-center justify-between">
                             <label className="text-xs font-bold text-slate-500 uppercase">Bubble Radius</label>
                             {isEditingRadius ? (
                                 <div className="flex items-center gap-1"><input type="number" step="0.01" autoFocus onBlur={() => setIsEditingRadius(false)} onKeyDown={(e) => { if(e.key === 'Enter') setIsEditingRadius(false); }} value={Number((template.bubbleRadius * 100).toFixed(2))} onChange={(e) => setTemplate(prev => ({ ...prev, bubbleRadius: parseFloat(e.target.value) / 100 }))} className="w-16 text-xs p-1 border rounded text-right" /><span className="text-xs text-slate-500">%</span></div>
                             ) : (
                                <span onClick={() => setIsEditingRadius(true)} className="text-xs font-mono text-slate-600 bg-slate-200 px-2 py-0.5 rounded cursor-pointer hover:bg-slate-300 transition-colors">{(template.bubbleRadius * 100).toFixed(2)}%</span>
                             )}
                           </div>
                           <input type="range" min="0.005" max="0.10" step="0.001" value={template.bubbleRadius} onChange={(e) => setTemplate(prev => ({ ...prev, bubbleRadius: parseFloat(e.target.value) }))} className="w-full cursor-pointer accent-blue-600"/>
                       </div>
                       <div className="space-y-1">
                           <div className="flex items-center justify-between">
                             <div className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase"><SlidersHorizontal size={12} /> Mark Sensitivity</div>
                             {isEditingThreshold ? (
                                 <div className="flex items-center gap-1"><input type="number" step="1" min="10" max="90" autoFocus onBlur={() => setIsEditingThreshold(false)} onKeyDown={(e) => { if(e.key === 'Enter') setIsEditingThreshold(false); }} value={Math.round((template.threshold || 0.6) * 100)} onChange={(e) => { const val = Math.min(90, Math.max(10, parseInt(e.target.value) || 60)); setTemplate(prev => ({ ...prev, threshold: val / 100 })); }} className="w-12 text-xs p-1 border rounded text-right" /><span className="text-xs text-slate-500">%</span></div>
                             ) : (
                                <span onClick={() => setIsEditingThreshold(true)} className="text-xs font-mono text-slate-600 bg-slate-200 px-2 py-0.5 rounded cursor-pointer hover:bg-slate-300 transition-colors">{Math.round((template.threshold || 0.6) * 100)}%</span>
                             )}
                           </div>
                           <input type="range" min="0.1" max="0.9" step="0.05" value={template.threshold || 0.6} onChange={(e) => setTemplate(prev => ({ ...prev, threshold: parseFloat(e.target.value) }))} className="w-full cursor-pointer accent-indigo-600"/>
                           <div className="flex justify-between text-[10px] text-gray-400 px-1"><span>Sensitive</span><span>Strict</span></div>
                       </div>
                    </div>
                  </aside>

                  <main className="flex-1 bg-gray-100 p-0 overflow-hidden relative flex flex-col">
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
                         {isGridMode && (
                            <div className="bg-red-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-bold flex items-center gap-3 animate-pulse">
                                <Grid size={18} />
                                GRID MODE: Click Top-Left then Bottom-Right
                                <button onClick={() => setIsGridMode(false)} className="bg-white text-red-600 rounded-full p-0.5"><X size={14}/></button>
                            </div>
                         )}

                         {!isGridMode && activeGroup && (
                            <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-slate-300 flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500 uppercase mr-2">Quick Key:</span>
                                {paletteOptions.map(val => (
                                <button key={val} onClick={() => setActiveValue(val)} className={`w-8 h-8 rounded-full text-sm font-bold flex items-center justify-center transition-all ${activeValue === val ? 'bg-blue-600 text-white shadow-md scale-110' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{val}</button>
                                ))}
                            </div>
                         )}
                    </div>
                    <div className="flex-1 w-full h-full">
                         <MappingCanvas 
                           imageSrc={template.imageUrl}
                           groups={template.groups}
                           activeValue={activeValue}
                           activeGroupId={activeGroupId}
                           bubbleRadiusPct={template.bubbleRadius}
                           onAddBubble={handleAddBubble}
                           onUpdateBubble={handleUpdateBubble}
                           onDeleteBubble={handleDeleteBubble}
                           isGridMode={isGridMode}
                           onGridClick={handleGridClick}
                           gridPoints={gridPoints}
                         />
                    </div>
                  </main>
                </div>
                {/* ... (Keep Edit Modal) ... */}
                {editingGroup && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                            <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
                                <h3 className="font-bold text-slate-800">Edit Region</h3>
                                <button onClick={() => setEditingGroup(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Label</label>
                                    <input type="text" value={editingGroup.label} onChange={e => setEditingGroup({...editingGroup, label: e.target.value})} className="w-full border rounded p-2 text-slate-900"/>
                                </div>
                                {editingGroup.type === 'question' && (
                                    <>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Points</label>
                                            <input type="number" value={editingGroup.points} onChange={e => setEditingGroup({...editingGroup, points: Number(e.target.value)})} className="w-full border rounded p-2 text-slate-900"/>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Correct Answer(s)</label>
                                            <input type="text" value={editingGroup.correctAnswer?.join(',')} onChange={e => setEditingGroup({...editingGroup, correctAnswer: e.target.value.split(',').map(s=>s.trim())})} className="w-full border rounded p-2 text-slate-900" placeholder="1, 2"/>
                                        </div>
                                    </>
                                )}
                                <button onClick={saveGroupEdit} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg">Save Changes</button>
                            </div>
                        </div>
                    </div>
                )}
              </div>
            );
        }

        if (step === 'upload_filled' || step === 'grading') {
            return (
              <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-3xl w-full text-center space-y-8">
                   <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto text-indigo-600">
                    <FileText size={32} />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Grade Exam</h1>
                    <p className="text-gray-500">Upload filled OMR sheets matching your template.</p>
                  </div>

                  {!filledImage ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="block w-full cursor-pointer group h-full">
                            <div className="w-full h-40 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center group-hover:border-indigo-500 transition-colors bg-gray-50">
                                <FileText className="text-gray-300 group-hover:text-indigo-400 mb-2" />
                                <span className="text-gray-400 font-medium group-hover:text-indigo-500">Single Scan</span>
                            </div>
                            <input type="file" accept="image/*" onChange={handleFilledUpload} className="hidden" />
                        </label>

                        <label className="block w-full cursor-pointer group h-full">
                            <div className="w-full h-40 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center group-hover:border-blue-500 transition-colors bg-blue-50/50">
                                {isProcessing ? (
                                    <div className="flex flex-col items-center animate-pulse">
                                        <span className="text-blue-500 font-bold">Processing...</span>
                                    </div>
                                ) : (
                                    <>
                                        <Layers className="text-blue-300 group-hover:text-blue-400 mb-2" />
                                        <span className="text-blue-400 font-medium group-hover:text-blue-500">Batch (Multiple)</span>
                                    </>
                                )}
                            </div>
                            <input type="file" accept="image/*" multiple onChange={handleBatchUpload} className="hidden" ref={batchInputRef} disabled={isProcessing} />
                        </label>
                    </div>
                  ) : (
                     <div className="space-y-6">
                       <div className="relative h-64 bg-gray-100 rounded-lg overflow-hidden border">
                         <img src={filledImage} alt="Preview" className="w-full h-full object-contain" />
                       </div>
                       
                       <div className="flex gap-2 justify-center">
                           <button 
                             onClick={() => setIsAlignmentEditorOpen(true)}
                             className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium flex items-center gap-2"
                           >
                             <Crop size={18} /> Fix Alignment
                           </button>
                           <button 
                            onClick={runGrading}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-bold py-4 rounded-xl shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 transition-transform active:scale-95"
                           >
                             <Play fill="currentColor" /> RUN GRADING
                           </button>
                       </div>
                     </div>
                  )}
                  
                  <button onClick={() => setStep('mapping')} className="text-sm text-gray-400 hover:text-gray-600 underline">
                    Back to Template
                  </button>
                </div>
              </div>
            );
        }

        if (step === 'results' && result) {
            return (
              <div className="min-h-screen bg-slate-50 pb-20">
                <div className="bg-white shadow-sm border-b p-4 sticky top-0 z-30">
                  <div className="max-w-5xl mx-auto flex justify-between items-center">
                     <h1 className="font-bold text-xl text-slate-800">Exam Results</h1>
                     <button onClick={() => { setFilledImage(null); setResult(null); setStep('upload_filled'); }} className="text-sm text-blue-600 font-medium hover:underline">
                       Grade Next &rarr;
                     </button>
                  </div>
                </div>
                <ResultsView result={result} onReset={() => { setFilledImage(null); setResult(null); setStep('upload_filled'); }} />
              </div>
            );
        }

        if (step === 'batch_results') {
           return (
              <div className="min-h-screen bg-slate-50 pb-20 p-6">
                  <div className="max-w-6xl mx-auto space-y-6">
                      <div className="flex justify-between items-center">
                          <div>
                              <h1 className="text-2xl font-bold text-slate-800">Batch Results</h1>
                              <p className="text-slate-500">Graded {batchResults.length} files successfully.</p>
                          </div>
                          <div className="flex gap-2">
                              <button onClick={downloadBatchCSV} className="px-4 py-2 bg-white border hover:bg-slate-50 text-slate-700 rounded-lg flex items-center gap-2 font-medium"><Download size={18} /> Export CSV</button>
                              <button onClick={() => { setFilledImage(null); setResult(null); setBatchResults([]); setStep('upload_filled'); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 font-medium">Grade More <ArrowRight size={18} /></button>
                          </div>
                      </div>
                      
                      <div className="bg-white rounded-xl shadow overflow-hidden">
                          <table className="w-full text-left">
                              <thead>
                                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase border-b">
                                      <th className="p-4 font-semibold">ID / Identifier</th>
                                      <th className="p-4 font-semibold">Total Score</th>
                                      <th className="p-4 font-semibold">Correct</th>
                                      <th className="p-4 font-semibold">Incorrect</th>
                                      <th className="p-4 font-semibold">Unmarked</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y">
                                  {batchResults.map((res, idx) => {
                                      let displayId = res.fileName || `Scan #${idx+1}`;
                                      let isIdFound = false;
                                      let hasError = false;

                                      const idGroups = res.groups.filter(g => g.type === 'identity');
                                      if (idGroups.length > 0) {
                                           // Check for error: Not exactly one mark
                                           const errorGroup = idGroups.find(g => g.markedValues.length !== 1);
                                           if (errorGroup) {
                                               hasError = true;
                                               displayId = res.fileName || `Error #${idx+1}`;
                                           } else {
                                               const idVal = idGroups.map(g => g.markedValues.join('')).join('');
                                               if(idVal) { displayId = idVal; isIdFound = true; }
                                           }
                                      }
                                      const correctCount = res.groups.filter(g => g.type === 'question' && g.isCorrect).length;
                                      const incorrectCount = res.groups.filter(g => g.type === 'question' && g.isCorrect === false).length;
                                      const unmarkedCount = res.groups.filter(g => g.type === 'question' && g.markedValues.length === 0).length;

                                      return (
                                          <tr key={idx} className="hover:bg-slate-50/50">
                                              <td className="p-4">
                                                  <button onClick={() => { setActiveBatchResult(res); setStep('batch_detail'); }} className="text-left group flex items-center gap-2">
                                                      {hasError && <AlertTriangle size={16} className="text-red-500" />}
                                                      <div>
                                                          <div className={`font-mono font-medium group-hover:underline ${hasError ? 'text-red-600' : 'text-blue-600 group-hover:text-blue-800'}`}>{displayId}</div>
                                                          {!isIdFound && !hasError && res.fileName && <div className="text-xs text-slate-400">File: {res.fileName}</div>}
                                                          {hasError && <div className="text-xs text-red-400 font-semibold">ID Error: Invalid marking</div>}
                                                      </div>
                                                  </button>
                                              </td>
                                              <td className="p-4"><span className="font-bold text-slate-800">{res.totalScore}</span><span className="text-slate-400 text-sm"> / {res.maxScore}</span></td>
                                              <td className="p-4 text-green-600 font-medium">{correctCount}</td>
                                              <td className="p-4 text-red-500 font-medium">{incorrectCount}</td>
                                              <td className="p-4 text-slate-400 font-medium">{unmarkedCount > 0 ? <span className="text-orange-500 font-bold">{unmarkedCount}</span> : '-'}</td>
                                          </tr>
                                      );
                                  })}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
           );
        }

        if (step === 'batch_detail' && activeBatchResult) {
          return (
            <div className="min-h-screen bg-slate-50 pb-20">
                <div className="bg-white shadow-sm border-b p-4 sticky top-0 z-30">
                    <div className="max-w-5xl mx-auto flex items-center gap-4">
                        <button onClick={() => { setActiveBatchResult(null); setStep('batch_results'); }} className="flex items-center gap-1 text-slate-500 hover:text-slate-800 font-medium transition-colors"><ChevronLeft size={20} /> Back to Batch Results</button>
                        <div className="h-6 w-px bg-slate-200"></div>
                        <h1 className="font-bold text-lg text-slate-800">Detailed Result: <span className="text-blue-600">{activeBatchResult.fileName || 'Unknown File'}</span></h1>
                    </div>
                </div>
                <ResultsView result={activeBatchResult} onReset={() => { setActiveBatchResult(null); setStep('batch_results'); }} />
            </div>
          );
        }

        return <div>Unknown State</div>;
      })()}
    </>
  );
}
