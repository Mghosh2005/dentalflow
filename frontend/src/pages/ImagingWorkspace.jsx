import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api/client';
import {
  ZoomIn, ZoomOut, RotateCcw, Eye, EyeOff, Sliders, CheckCircle2,
  XCircle, AlertTriangle, ShieldCheck, ArrowRight, Activity, FileText,
  Calendar, Stethoscope, RefreshCw, Layers, ChevronDown, Check, Sparkles, Filter
} from 'lucide-react';

const CLASS_COLORS = {
  cavity: { bg: 'bg-rose-500/10', border: 'border-rose-500', text: 'text-rose-700', hex: '#ef4444' },
  periapical_lesion: { bg: 'bg-violet-500/10', border: 'border-violet-500', text: 'text-violet-700', hex: '#8b5cf6' },
  default: { bg: 'bg-amber-500/10', border: 'border-amber-500', text: 'text-amber-700', hex: '#f59e0b' }
};

export default function ImagingWorkspace({ initialFileId = null, onNavigate = null }) {
  const [queue, setQueue] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewMessage, setReviewMessage] = useState(null);

  // Viewer Controls State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [invert, setInvert] = useState(false);
  const [showOverlays, setShowOverlays] = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [selectedFindingId, setSelectedFindingId] = useState(null);

  // Clinician Review State
  const [reviewStatus, setReviewStatus] = useState('accepted_as_is');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [findingDecisions, setFindingDecisions] = useState({});
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [treatmentProcedure, setTreatmentProcedure] = useState('');
  const [treatmentNotes, setTreatmentNotes] = useState('');

  const viewerContainerRef = useRef(null);
  const imageRef = useRef(null);
  const [naturalDimensions, setNaturalDimensions] = useState({ width: 800, height: 600 });
  const [retryKey, setRetryKey] = useState(0);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Authenticated direct streaming URL with session token & cache-buster
  const imageUrl = selectedFile?.file_id
    ? `${api.getImagingFileUrl(selectedFile.file_id)}&_r=${retryKey}`
    : null;

  // Track image load lifecycle
  useEffect(() => {
    if (selectedFile?.file_id) {
      setImageLoading(true);
      setImageError(null);
      setImageLoaded(false);
    } else {
      setImageLoading(false);
      setImageError(null);
      setImageLoaded(false);
    }
  }, [selectedFile?.file_id, retryKey]);

  // 1. Fetch practice-wide imaging queue
  const loadQueue = useCallback(async (selectId = null) => {
    try {
      setLoading(true);
      const items = await api.getImagingQueue();
      setQueue(items || []);

      const targetId = selectId || initialFileId;
      if (items && items.length > 0) {
        const found = targetId ? items.find(i => i.file_id === targetId) : items[0];
        setSelectedFile(found || items[0]);
      } else {
        setSelectedFile(null);
      }
    } catch (err) {
      console.error('Failed to load imaging queue:', err);
    } finally {
      setLoading(false);
    }
  }, [initialFileId]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);



  // 2. Fetch analysis details when selected file changes
  useEffect(() => {
    if (!selectedFile) {
      setAnalysisData(null);
      return;
    }

    if (selectedFile.analysis_id) {
      api.getAnalysisDetails(selectedFile.analysis_id)
        .then((data) => {
          setAnalysisData(data);
          // Initialize finding decisions
          const initialDecisions = {};
          if (data.findings) {
            data.findings.forEach(f => {
              initialDecisions[f.id] = {
                decision: 'confirmed',
                confirmed_condition: f.condition_label,
                treatment_recommended: f.condition_label === 'cavity'
                  ? `Composite Restoration Tooth #${f.tooth_number_fdi || '16'}`
                  : `Endodontic Evaluation Tooth #${f.tooth_number_fdi || '19'}`
              };
            });
          }
          setFindingDecisions(initialDecisions);
          if (data.review) {
            setClinicalNotes(data.review.clinical_notes || '');
            setReviewStatus(data.review.review_status || 'accepted_as_is');
          }
        })
        .catch((err) => {
          console.error('Failed to load analysis details:', err);
        });
    } else {
      setAnalysisData(null);
    }

    // Reset view transforms
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedFindingId(null);
  }, [selectedFile]);

  // Trigger AI analysis on current file
  const handleTriggerAnalysis = async () => {
    if (!selectedFile) return;
    try {
      setAnalyzing(true);
      const res = await api.triggerAnalysisJob(selectedFile.file_id);
      // Poll after 1 second for result
      setTimeout(async () => {
        if (res.analysis_id) {
          const updated = await api.getAnalysisDetails(res.analysis_id);
          setAnalysisData(updated);
          loadQueue(selectedFile.file_id);
        }
        setAnalyzing(false);
      }, 1200);
    } catch (err) {
      alert(`Inference failed: ${err.message}`);
      setAnalyzing(false);
    }
  };

  // Submit Clinician Attestation
  const handleSubmitReview = async () => {
    if (!analysisData?.analysis?.id) return;
    try {
      setSubmittingReview(true);
      setReviewMessage(null);

      const decisionsArray = Object.keys(findingDecisions).map(fId => ({
        finding_id: parseInt(fId, 10),
        decision: findingDecisions[fId].decision,
        confirmed_condition: findingDecisions[fId].confirmed_condition,
        treatment_recommended: findingDecisions[fId].treatment_recommended
      }));

      await api.submitAnalysisReview(analysisData.analysis.id, {
        review_status: reviewStatus,
        clinical_notes: clinicalNotes,
        decisions: decisionsArray
      });

      setReviewMessage({ type: 'success', text: 'Clinician review and clinical attestation recorded successfully.' });
      loadQueue(selectedFile.file_id);
      const updated = await api.getAnalysisDetails(analysisData.analysis.id);
      setAnalysisData(updated);
    } catch (err) {
      setReviewMessage({ type: 'error', text: err.message });
    } finally {
      setSubmittingReview(false);
    }
  };

  // Promote to Treatment Plan
  const handlePromoteTreatment = async (e) => {
    e.preventDefault();
    if (!analysisData?.analysis?.id) return;
    try {
      const res = await api.promoteAnalysisToTreatment(analysisData.analysis.id, {
        plan_name: `Care Plan: ${treatmentProcedure || 'Targeted Dental Therapy'}`,
        procedure_name: treatmentProcedure,
        notes: treatmentNotes || `Promoted from attested radiograph review #${analysisData.analysis.id}.`,
        practitioner_id: 1
      });
      alert(`Treatment plan created successfully: ${res.plan_name}`);
      setShowPromoteModal(false);
      loadQueue(selectedFile.file_id);
    } catch (err) {
      alert(`Failed to promote: ${err.message}`);
    }
  };

  // Viewer Pan Handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // left click only
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setBrightness(100);
    setContrast(100);
    setInvert(false);
  };

  const onImageLoad = (e) => {
    const nw = e.target.naturalWidth;
    const nh = e.target.naturalHeight;
    if (nw && nh) {
      setNaturalDimensions({ width: nw, height: nh });
      setImageLoaded(true);
      setImageLoading(false);
      setImageError(null);
    }
  };

  const onImageError = () => {
    setImageError('Corrupted, truncated, or unsupported radiograph encoding.');
    setImageLoading(false);
    setImageLoaded(false);
  };

  // Filtered findings by confidence
  const displayedFindings = (analysisData?.findings || []).filter(
    f => f.confidence_score >= confidenceThreshold
  );

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] max-w-7xl mx-auto space-y-3 animate-fadeIn">
      {/* Top Bar: Queue Picker, Patient Bar & Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
            <Activity size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-base font-bold text-slate-900 leading-tight">
                Clinical Imaging Workspace
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
                Diagnostic Module
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Roboflow adr/6 inference • Clinician-in-the-loop attestation
            </p>
          </div>
        </div>

        {/* Practice Radiograph Queue Dropdown */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={selectedFile?.file_id || ''}
              onChange={(e) => {
                const target = queue.find(q => q.file_id === parseInt(e.target.value, 10));
                if (target) setSelectedFile(target);
              }}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl text-xs font-bold bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30 cursor-pointer min-w-[240px]"
            >
              {queue.map((item) => (
                <option key={item.file_id} value={item.file_id}>
                  {item.patient_name} — {item.modality} ({item.study_date}) {item.review_id ? '✓ Attested' : '⚠ Needs Review'}
                </option>
              ))}
              {queue.length === 0 && <option value="">No radiographs uploaded</option>}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          <button
            onClick={() => loadQueue(selectedFile?.file_id)}
            title="Refresh imaging queue"
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Main Grid: Viewer Canvas (Left) + Clinician Review Drawer (Right) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 overflow-hidden">
        {/* Left: Interactive Medical Viewer Canvas (8 Cols) */}
        <div className="lg:col-span-8 flex flex-col bg-[#0B0F17] rounded-2xl border border-slate-800 overflow-hidden relative shadow-lg">
          {/* Canvas Floating Toolbar */}
          <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            {/* Zoom / Pan tools */}
            <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1 shadow-md pointer-events-auto">
              <button
                onClick={() => setZoom(z => Math.min(z + 0.25, 4))}
                title="Zoom in"
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <ZoomIn size={15} />
              </button>
              <button
                onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))}
                title="Zoom out"
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <ZoomOut size={15} />
              </button>
              <button
                onClick={resetView}
                title="Reset view"
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <RotateCcw size={15} />
              </button>
              <span className="text-[10px] font-bold text-slate-400 px-2">
                {Math.round(zoom * 100)}%
              </span>
            </div>

            {/* Visual Adjustments Toolbar */}
            <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-md pointer-events-auto">
              {/* Invert toggle */}
              <button
                onClick={() => setInvert(v => !v)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                  invert ? 'bg-teal-500 text-slate-950' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title="Toggle film inversion (Darkroom windowing)"
              >
                Invert
              </button>

              {/* Overlay Toggle */}
              <button
                onClick={() => setShowOverlays(v => !v)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                  showOverlays ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Toggle AI bounding box overlays"
              >
                {showOverlays ? <Eye size={13} /> : <EyeOff size={13} />}
                Overlays
              </button>

              {/* Confidence Slider */}
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-700">
                <span className="text-[10px] text-slate-400 font-medium">Min Conf:</span>
                <input
                  type="range"
                  min="0.3"
                  max="0.95"
                  step="0.05"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                  className="w-16 h-1 bg-slate-700 rounded-lg accent-teal-500 cursor-pointer"
                />
                <span className="text-[10px] font-bold text-teal-400 w-7">
                  {Math.round(confidenceThreshold * 100)}%
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Image Display Area */}
          <div
            ref={viewerContainerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`flex-1 relative flex items-center justify-center overflow-hidden cursor-${
              isDragging ? 'grabbing' : 'grab'
            } select-none`}
            style={{ minHeight: '400px' }}
          >
            {/* Loading Indicator */}
            {imageLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-sm z-30">
                <div className="w-10 h-10 border-3 border-teal-500/20 border-t-teal-500 rounded-full animate-spin mb-3"></div>
                <p className="text-sm font-semibold text-slate-200">Loading diagnostic radiograph...</p>
                <p className="text-xs text-slate-400 mt-1">Fetching authenticated PACS imaging payload</p>
              </div>
            )}

            {/* Error Message Box */}
            {imageError && !imageLoading && (
              <div className="text-center p-6 max-w-md mx-auto bg-slate-900/90 border border-rose-500/30 rounded-2xl shadow-xl z-20">
                <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto mb-3 text-rose-400">
                  <AlertTriangle size={24} />
                </div>
                <h4 className="text-sm font-bold text-slate-200 mb-1">Radiograph Rendering Notice</h4>
                <p className="text-xs text-slate-400 mb-4">{imageError}</p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => setRetryKey(k => k + 1)}
                    className="px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw size={13} />
                    Retry Loading
                  </button>
                  <a
                    href={`/api/v1/imaging/files/${selectedFile?.file_id}?format=raw&token=${localStorage.getItem('dentalflow_token') || ''}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors"
                  >
                    Download Raw
                  </a>
                </div>
              </div>
            )}

            {/* Display Radiograph and Overlays */}
            {selectedFile && !imageError && imageUrl ? (
              <div
                className="relative transition-transform duration-75 origin-center inline-block"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  filter: `brightness(${brightness}%) contrast(${contrast}%) ${invert ? 'invert(100%)' : ''}`
                }}
              >
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt={selectedFile.original_filename}
                  onLoad={onImageLoad}
                  onError={onImageError}
                  className={`max-h-[65vh] max-w-[85vw] object-contain rounded-lg shadow-2xl pointer-events-none block transition-opacity duration-200 ${
                    imageLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                />

                {/* Overlays Rendering - STRICTLY ONLY when image has loaded with zero errors and showOverlays is true */}
                {imageLoaded && showOverlays && !imageError && (
                  <div className="absolute inset-0 pointer-events-none">
                    {displayedFindings.map((finding) => {
                      const renderedW = imageRef.current?.clientWidth || naturalDimensions.width;
                      const renderedH = imageRef.current?.clientHeight || naturalDimensions.height;
                      const natW = naturalDimensions.width || 800;
                      const natH = naturalDimensions.height || 600;
                      const scaleX = renderedW / natW;
                      const scaleY = renderedH / natH;

                      const boxLeft = Math.max(0, (finding.bbox_x - finding.bbox_width / 2) * scaleX);
                      const boxTop = Math.max(0, (finding.bbox_y - finding.bbox_height / 2) * scaleY);
                      const boxW = finding.bbox_width * scaleX;
                      const boxH = finding.bbox_height * scaleY;

                      const isSelected = selectedFindingId === finding.id;
                      const colorCfg = CLASS_COLORS[finding.condition_label] || CLASS_COLORS.default;

                      return (
                        <div
                          key={finding.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFindingId(finding.id);
                          }}
                          className={`absolute border-2 rounded pointer-events-auto cursor-pointer transition-all ${
                            isSelected ? 'ring-4 ring-white/80 scale-105 z-30' : 'hover:scale-102 z-10'
                          }`}
                          style={{
                            left: `${boxLeft}px`,
                            top: `${boxTop}px`,
                            width: `${boxW}px`,
                            height: `${boxH}px`,
                            borderColor: colorCfg.hex,
                            backgroundColor: `${colorCfg.hex}18`
                          }}
                        >
                          <div
                            className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-bold text-white whitespace-nowrap shadow-sm"
                            style={{ backgroundColor: colorCfg.hex }}
                          >
                            {finding.condition_label.replace('_', ' ')} ({Math.round(finding.confidence_score * 100)}%)
                            {finding.tooth_number_fdi && ` • #${finding.tooth_number_fdi}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : !selectedFile ? (
              <div className="text-center p-8 text-slate-500">
                <FileText size={36} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-semibold">No radiographic image selected.</p>
                <p className="text-xs">Upload an X-ray from the patient profile to review.</p>
              </div>
            ) : null}
          </div>

          {/* Viewer Bottom Governance & Provenance Footer */}
          <div className="bg-slate-950/90 border-t border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2 z-10">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 font-mono text-slate-300">
                <ShieldCheck size={13} className="text-teal-400" />
                SHA256: {selectedFile?.sha256_hash ? `${selectedFile.sha256_hash.slice(0, 12)}...` : 'N/A'}
              </span>
              <span>Modality: <strong className="text-white">{selectedFile?.modality || 'IO'}</strong></span>
              <span>Model: <strong className="text-teal-300">adr/6 (Roboflow)</strong></span>
            </div>
            <div className="text-amber-400/90 font-medium flex items-center gap-1">
              <AlertTriangle size={12} />
              Machine prediction only • Zero clinical confirmation until attested
            </div>
          </div>
        </div>

        {/* Right: Structured Findings & Clinician Review Drawer (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          {/* Patient Card Banner */}
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Patient Chart</p>
              <h3 className="font-display font-bold text-sm text-slate-900 leading-tight">
                {selectedFile?.patient_name || 'No Patient Selected'}
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                {selectedFile?.medical_record_number || 'MRN-Pending'}
              </p>
            </div>
            {selectedFile && (
              <div className="text-right">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  selectedFile.review_id
                    ? 'bg-teal-100 text-teal-800 border border-teal-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}>
                  {selectedFile.review_id ? 'Attested' : 'Pending Review'}
                </span>
                <p className="text-[10px] text-slate-400 mt-1">{selectedFile.study_date}</p>
              </div>
            )}
          </div>

          {/* Scrollable Findings & Decision Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* AI Analysis Status / Dispatch Trigger */}
            {!analysisData?.analysis ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
                <Sparkles size={24} className="mx-auto text-teal-600" />
                <h4 className="font-bold text-xs text-slate-800">AI Condition Analysis Ready</h4>
                <p className="text-[11px] text-slate-500">
                  Analyze for cavities and periapical lesions using Roboflow adr/6 vision engine.
                </p>
                <button
                  onClick={handleTriggerAnalysis}
                  disabled={analyzing}
                  className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
                >
                  {analyzing ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {analyzing ? 'Processing Radiograph...' : 'Execute AI Detection'}
                </button>
              </div>
            ) : (
              <>
                {/* Candidate Findings List */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers size={13} className="text-teal-600" />
                      Potential Findings ({displayedFindings.length})
                    </h4>
                    <span className="text-[10px] text-slate-400">Status: Potential</span>
                  </div>

                  <div className="space-y-2">
                    {displayedFindings.map((finding) => {
                      const isSelected = selectedFindingId === finding.id;
                      const decision = findingDecisions[finding.id]?.decision || 'confirmed';
                      const colorCfg = CLASS_COLORS[finding.condition_label] || CLASS_COLORS.default;

                      return (
                        <div
                          key={finding.id}
                          onClick={() => setSelectedFindingId(finding.id)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-teal-50/70 border-teal-500 shadow-xs'
                              : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/60'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold capitalize ${colorCfg.bg} ${colorCfg.text}`}>
                              {finding.condition_label.replace('_', ' ')}
                            </span>
                            <span className="text-[11px] font-bold text-slate-600">
                              {Math.round(finding.confidence_score * 100)}% Conf
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-600 space-y-1">
                            <p>Tooth: <strong className="text-slate-800">FDI #{finding.tooth_number_fdi || 'Unassigned'}</strong></p>
                            <p className="truncate text-slate-500 text-[10px]">
                              Bounding Box: [{finding.bbox_x}, {finding.bbox_y}, {finding.bbox_width}x{finding.bbox_height}]
                            </p>
                          </div>

                          {/* Decision Buttons */}
                          <div className="mt-2 pt-2 border-t border-slate-200/80 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                setFindingDecisions(prev => ({
                                  ...prev,
                                  [finding.id]: { ...prev[finding.id], decision: 'confirmed' }
                                }));
                              }}
                              className={`flex-1 py-1 px-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                decision === 'confirmed'
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFindingDecisions(prev => ({
                                  ...prev,
                                  [finding.id]: { ...prev[finding.id], decision: 'adjusted' }
                                }));
                              }}
                              className={`flex-1 py-1 px-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                decision === 'adjusted'
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              Adjust
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFindingDecisions(prev => ({
                                  ...prev,
                                  [finding.id]: { ...prev[finding.id], decision: 'rejected' }
                                }));
                              }}
                              className={`flex-1 py-1 px-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                decision === 'rejected'
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              False Pos
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {displayedFindings.length === 0 && (
                      <p className="text-xs text-slate-400 italic p-3 text-center bg-slate-50 rounded-xl">
                        No findings detected above {Math.round(confidenceThreshold * 100)}% confidence.
                      </p>
                    )}
                  </div>
                </div>

                {/* Clinician Review & Attestation Form */}
                <div className="pt-2 border-t border-slate-200 space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Stethoscope size={13} className="text-teal-600" />
                    Clinician Attestation
                  </h4>

                  {/* Overall Review Status */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Attestation Conclusion:
                    </label>
                    <select
                      value={reviewStatus}
                      onChange={(e) => setReviewStatus(e.target.value)}
                      className="w-full p-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                    >
                      <option value="accepted_as_is">Accepted as is (Findings Confirmed)</option>
                      <option value="accepted_with_edits">Accepted with Edits / Adjustments</option>
                      <option value="rejected_false_positive">Rejected (All False Positives)</option>
                    </select>
                  </div>

                  {/* Clinical Notes Field */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Clinical Impression & Radiographic Notes:
                    </label>
                    <textarea
                      rows={2}
                      value={clinicalNotes}
                      onChange={(e) => setClinicalNotes(e.target.value)}
                      placeholder="e.g. Incipient radiolucency on disto-occlusal surface of tooth #16..."
                      className="w-full p-2 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30 font-medium"
                    />
                  </div>

                  {reviewMessage && (
                    <div className={`p-2.5 rounded-xl text-xs font-medium ${
                      reviewMessage.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      {reviewMessage.text}
                    </div>
                  )}

                  {/* Submit Review Button */}
                  <button
                    onClick={handleSubmitReview}
                    disabled={submittingReview}
                    className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
                  >
                    {submittingReview ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} className="text-teal-400" />}
                    {submittingReview ? 'Recording Attestation...' : 'Sign & Record Attestation'}
                  </button>

                  {/* 1-Click Promote to Treatment Plan Button (Enabled only if attested!) */}
                  <button
                    onClick={() => {
                      // Prepopulate treatment procedure from first confirmed finding
                      const confirmed = Object.values(findingDecisions).find(d => d.decision === 'confirmed' || d.decision === 'adjusted');
                      setTreatmentProcedure(confirmed?.treatment_recommended || 'Direct Composite Restoration');
                      setShowPromoteModal(true);
                    }}
                    disabled={!analysisData.review}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      analysisData.review
                        ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-600/20 active:scale-95'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <ArrowRight size={14} />
                    Promote Confirmed to Treatment Plan
                  </button>
                  {!analysisData.review && (
                    <p className="text-[10px] text-slate-400 text-center">
                      * Attestation required before promoting findings into treatment plans.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: 1-Click Promote Confirmed Findings to Treatment Plan */}
      {showPromoteModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-slate-900 leading-tight">
                  Promote to Treatment Plan
                </h3>
                <p className="text-xs text-slate-500">
                  Patient: {selectedFile?.patient_name} ({selectedFile?.medical_record_number})
                </p>
              </div>
            </div>

            <form onSubmit={handlePromoteTreatment} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Recommended Procedure:</label>
                <input
                  type="text"
                  required
                  value={treatmentProcedure}
                  onChange={(e) => setTreatmentProcedure(e.target.value)}
                  placeholder="e.g. Composite Resin - 2 Surfaces, Posterior"
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Clinical Plan Notes:</label>
                <textarea
                  rows={3}
                  value={treatmentNotes}
                  onChange={(e) => setTreatmentNotes(e.target.value)}
                  placeholder="Notes regarding tooth condition and planned clinical procedure..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                />
              </div>

              <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200 text-teal-900 text-[11px] leading-relaxed">
                <strong>Clinical Governance Verification:</strong>
                <p>This action permanently commits confirmed radiograph findings to the active care plan with clinician provenance.</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPromoteModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20"
                >
                  Confirm & Commit Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
