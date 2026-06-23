import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { api } from '../api/client';

// ── Configure your office location here ──────────────────
const DEFAULT_OFFICE = {
  latitude: 14.561365459812485,
  longitude: 121.01426138666103,
  radius_m: 250,
  name: 'Philippine AXA Life Centre, Makati',
};
const TARGET_GPS_ACCURACY_M = 60;
// ─────────────────────────────────────────────────────────

const { width: SW, height: SH } = Dimensions.get('window');

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clockStr(d) {
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function weekdayStr(d) {
  return d.toLocaleDateString('en-PH', { weekday: 'long' });
}
function dateStr(d) {
  return d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(value) {
  if (!value) return '--:--';
  const str = String(value).replace(' ', 'T');
  const d = new Date(str.includes('+') || str.includes('Z') ? str : str + '+08:00');
  return Number.isNaN(d.getTime())
    ? '--:--'
    : d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ── Location visual display (no native map needed) ───────
function LocationVisual({ coords, distance, locationAccuracy, office }) {
  const width = SW;
  const cx = width / 2;
  const cy = 110;
  const height = 220;

  let userX = cx;
  let userY = cy;

  if (coords) {
    const avgLat = (coords.latitude + office.latitude) / 2;
    const metersPerDegLng = 111320 * Math.cos((avgLat * Math.PI) / 180);
    const dx = (coords.longitude - office.longitude) * metersPerDegLng;
    const dy = (office.latitude - coords.latitude) * 110540;
    const extent = Math.max(office.radius_m, distance || 0, locationAccuracy || 0, 80);
    const scale = Math.min((width * 0.30) / extent, (height * 0.30) / extent);
    userX = clamp(cx + dx * scale, 28, width - 28);
    userY = clamp(cy + dy * scale, 28, height - 28);
  }

  const withinRadius = distance !== null && distance <= office.radius_m;
  const hasUser = Boolean(coords);

  return (
    <View style={lv.wrap}>
      {/* Grid lines */}
      {[0.22, 0.44, 0.66, 0.88].map((t) => (
        <View key={`h${t}`} style={[lv.gridLine, lv.gridH, { top: height * t }]} />
      ))}
      {[0.2, 0.4, 0.6, 0.8].map((t) => (
        <View key={`v${t}`} style={[lv.gridLine, lv.gridV, { left: width * t }]} />
      ))}

      {/* Office radius rings */}
      <View style={[lv.ring, lv.ring3, { left: cx - 90, top: cy - 90 }]} />
      <View style={[lv.ring, lv.ring2, { left: cx - 60, top: cy - 60 }]} />
      <View style={[lv.ring, lv.ring1, { left: cx - 34, top: cy - 34 }]} />

      {/* Dashed line from office to user */}
      {hasUser && userX !== cx && (
        <View style={[lv.dashedLine, {
          left: Math.min(cx, userX),
          top: Math.min(cy, userY),
          width: Math.max(2, Math.abs(userX - cx)),
          height: Math.max(2, Math.abs(userY - cy)),
          borderRightWidth: userX >= cx ? 2 : 0,
          borderLeftWidth: userX < cx ? 2 : 0,
          borderBottomWidth: userY >= cy ? 2 : 0,
          borderTopWidth: userY < cy ? 2 : 0,
        }]} />
      )}

      {/* User dot */}
      {hasUser && (
        <>
          <View style={[lv.userRing, { left: userX - 18, top: userY - 18,
            borderColor: withinRadius ? 'rgba(22,163,74,0.35)' : 'rgba(234,88,12,0.35)',
          }]} />
          <View style={[lv.userDot, { left: userX - 9, top: userY - 9,
            backgroundColor: withinRadius ? '#16a34a' : '#ea580c',
          }]} />
          <View style={[lv.label, lv.userLabel, { left: clamp(userX - 18, 8, width - 60), top: userY - 36 }]}>
            <Text style={lv.labelText}>You</Text>
          </View>
        </>
      )}

      {/* Office dot */}
      <View style={[lv.officeDot, { left: cx - 9, top: cy - 9 }]} />
      <View style={[lv.label, lv.officeLabel, { left: clamp(cx - 36, 8, width - 100), top: cy + 14 }]}>
        <Text style={lv.labelText} numberOfLines={1}>{office.name}</Text>
      </View>

      {/* GPS badge */}
      <View style={lv.badge}>
        <Text style={lv.badgeText}>
          {hasUser
            ? `GPS${locationAccuracy ? ` ±${Math.round(locationAccuracy)}m` : ''}`
            : 'Locating…'}
        </Text>
      </View>
    </View>
  );
}

const lv = StyleSheet.create({
  wrap: { height: 220, backgroundColor: '#e8eef5', overflow: 'hidden' },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.7)' },
  gridH: { left: 0, right: 0, height: 1 },
  gridV: { top: 0, bottom: 0, width: 1 },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1.5 },
  ring1: { width: 68,  height: 68,  borderColor: 'rgba(10,102,217,0.55)', backgroundColor: 'rgba(10,102,217,0.10)' },
  ring2: { width: 120, height: 120, borderColor: 'rgba(10,102,217,0.25)', backgroundColor: 'transparent' },
  ring3: { width: 180, height: 180, borderColor: 'rgba(10,102,217,0.12)', backgroundColor: 'transparent' },
  dashedLine: { position: 'absolute', borderStyle: 'dashed', borderColor: 'rgba(15,23,42,0.30)' },
  officeDot: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: '#0a66d9', borderWidth: 3, borderColor: '#fff', elevation: 3 },
  userRing: { position: 'absolute', width: 36, height: 36, borderRadius: 18, borderWidth: 1.5 },
  userDot: { position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: '#fff', elevation: 3 },
  label: { position: 'absolute', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  officeLabel: { backgroundColor: 'rgba(10,102,217,0.88)', maxWidth: 130 },
  userLabel: { backgroundColor: 'rgba(15,23,42,0.75)' },
  labelText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  badge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(15,23,42,0.65)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});

// ── Selfie capture for attendance ────────────────────────
function SelfieCapture({ capturedPhoto, onPhotoCaptured, onRetake, onSave, busy, onBack, onClose }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraMode, setCameraMode] = useState('front');
  const [cameraFacing, setCameraFacing] = useState('front');
  const cameraRef = useRef(null);
  const frontPhoto = capturedPhoto?.front || null;
  const backPhoto = capturedPhoto?.back || null;
  const isComplete = Boolean(frontPhoto || backPhoto);
  const activePhoto = frontPhoto || backPhoto;

  function changeCameraMode(mode) {
    if (busy) return;
    setCameraMode(mode);
    setCameraFacing(mode === 'back' ? 'back' : 'front');
    onRetake();
  }

  async function handleCapture() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        base64: true,
        skipProcessing: true,
      });
      onPhotoCaptured({
        mode: cameraMode,
        front: cameraMode === 'front' ? photo : null,
        back: cameraMode === 'back' ? photo : null,
      });
    } catch (_) {}
  }

  if (!permission) {
    return (
      <View style={sc.container}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={sc.permContainer}>
        <Text style={sc.permText}>Camera access is needed to take your attendance selfie.</Text>
        <TouchableOpacity style={sc.permBtn} onPress={requestPermission}>
          <Text style={sc.permBtnText}>Grant Camera Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isComplete && activePhoto) {
    // Use embedded base64 data so the preview works reliably on Android emulator.
    const previewSrc = activePhoto.base64
      ? { uri: `data:image/jpeg;base64,${activePhoto.base64}` }
      : { uri: activePhoto.uri };
    return (
      <View style={sc.container}>
        <Image
          source={previewSrc}
          style={sc.preview}
          resizeMode="cover"
        />
        <View style={sc.previewBadge}>
          <Text style={sc.previewBadgeText}>📷 Photo captured</Text>
        </View>
        <View style={sc.topActions}>
          <TouchableOpacity style={sc.topActionBtn} onPress={onRetake} disabled={busy} accessibilityLabel="Retake photo">
            <Text style={sc.topActionText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={sc.topActionBtn} onPress={onClose} disabled={busy} accessibilityLabel="Close">
            <Text style={sc.topActionText}>×</Text>
          </TouchableOpacity>
        </View>
        <View style={sc.previewActions}>
          <TouchableOpacity style={sc.retakeBtn} onPress={onRetake} disabled={busy}>
            <Text style={sc.retakeBtnText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[sc.saveBtn, busy && { opacity: 0.6 }]} onPress={onSave} disabled={busy}>
            {busy
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={sc.saveBtnText}>Save Record</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={sc.container}>
      <CameraView ref={cameraRef} style={sc.camera} facing={cameraFacing} />
      <View style={sc.topActions}>
        <TouchableOpacity style={sc.topActionBtn} onPress={onBack} disabled={busy} accessibilityLabel="Go back">
          <Text style={sc.topActionText}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sc.topActionBtn} onPress={onClose} disabled={busy} accessibilityLabel="Close">
          <Text style={sc.topActionText}>×</Text>
        </TouchableOpacity>
      </View>
      <View style={sc.modeRow}>
        {[
          { key: 'front', label: 'Front' },
          { key: 'back', label: 'Back' },
        ].map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[sc.modeBtn, cameraMode === item.key && sc.modeBtnActive]}
            onPress={() => changeCameraMode(item.key)}
            disabled={busy}
          >
            <Text style={[sc.modeBtnText, cameraMode === item.key && sc.modeBtnTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={sc.hintWrap}>
        <Text style={sc.hintText}>
          {cameraMode === 'front' ? 'Position yourself in frame' : 'Capture the surroundings'}
        </Text>
      </View>
      <View style={sc.captureRow}>
        <TouchableOpacity style={sc.captureBtn} onPress={handleCapture}>
          <View style={sc.captureOuter}>
            <View style={sc.captureInner} />
          </View>
          <Text style={sc.captureLabel}>Capture Photo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const sc = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220' },
  permContainer: { flex: 1, backgroundColor: '#0b1220', padding: 32, justifyContent: 'center', alignItems: 'center' },
  permText: { color: '#fff', fontSize: 15, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  permBtn: { backgroundColor: '#0a66d9', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  camera: { ...StyleSheet.absoluteFillObject },
  topActions: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    zIndex: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topActionBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(15,23,42,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topActionText: { color: '#fff', fontSize: 26, fontWeight: '700', lineHeight: 28 },
  modeRow: {
    position: 'absolute',
    top: 68,
    left: 16,
    right: 16,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(15,23,42,0.58)',
    borderRadius: 12,
    padding: 6,
  },
  modeBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  modeBtnActive: { backgroundColor: '#fff' },
  modeBtnText: { color: '#dbeafe', fontSize: 12, fontWeight: '700' },
  modeBtnTextActive: { color: '#0f172a' },
  hintWrap: { position: 'absolute', bottom: 120, left: 0, right: 0, alignItems: 'center' },
  hintText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  captureRow: { position: 'absolute', bottom: 36, left: 0, right: 0, alignItems: 'center' },
  captureBtn: { alignItems: 'center' },
  captureOuter: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  captureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  captureLabel: { color: '#fff', fontSize: 13, fontWeight: '600', marginTop: 8 },
  preview: { ...StyleSheet.absoluteFillObject, width: SW, height: SH },
  previewBadge: {
    position: 'absolute', top: 68, left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  previewBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  previewActions: {
    position: 'absolute', bottom: 36, left: 16, right: 16,
    flexDirection: 'row', gap: 12,
  },
  retakeBtn: {
    flex: 1, padding: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center',
  },
  retakeBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  saveBtn: { flex: 2, padding: 14, borderRadius: 14, backgroundColor: '#0a66d9', alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

// ── Main component ────────────────────────────────────────
export default function AttendanceFlow({ visible, onClose, employee, todayState, onSubmit, busy, initialAction }) {
  const [step, setStep] = useState('recording'); // 'recording' | 'location' | 'face'
  const [pendingAction, setPendingAction] = useState(null);
  const [now, setNow] = useState(() => new Date());

  // Location
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [distance, setDistance] = useState(null);
  const [coords, setCoords] = useState(null);
  const [locationAccuracy, setLocationAccuracy] = useState(null);
  const [office, setOffice] = useState(DEFAULT_OFFICE);

  const bestLocationRef = useRef(null);

  // Selfie
  const [capturedPhoto, setCapturedPhoto] = useState(null);

  const updateLocationState = useCallback((position, { preferAccurate = true } = {}) => {
    if (!position?.coords) return false;
    const { latitude, longitude, accuracy } = position.coords;
    const nextAccuracy = Number.isFinite(Number(accuracy)) ? Number(accuracy) : null;
    const currentAccuracy = Number(bestLocationRef.current?.accuracy);

    if (
      preferAccurate &&
      bestLocationRef.current &&
      Number.isFinite(currentAccuracy) &&
      Number.isFinite(nextAccuracy) &&
      nextAccuracy > currentAccuracy + 15
    ) {
      return false;
    }

    bestLocationRef.current = { latitude, longitude, accuracy: nextAccuracy };
    setCoords({ latitude, longitude });
    setLocationAccuracy(nextAccuracy);
    setDistance(haversine(latitude, longitude, office.latitude, office.longitude));
    return true;
  }, [office.latitude, office.longitude]);

  // Clock ticker
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [visible]);

  // Reset on open; if a specific action is pre-selected, jump straight to Location
  useEffect(() => {
    if (visible) {
      setLocationError('');
      setDistance(null);
      setCoords(null);
      setLocationAccuracy(null);
      bestLocationRef.current = null;
      setCapturedPhoto(null);
      if (initialAction) {
        setPendingAction(initialAction);
        setStep('location');
      } else {
        setPendingAction(null);
        setStep('recording');
      }
    }
  }, [visible, initialAction]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    (async () => {
      try {
        const { data } = await api.get('/attendance/location-config');
        const nextOffice = data?.office || {};
        const latitude = Number(nextOffice.latitude);
        const longitude = Number(nextOffice.longitude);
        const radiusM = Number(nextOffice.radius_m);
        if (!cancelled && Number.isFinite(latitude) && Number.isFinite(longitude)) {
          setOffice({
            latitude,
            longitude,
            radius_m: Number.isFinite(radiusM) && radiusM > 0 ? radiusM : DEFAULT_OFFICE.radius_m,
            name: String(nextOffice.name || DEFAULT_OFFICE.name),
          });
        }
      } catch (_) {}
    })();

    return () => { cancelled = true; };
  }, [visible]);

  useEffect(() => {
    if (!coords) return;
    setDistance(haversine(coords.latitude, coords.longitude, office.latitude, office.longitude));
  }, [coords, office.latitude, office.longitude]);

  const detectLocation = useCallback(async () => {
    setLocating(true);
    setLocationError('');

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission was not granted. Turn on precise location to continue.');
        setLocating(false);
        return;
      }

      try {
        await Location.enableNetworkProviderAsync();
      } catch (_) {}

      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 60000,
        requiredAccuracy: 2000,
      });
      const usedCachedLocation = updateLocationState(lastKnown, { preferAccurate: false });
      if (usedCachedLocation) {
        setLocating(false);
      }

      const currentPosition = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
          mayShowUserSettingsDialog: true,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
      ]);

      if (updateLocationState(currentPosition)) {
        const nextAccuracy = Number(currentPosition?.coords?.accuracy);
        if (nextAccuracy && nextAccuracy > TARGET_GPS_ACCURACY_M) {
          setLocationError(`GPS accuracy is about +/- ${Math.round(nextAccuracy)}m. The map will keep updating live.`);
        }
        setLocating(false);
        return;
      }
    } catch (_) {
      // Fall through to the unavailable state.
    }

    setLocationError('Location is still updating. Turn on Location/GPS and try Refresh if it does not move.');
    setLocating(false);
  }, [updateLocationState]);

  useEffect(() => {
    if (visible && step === 'location') detectLocation();
  }, [visible, step, detectLocation]);

  useEffect(() => {
    if (!visible || step !== 'location') return undefined;

    let subscription;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;

      try {
        await Location.enableNetworkProviderAsync();
      } catch (_) {}

      try {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 2000,
            distanceInterval: 1,
          },
          (pos) => {
            updateLocationState(pos);
          },
        );
      } catch (_) {}
    })();

    return () => {
      cancelled = true;
      if (subscription) subscription.remove();
    };
  }, [visible, step, updateLocationState]);

  function selectAction(type) {
    setPendingAction(type);
    setStep('location');
  }

  function confirmLocation() {
    setCapturedPhoto(null);
    setStep('face');
  }

  function goBack() {
    if (step === 'location') setStep('recording');
    else if (step === 'face') { setCapturedPhoto(null); setStep('location'); }
  }

  async function saveRecord() {
    if (!pendingAction) return;
    await onSubmit(
      pendingAction,
      {
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        distance_m: distance !== null ? Math.round(distance) : null,
      },
      capturedPhoto,
    );
    onClose();
  }

  const withinRange = distance !== null && distance <= office.radius_m;
  const hasAccurateLocation =
    coords &&
    Number.isFinite(Number(locationAccuracy)) &&
    Number(locationAccuracy) <= TARGET_GPS_ACCURACY_M;
  const canConfirmLocation = !locating;
  const gpsQualityText = !coords
    ? 'Waiting for GPS fix'
    : !hasAccurateLocation
    ? `Low GPS accuracy: +/- ${Math.round(Number(locationAccuracy || 0)) || '?'}m`
    : 'GPS accuracy ready';

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

  const actionLabels = { time_in: 'Time In', break_out: 'Break Out', break_in: 'Break In', time_out: 'Time Out' };

  const stepDots = ['recording', 'location', 'face'];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={c.root}>

        {step !== 'face' && (
          <>
            {/* ── Header ── */}
            <View style={c.header}>
              {step !== 'recording' ? (
                <TouchableOpacity style={c.navBtn} onPress={goBack} accessibilityLabel="Go back">
                  <Text style={c.navBtnText}>‹</Text>
                </TouchableOpacity>
              ) : <View style={c.navBtn} />}

              <Text style={c.headerTitle}>
                {step === 'recording' ? 'Time Recording' : 'Location Point'}
              </Text>

              <TouchableOpacity style={c.navBtn} onPress={onClose} accessibilityLabel="Close">
                <Text style={c.navBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Step dots */}
            <View style={c.dotsRow}>
              {stepDots.map((s) => (
                <View key={s} style={[c.dot, step === s && c.dotActive]} />
              ))}
            </View>
          </>
        )}

        {/* ══ Step 1: Time Recording ══ */}
        {step === 'recording' && (
          <ScrollView style={c.scroll} contentContainerStyle={c.scrollContent}>
            {/* Clock card */}
            <View style={c.clockCard}>
              <Text style={c.clockDay}>{weekdayStr(now)}</Text>
              <Text style={c.clockTime}>{clockStr(now)}</Text>
              <Text style={c.clockDate}>{dateStr(now)}</Text>
            </View>

            {/* Employee row */}
            <View style={c.empRow}>
              <View style={c.empAvatar}>
                <Text style={c.empAvatarText}>
                  {String(employee?.first_name || employee?.full_name || 'E')[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={c.empName}>{employee?.full_name || employee?.first_name || 'Employee'}</Text>
                <Text style={c.empRole} numberOfLines={1}>
                  {[employee?.position, employee?.department].filter(Boolean).join(' — ')}
                </Text>
              </View>
            </View>

            {/* Today records */}
            <View style={c.recordsCard}>
              <Text style={c.recLabel}>Today</Text>
              {employee?.shift_name ? (
                <Text style={c.shiftBadge}>Shift: {employee.shift_name}</Text>
              ) : null}

              <View style={c.timeRow}>
                <View style={c.teItem}>
                  <View style={[c.teDot, c.teDotIn]} />
                  <Text style={c.teVal}>{fmtTime(todayState?.timeIn)}</Text>
                  <Text style={c.teLbl}>In</Text>
                </View>
                <Text style={c.teSep}>·</Text>
                <View style={c.teItem}>
                  <View style={[c.teDot, c.teDotOut]} />
                  <Text style={c.teVal}>{fmtTime(todayState?.timeOut)}</Text>
                  <Text style={c.teLbl}>Out</Text>
                </View>
              </View>

              <View style={c.breakSection}>
                <Text style={c.breakTitle}>Break Time</Text>
                <View style={c.timeRow}>
                  <View style={c.teItem}>
                    <View style={[c.teDot, c.teDotBrk]} />
                    <Text style={c.teVal}>{fmtTime(todayState?.breakOut)}</Text>
                    <Text style={c.teLbl}>Break Out</Text>
                  </View>
                  <Text style={c.teSep}>·</Text>
                  <View style={c.teItem}>
                    <View style={[c.teDot, c.teDotBrk]} />
                    <Text style={c.teVal}>{fmtTime(todayState?.breakIn)}</Text>
                    <Text style={c.teLbl}>Break In</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Action buttons */}
            <View style={c.actionsGrid}>
              {actions.map((a) => (
                <TouchableOpacity
                  key={a.key}
                  style={[c.actionBtn, a.disabled ? c.actionBtnDone : c.actionBtnReady]}
                  onPress={() => !a.disabled && selectAction(a.key)}
                  disabled={a.disabled || busy}
                >
                  <Text style={[c.actionBtnText, a.disabled && c.actionBtnTextDone]}>
                    {a.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* ══ Step 2: Location ══ */}
        {step === 'location' && (
          <ScrollView
            style={c.scroll}
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <LocationVisual
              coords={coords}
              distance={distance}
              locationAccuracy={locationAccuracy}
              office={office}
            />

            <View style={c.locCard}>
              <Text style={c.locHeading}>Location Point</Text>

              {locating && (
                <View style={c.locRow}>
                  <ActivityIndicator color="#0a66d9" size="small" />
                  <Text style={c.locRowText}>Detecting your location…</Text>
                </View>
              )}

              {/* GPS result — always shown as info, no error */}
              {!locating && distance !== null && (
                <View style={[c.locDist, c.locDistOk]}>
                  <Text style={[c.locDistIcon, c.locDistIconOk]}>✓</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[c.locDistText, { color: '#15803d' }]}>
                      {distance >= 1000
                        ? `${(distance / 1000).toFixed(1)} km from office`
                        : `${Math.round(distance)} m from office`}
                    </Text>
                    {coords ? (
                      <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                        {locationAccuracy ? ` | +/- ${Math.round(locationAccuracy)}m` : ''}
                      </Text>
                    ) : null}
                  </View>
                </View>
              )}

              {/* GPS unavailable */}
              {!locating && distance === null && (
                <View style={[c.locDist, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                  <Text style={[c.locDistIcon, { color: '#94a3b8' }]}>–</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#475569' }}>
                      Location not detected
                    </Text>
                    <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {locationError || 'GPS unavailable on this device. Turn on precise location and refresh.'}
                    </Text>
                  </View>
                </View>
              )}

              <Text style={c.locHint}>
                Your location is recorded for tracking. You can confirm from any location.
              </Text>

              {pendingAction ? (
                <Text style={c.actionHint}>
                  Recording: <Text style={{ fontWeight: '700', color: '#0a66d9' }}>{actionLabels[pendingAction]}</Text>
                </Text>
              ) : null}

              <View style={c.locActions}>
                <TouchableOpacity style={c.refreshBtn} onPress={detectLocation} disabled={locating} accessibilityLabel="Refresh location">
                  <Text style={c.refreshBtnText}>↻</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[c.confirmBtn, locating && c.confirmBtnDisabled]}
                  onPress={confirmLocation}
                  disabled={locating}
                >
                  <Text style={c.confirmBtnText}>
                    {locating ? 'Detecting…' : 'Confirm Location'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        )}

        {/* ══ Step 3: Selfie ══ */}
        {step === 'face' && (
          <SelfieCapture
            capturedPhoto={capturedPhoto}
            onPhotoCaptured={setCapturedPhoto}
            onRetake={() => setCapturedPhoto(null)}
            onSave={saveRecord}
            busy={busy}
            onBack={goBack}
            onClose={onClose}
          />
        )}
      </View>
    </Modal>
  );
}

const c = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4,
    backgroundColor: '#fff',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  navBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  navBtnText: { fontSize: 22, color: '#475569', fontWeight: '600' },

  // Dots
  dotsRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 6,
    paddingVertical: 8, backgroundColor: '#fff',
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#cbd5e1' },
  dotActive: { backgroundColor: '#0a66d9', transform: [{ scale: 1.4 }] },
  dotDark: { backgroundColor: 'rgba(255,255,255,0.3)' },
  dotActiveDark: { backgroundColor: '#fff' },

  // Scroll
  scroll: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 12 },

  // Clock
  clockCard: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 20, alignItems: 'center',
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  clockDay: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
  clockTime: { fontSize: 54, fontWeight: '900', color: '#0f172a', letterSpacing: -2, lineHeight: 60 },
  clockDate: { fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: '500' },

  // Employee row
  empRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  empAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#0a66d9', alignItems: 'center', justifyContent: 'center',
  },
  empAvatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  empName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  empRole: { fontSize: 12, color: '#64748b', marginTop: 2 },

  // Records card
  recordsCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  recLabel: { fontSize: 10, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  shiftBadge: { fontSize: 12, color: '#475569', marginBottom: 10, fontWeight: '500' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  teDot: { width: 8, height: 8, borderRadius: 4 },
  teDotIn: { backgroundColor: '#22c55e' },
  teDotOut: { backgroundColor: '#f43f5e' },
  teDotBrk: { backgroundColor: '#f59e0b' },
  teVal: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  teLbl: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  teSep: { color: '#cbd5e1', fontSize: 18 },
  breakSection: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  breakTitle: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 },

  // Action buttons grid
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: { width: '47%', padding: 14, borderRadius: 14, alignItems: 'center' },
  actionBtnReady: {
    backgroundColor: '#0a66d9',
    shadowColor: '#0a66d9', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  actionBtnDone: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  actionBtnTextDone: { color: '#94a3b8' },

  // Location card
  locCard: { padding: 16, gap: 12 },
  locHeading: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locRowText: { fontSize: 13, color: '#64748b' },
  locWarn: { backgroundColor: '#fffbeb', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#fde68a' },
  locWarnText: { fontSize: 13, color: '#b45309' },
  locDist: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  locDistOk: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  locDistFar: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
  locDistIcon: { fontSize: 14, fontWeight: '800' },
  locDistIconOk: { color: '#15803d' },
  locDistIconFar: { color: '#c2410c' },
  locDistText: { fontSize: 13, fontWeight: '600', flex: 1 },
  locHint: { fontSize: 13, color: '#475569', lineHeight: 20 },
  actionHint: { fontSize: 12, color: '#64748b', textAlign: 'center' },
  locActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  refreshBtn: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
    alignItems: 'center', justifyContent: 'center',
  },
  refreshBtnText: { fontSize: 20, color: '#64748b' },
  confirmBtn: {
    flex: 1, backgroundColor: '#0a66d9', borderRadius: 14,
    padding: 14, alignItems: 'center',
    shadowColor: '#0a66d9', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Face step
  faceWrap: { flex: 1 },
  faceCard: {
    backgroundColor: '#fff', borderRadius: 20,
    padding: 16, paddingBottom: 28, gap: 12,
    position: 'absolute', bottom: 0, left: 0, right: 0,
  },
  matchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  matchLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  faceIconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center',
  },
  faceIconText: { fontSize: 18 },
  matchLabel: { fontSize: 11, color: '#64748b' },
  matchPct: { fontSize: 16, fontWeight: '800', color: '#15803d' },
  thumbPlaceholder: {
    width: 44, height: 44, borderRadius: 8,
    backgroundColor: '#dcfce7', borderWidth: 2, borderColor: '#86efac',
    alignItems: 'center', justifyContent: 'center',
  },
  thumbText: { fontSize: 18, color: '#15803d' },
  faceActions: { flexDirection: 'row', gap: 10 },
  retakeBtn: {
    flex: 1, padding: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
    alignItems: 'center',
  },
  retakeBtnText: { color: '#475569', fontWeight: '700', fontSize: 14 },
  saveBtn: {
    flex: 2, padding: 14, borderRadius: 14,
    backgroundColor: '#0a66d9', alignItems: 'center',
    shadowColor: '#0a66d9', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
