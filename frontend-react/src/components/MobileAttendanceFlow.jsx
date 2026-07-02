import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import AppIcon from './AppIcon.jsx';

// Configure your office GPS coordinates here
const OFFICE_LAT = 14.5995;
const OFFICE_LNG = 120.9842;
const OFFICE_NAME = 'Main Office Campus';
const ADVISORY_DISTANCE_M = 100;

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clockDisplay(now) {
  return now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function weekdayDisplay(now) {
  return now.toLocaleDateString('en-PH', { weekday: 'long' });
}

function dateDisplay(now) {
  return now.toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(value) {
  if (!value) return '--:--';
  const d = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const officeIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#0a66d9;border:3px solid #fff;box-shadow:0 0 0 2px #0a66d9;"></div>',
  iconAnchor: [7, 7],
});

const userIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:3px solid #fff;box-shadow:0 0 0 2px #22c55e;"></div>',
  iconAnchor: [7, 7],
});

function LeafletMap({ userLocation, officeLat, officeLng }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    L.marker([officeLat, officeLng], { icon: officeIcon }).addTo(map).bindPopup('Office');

    if (userLocation) {
      L.marker([userLocation.lat, userLocation.lng], { icon: userIcon }).addTo(map).bindPopup('You');
      map.fitBounds([[officeLat, officeLng], [userLocation.lat, userLocation.lng]], { padding: [30, 30], maxZoom: 17 });
    } else {
      map.setView([officeLat, officeLng], 16);
    }

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); mapRef.current = null; };
  }, [userLocation, officeLat, officeLng]);

  return <div ref={containerRef} className="mat-map-svg" />;
}

export default function MobileAttendanceFlow({ open, onClose, employee, todayState, onSubmit, busy }) {
  const [step, setStep] = useState('recording');
  const [pendingAction, setPendingAction] = useState(null);
  const [now, setNow] = useState(() => new Date());

  // Location state
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [distance, setDistance] = useState(null);
  const [userLocation, setUserLocation] = useState(null);

  // Face state
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [cameraError, setCameraError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (open) {
      setStep('recording');
      setPendingAction(null);
      setLocationError('');
      setDistance(null);
      setUserLocation(null);
      setCapturedPhoto(null);
      setCameraError('');
    }
  }, [open]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setCameraError('Camera access denied. Please allow camera permission.');
    }
  }, []);

  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    setLocationError('');
    setDistance(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = haversine(pos.coords.latitude, pos.coords.longitude, OFFICE_LAT, OFFICE_LNG);
        setDistance(dist);
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocationError(err.message || 'Unable to get location. You may proceed.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }, []);

  useEffect(() => {
    if (!open || step !== 'location') return;
    detectLocation();
  }, [open, step, detectLocation]);

  useEffect(() => {
    if (!open || step !== 'face') return;
    startCamera();
    return () => stopCamera();
  }, [open, step, startCamera, stopCamera]);

  useEffect(() => {
    if (!open) stopCamera();
  }, [open, stopCamera]);

  function selectAction(type) {
    setPendingAction(type);
    setStep('location');
  }

  function goBack() {
    stopCamera();
    if (step === 'location') setStep('recording');
    else if (step === 'face') { setCapturedPhoto(null); setStep('location'); }
  }

  function confirmLocation() {
    stopCamera();
    setCapturedPhoto(null);
    setStep('face');
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    canvas.getContext('2d').drawImage(video, 0, 0);
    setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.85));
    stopCamera();
  }

  function retake() {
    setCapturedPhoto(null);
    startCamera();
  }

  async function saveRecord() {
    if (!pendingAction) return;
    await onSubmit(
      pendingAction,
      {
        latitude: userLocation?.lat ?? null,
        longitude: userLocation?.lng ?? null,
        distance_m: distance !== null ? Math.round(distance) : null,
      },
      capturedPhoto
    );
    onClose();
  }

  const withinRange = distance !== null && distance <= ADVISORY_DISTANCE_M;

  const hasTimeIn = Boolean(todayState?.hasTimeIn);
  const hasBreakOut = Boolean(todayState?.hasBreakOut);
  const hasBreakIn = Boolean(todayState?.hasBreakIn);
  const hasTimeOut = Boolean(todayState?.hasTimeOut);

  const actions = [
    { key: 'time_in',   label: 'Time In',   disabled: hasTimeIn },
    { key: 'break_out', label: 'Break Out',  disabled: !hasTimeIn || hasBreakOut || hasTimeOut },
    { key: 'break_in',  label: 'Break In',   disabled: !hasBreakOut || hasBreakIn || hasTimeOut },
    { key: 'time_out',  label: 'Time Out',   disabled: !hasTimeIn || (hasBreakOut && !hasBreakIn) || hasTimeOut },
  ];

  const actionLabel = { time_in: 'Time In', break_out: 'Break Out', break_in: 'Break In', time_out: 'Time Out' }[pendingAction] || '';

  if (!open) return null;

  return (
    <div className="mat-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`mat-sheet${step === 'face' ? ' mat-sheet--face' : ''}`}>

        {/* Header */}
        <div className="mat-header">
          {step !== 'recording' ? (
            <button className="mat-nav-btn" onClick={goBack} type="button" aria-label="Back">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
          ) : <span className="mat-nav-btn" />}
          <h2 className="mat-title">
            {step === 'recording' ? 'Time Recording' : step === 'location' ? 'Location Point' : 'Take Selfie'}
          </h2>
          <button className="mat-nav-btn" onClick={onClose} type="button" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Step dots */}
        <div className="mat-step-dots">
          {['recording', 'location', 'face'].map((s) => (
            <div key={s} className={`mat-dot${step === s ? ' mat-dot--active' : ''}`} />
          ))}
        </div>

        {/* ── Step 1: Time Recording ── */}
        {step === 'recording' && (
          <div className="mat-content">
            <div className="mat-clock-card">
              <div className="mat-clock-day">{weekdayDisplay(now)}</div>
              <div className="mat-clock-time">{clockDisplay(now)}</div>
              <div className="mat-clock-date">{dateDisplay(now)}</div>
            </div>

            <div className="mat-emp-row">
              <div className="mat-emp-avatar">
                {String(employee?.first_name || employee?.full_name || 'E')[0].toUpperCase()}
              </div>
              <div className="mat-emp-info">
                <strong>{employee?.full_name || employee?.first_name || 'Employee'}</strong>
                <span>{[employee?.position, employee?.department].filter(Boolean).join(' — ')}</span>
              </div>
            </div>

            <div className="mat-records-card">
              <div className="mat-rec-label">Today</div>
              {employee?.shift_name && (
                <div className="mat-shift-badge">Shift: {employee.shift_name}</div>
              )}

              <div className="mat-time-entries">
                <div className="mat-te-item">
                  <span className="mat-te-dot mat-te-dot--in" />
                  <span className="mat-te-val">{fmtTime(todayState?.timeIn)}</span>
                  <span className="mat-te-lbl">In</span>
                </div>
                <span className="mat-te-sep">·</span>
                <div className="mat-te-item">
                  <span className="mat-te-dot mat-te-dot--out" />
                  <span className="mat-te-val">{fmtTime(todayState?.timeOut)}</span>
                  <span className="mat-te-lbl">Out</span>
                </div>
              </div>

              <div className="mat-break-row">
                <span className="mat-break-title">Break Time</span>
                <div className="mat-time-entries mat-time-entries--sm">
                  <div className="mat-te-item">
                    <span className="mat-te-dot mat-te-dot--brk" />
                    <span className="mat-te-val">{fmtTime(todayState?.breakOut)}</span>
                    <span className="mat-te-lbl">Break Out</span>
                  </div>
                  <span className="mat-te-sep">·</span>
                  <div className="mat-te-item">
                    <span className="mat-te-dot mat-te-dot--brk" />
                    <span className="mat-te-val">{fmtTime(todayState?.breakIn)}</span>
                    <span className="mat-te-lbl">Break In</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mat-actions">
              {actions.map((a) => (
                <button
                  key={a.key}
                  className={`mat-action${a.disabled ? ' mat-action--done' : ' mat-action--ready'}`}
                  disabled={a.disabled || busy}
                  onClick={() => selectAction(a.key)}
                  type="button"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 2: Location ── */}
        {step === 'location' && (
          <div className="mat-content mat-content--loc">
            <div className="mat-map-wrap">
              <LeafletMap userLocation={userLocation} officeLat={OFFICE_LAT} officeLng={OFFICE_LNG} />
            </div>

            <div className="mat-loc-card">
              <h3 className="mat-loc-heading">Location Point</h3>

              {locating && (
                <div className="mat-loc-row">
                  <span className="mat-spinner" />
                  <span>Detecting your location…</span>
                </div>
              )}

              {locationError && (
                <div className="mat-loc-warn"><AppIcon name="alert" size={15} /> {locationError}</div>
              )}

              {distance !== null && (
                <div className={`mat-loc-dist${withinRange ? ' mat-loc-dist--ok' : ' mat-loc-dist--far'}`}>
                  <span>{withinRange ? <AppIcon name="check" size={14} /> : '!'}</span>
                  <span>{Math.round(distance)}m from office {withinRange ? '— within range' : `— over ${ADVISORY_DISTANCE_M}m limit`}</span>
                </div>
              )}

              <p className="mat-loc-hint">
                Please confirm your location is within <strong>{ADVISORY_DISTANCE_M}m</strong> of {OFFICE_NAME}.
              </p>

              <div className="mat-loc-actions">
                <button className="mat-loc-refresh" onClick={detectLocation} type="button" disabled={locating} aria-label="Refresh location">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
                    <circle cx="12" cy="12" r="9" strokeDasharray="4 4" />
                  </svg>
                </button>
                <button
                  className="mat-btn-primary"
                  disabled={locating}
                  onClick={confirmLocation}
                  type="button"
                >
                  {locating ? 'Detecting…' : 'Confirm Your Location'}
                </button>
              </div>

              {actionLabel && (
                <div className="mat-action-hint">Recording: <strong>{actionLabel}</strong></div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3: Selfie ── */}
        {step === 'face' && (
          <div className="mat-face-wrap">
            <div className="mat-cam-view">
              {!capturedPhoto ? (
                <>
                  <video ref={videoRef} className="mat-cam-video" autoPlay playsInline muted />
                  {cameraError && <div className="mat-cam-error">{cameraError}</div>}
                </>
              ) : (
                <>
                  <img src={capturedPhoto} className="mat-cam-photo" alt="Captured selfie" />
                  <div className="mat-cam-badge"><AppIcon name="check" size={13} /> Photo captured</div>
                </>
              )}
              <canvas ref={canvasRef} className="mat-cap-canvas" />
            </div>

            <div className="mat-face-card">
              {!capturedPhoto && !cameraError && (
                <button
                  className="mat-capture-btn"
                  onClick={capturePhoto}
                  type="button"
                  disabled={!cameraActive}
                >
                  <span className="mat-capture-ring" />
                  Capture Photo
                </button>
              )}

              {cameraError && !capturedPhoto && (
                <button className="mat-btn-primary" onClick={retake} type="button">
                  Retry Camera
                </button>
              )}

              {capturedPhoto && (
                <div className="mat-face-actions">
                  <button className="mat-btn-secondary" onClick={retake} type="button">
                    Retake Photo
                  </button>
                  <button className="mat-btn-primary mat-btn-save" onClick={saveRecord} type="button" disabled={busy}>
                    {busy ? 'Saving…' : 'Save Record'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
