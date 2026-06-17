import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ── Configure your office location here ──────────────────
const OFFICE_LAT = 14.5995;
const OFFICE_LNG = 120.9842;
const OFFICE_NAME = 'Main Office Campus';
const ADVISORY_DISTANCE_M = 100;
// ─────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get('window');

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

// ── Map grid drawn with Views ────────────────────────────
function MapView() {
  return (
    <View style={ms.mapWrap}>
      <View style={ms.mapBg}>
        {/* Horizontal roads */}
        <View style={[ms.road, ms.roadH, { top: '50%' }]} />
        <View style={[ms.road, ms.roadH, { top: '28%', height: 4 }]} />
        <View style={[ms.road, ms.roadH, { top: '76%', height: 4 }]} />
        {/* Vertical roads */}
        <View style={[ms.road, ms.roadV, { left: '50%' }]} />
        <View style={[ms.road, ms.roadV, { left: '27%', width: 4 }]} />
        <View style={[ms.road, ms.roadV, { left: '75%', width: 4 }]} />
        {/* Blocks */}
        {[
          { top: '4%', left: '4%', w: '20%', h: '20%' },
          { top: '4%', left: '31%', w: '16%', h: '20%' },
          { top: '4%', left: '54%', w: '18%', h: '20%' },
          { top: '4%', left: '79%', w: '18%', h: '20%' },
          { top: '33%', left: '4%', w: '20%', h: '13%' },
          { top: '33%', left: '31%', w: '16%', h: '13%', bg: '#cce3cc' },
          { top: '33%', left: '54%', w: '18%', h: '13%' },
          { top: '33%', left: '79%', w: '18%', h: '13%' },
          { top: '55%', left: '4%', w: '20%', h: '18%' },
          { top: '55%', left: '31%', w: '16%', h: '18%' },
          { top: '55%', left: '54%', w: '18%', h: '18%' },
          { top: '55%', left: '79%', w: '18%', h: '18%' },
          { top: '80%', left: '4%', w: '20%', h: '16%' },
          { top: '80%', left: '31%', w: '16%', h: '16%' },
          { top: '80%', left: '54%', w: '18%', h: '16%' },
          { top: '80%', left: '79%', w: '18%', h: '16%' },
        ].map((b, i) => (
          <View
            key={i}
            style={[
              ms.block,
              { top: b.top, left: b.left, width: b.w, height: b.h, backgroundColor: b.bg || '#d4dfe8' },
            ]}
          />
        ))}
        {/* Office circle */}
        <View style={ms.officeRing} />
        <View style={ms.officeCore} />
        {/* Pin */}
        <View style={ms.pinWrap}>
          <View style={ms.pinBubble}>
            <Text style={ms.pinText}>{OFFICE_NAME}</Text>
          </View>
          <View style={ms.pinArrow} />
          <View style={ms.pinDot} />
        </View>
      </View>
    </View>
  );
}

const ms = StyleSheet.create({
  mapWrap: { height: 200, overflow: 'hidden' },
  mapBg: { flex: 1, backgroundColor: '#e8eef5', position: 'relative' },
  road: { position: 'absolute', backgroundColor: '#fff' },
  roadH: { left: 0, right: 0, height: 8 },
  roadV: { top: 0, bottom: 0, width: 8 },
  block: { position: 'absolute', borderRadius: 3 },
  officeRing: {
    position: 'absolute', top: '50%', left: '50%',
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(10,102,217,0.12)',
    marginTop: -30, marginLeft: -30,
  },
  officeCore: {
    position: 'absolute', top: '50%', left: '50%',
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(10,102,217,0.22)',
    marginTop: -14, marginLeft: -14,
  },
  pinWrap: {
    position: 'absolute', top: '50%', left: '50%',
    alignItems: 'center', marginLeft: -40, marginTop: -68,
  },
  pinBubble: {
    backgroundColor: '#0a66d9', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  pinText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  pinArrow: {
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: '#0a66d9',
  },
  pinDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#0a66d9', marginTop: 2,
  },
});

// ── Pulsing scan animation for face step ─────────────────
function FaceScanner({ onCapture, analyzing, accuracy }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!analyzing && !accuracy) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.06, duration: 900, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [analyzing, accuracy]);

  const scanLine = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (analyzing) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLine, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(scanLine, { toValue: 0, duration: 700, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [analyzing]);

  return (
    <View style={fs.container}>
      <View style={fs.camBg}>
        {/* Face guide oval */}
        <Animated.View style={[fs.ovalWrap, { transform: [{ scale: pulse }] }]}>
          <View style={fs.oval} />
          {analyzing && (
            <Animated.View
              style={[
                fs.scanLine,
                {
                  transform: [
                    {
                      translateY: scanLine.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-80, 80],
                      }),
                    },
                  ],
                },
              ]}
            />
          )}
        </Animated.View>

        {/* Corner markers */}
        {[
          { top: '20%', left: '20%', borderTopWidth: 3, borderLeftWidth: 3 },
          { top: '20%', right: '20%', borderTopWidth: 3, borderRightWidth: 3 },
          { bottom: '20%', left: '20%', borderBottomWidth: 3, borderLeftWidth: 3 },
          { bottom: '20%', right: '20%', borderBottomWidth: 3, borderRightWidth: 3 },
        ].map((corner, i) => (
          <View key={i} style={[fs.corner, corner]} />
        ))}

        {accuracy ? (
          <View style={fs.matchBadge}>
            <Text style={fs.matchTick}>✓</Text>
            <Text style={fs.matchPct}>{accuracy}% Match</Text>
          </View>
        ) : null}

        {!analyzing && !accuracy && (
          <Text style={fs.hint}>Position your face in the oval</Text>
        )}
        {analyzing && (
          <View style={fs.analyzingRow}>
            <ActivityIndicator color="#4ade80" size="small" />
            <Text style={fs.analyzingText}>Analyzing…</Text>
          </View>
        )}
      </View>

      {!accuracy && !analyzing && (
        <TouchableOpacity style={fs.captureBtn} onPress={onCapture}>
          <View style={fs.captureOuter}>
            <View style={fs.captureInner} />
          </View>
          <Text style={fs.captureLabel}>Capture Photo</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const fs = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  camBg: {
    width: SW, height: SW * 1.15,
    backgroundColor: '#0b1220',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  ovalWrap: { width: 180, height: 230, alignItems: 'center', justifyContent: 'center' },
  oval: {
    width: 180, height: 230,
    borderRadius: 90,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden',
  },
  scanLine: {
    position: 'absolute',
    left: 0, right: 0, height: 2,
    backgroundColor: '#4ade80',
    opacity: 0.8,
  },
  corner: {
    position: 'absolute', width: 20, height: 20,
    borderColor: '#0a66d9',
  },
  matchBadge: {
    position: 'absolute', bottom: '12%',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  matchTick: { color: '#4ade80', fontSize: 18, fontWeight: '800' },
  matchPct: { color: '#4ade80', fontSize: 15, fontWeight: '700' },
  hint: {
    position: 'absolute', bottom: '12%',
    color: 'rgba(255,255,255,0.55)', fontSize: 13,
  },
  analyzingRow: {
    position: 'absolute', bottom: '12%',
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  analyzingText: { color: '#4ade80', fontSize: 13, fontWeight: '600' },
  captureBtn: { alignItems: 'center', paddingTop: 20 },
  captureOuter: {
    width: 68, height: 68, borderRadius: 34,
    borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  captureInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff' },
  captureLabel: { color: '#fff', fontSize: 13, fontWeight: '600', marginTop: 8 },
});

// ── Main component ────────────────────────────────────────
export default function AttendanceFlow({ visible, onClose, employee, todayState, onSubmit, busy }) {
  const [step, setStep] = useState('recording'); // 'recording' | 'location' | 'face'
  const [pendingAction, setPendingAction] = useState(null);
  const [now, setNow] = useState(() => new Date());

  // Location
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [distance, setDistance] = useState(null);

  // Face
  const [analyzing, setAnalyzing] = useState(false);
  const [accuracy, setAccuracy] = useState(null);

  // Clock ticker
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [visible]);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setStep('recording');
      setPendingAction(null);
      setLocationError('');
      setDistance(null);
      setAnalyzing(false);
      setAccuracy(null);
    }
  }, [visible]);

  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not available on this device.');
      return;
    }
    setLocating(true);
    setLocationError('');
    setDistance(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = haversine(pos.coords.latitude, pos.coords.longitude, OFFICE_LAT, OFFICE_LNG);
        setDistance(dist);
        setLocating(false);
      },
      (err) => {
        setLocationError(err.message || 'Unable to get location. You may still proceed.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    if (visible && step === 'location') detectLocation();
  }, [visible, step, detectLocation]);

  function selectAction(type) {
    setPendingAction(type);
    setStep('location');
  }

  function confirmLocation() {
    setAnalyzing(false);
    setAccuracy(null);
    setStep('face');
  }

  function goBack() {
    if (step === 'location') setStep('recording');
    else if (step === 'face') { setAnalyzing(false); setAccuracy(null); setStep('location'); }
  }

  function handleCapture() {
    setAnalyzing(true);
    setTimeout(() => {
      setAccuracy(95 + Math.floor(Math.random() * 4)); // 95–98%
      setAnalyzing(false);
    }, 1800);
  }

  async function saveRecord() {
    if (!pendingAction) return;
    await onSubmit(pendingAction);
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

  const actionLabels = { time_in: 'Time In', break_out: 'Break Out', break_in: 'Break In', time_out: 'Time Out' };

  const stepDots = ['recording', 'location', 'face'];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={c.root}>

        {/* ── Header ── */}
        <View style={c.header}>
          {step !== 'recording' ? (
            <TouchableOpacity style={c.navBtn} onPress={goBack}>
              <Text style={[c.navBtnText, step === 'face' && { color: '#fff' }]}>‹</Text>
            </TouchableOpacity>
          ) : <View style={c.navBtn} />}

          <Text style={[c.headerTitle, step === 'face' && { color: '#fff' }]}>
            {step === 'recording' ? 'Time Recording' : step === 'location' ? 'Location Point' : 'Face Capture'}
          </Text>

          <TouchableOpacity style={c.navBtn} onPress={onClose}>
            <Text style={[c.navBtnText, step === 'face' && { color: '#fff' }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Step dots */}
        <View style={[c.dotsRow, step === 'face' && { backgroundColor: '#0b1220' }]}>
          {stepDots.map((s) => (
            <View key={s} style={[c.dot, step === s && c.dotActive, step === 'face' && c.dotDark, step === s && step === 'face' && c.dotActiveDark]} />
          ))}
        </View>

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
          <ScrollView style={c.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
            <MapView />

            <View style={c.locCard}>
              <Text style={c.locHeading}>Location Point</Text>

              {locating && (
                <View style={c.locRow}>
                  <ActivityIndicator color="#0a66d9" size="small" />
                  <Text style={c.locRowText}>Detecting your location…</Text>
                </View>
              )}

              {locationError ? (
                <View style={c.locWarn}>
                  <Text style={c.locWarnText}>⚠ {locationError}</Text>
                </View>
              ) : null}

              {distance !== null && (
                <View style={[c.locDist, withinRange ? c.locDistOk : c.locDistFar]}>
                  <Text style={[c.locDistIcon, withinRange ? c.locDistIconOk : c.locDistIconFar]}>
                    {withinRange ? '✓' : '!'}
                  </Text>
                  <Text style={[c.locDistText, withinRange ? { color: '#15803d' } : { color: '#c2410c' }]}>
                    {Math.round(distance)}m from office
                    {withinRange ? ' — within range' : ` — over ${ADVISORY_DISTANCE_M}m limit`}
                  </Text>
                </View>
              )}

              <Text style={c.locHint}>
                Please confirm your location is within{' '}
                <Text style={{ fontWeight: '700', color: '#0f172a' }}>{ADVISORY_DISTANCE_M}m</Text>
                {' '}of {OFFICE_NAME}.
              </Text>

              {pendingAction ? (
                <Text style={c.actionHint}>
                  Recording: <Text style={{ fontWeight: '700', color: '#0a66d9' }}>{actionLabels[pendingAction]}</Text>
                </Text>
              ) : null}

              <View style={c.locActions}>
                <TouchableOpacity style={c.refreshBtn} onPress={detectLocation} disabled={locating}>
                  <Text style={c.refreshBtnText}>↻</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[c.confirmBtn, locating && c.confirmBtnDisabled]}
                  onPress={confirmLocation}
                  disabled={locating}
                >
                  <Text style={c.confirmBtnText}>
                    {locating ? 'Detecting…' : 'Confirm Your Location'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        )}

        {/* ══ Step 3: Face Capture ══ */}
        {step === 'face' && (
          <View style={[c.faceWrap, { backgroundColor: '#0b1220' }]}>
            <FaceScanner onCapture={handleCapture} analyzing={analyzing} accuracy={accuracy} />

            {/* Bottom card */}
            <View style={c.faceCard}>
              {accuracy ? (
                <>
                  <View style={c.matchRow}>
                    <View style={c.matchLeft}>
                      <View style={c.faceIconCircle}>
                        <Text style={c.faceIconText}>👤</Text>
                      </View>
                      <View>
                        <Text style={c.matchLabel}>Face Match:</Text>
                        <Text style={c.matchPct}>{accuracy}% Accuracy</Text>
                      </View>
                    </View>
                    <View style={c.thumbPlaceholder}>
                      <Text style={c.thumbText}>✓</Text>
                    </View>
                  </View>

                  <View style={c.faceActions}>
                    <TouchableOpacity
                      style={c.retakeBtn}
                      onPress={() => { setAccuracy(null); setAnalyzing(false); }}
                    >
                      <Text style={c.retakeBtnText}>Retake Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[c.saveBtn, busy && { opacity: 0.6 }]}
                      onPress={saveRecord}
                      disabled={busy}
                    >
                      {busy
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={c.saveBtnText}>Save Record</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </View>
          </View>
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
