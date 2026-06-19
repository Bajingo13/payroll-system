import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, getApiMessage } from '../api/client';

const T = {
  bg: '#0f172a', surface: '#1e293b', surfaceAlt: '#273548',
  border: '#334155', accent: '#8b5cf6', accentLight: '#a78bfa',
  textPrimary: '#f1f5f9', textSub: '#94a3b8', textMuted: '#64748b',
  headerBg: '#1e1b4b',
};

const EVENT_COLORS = {
  'Regular Holiday': '#f87171',
  'Special Holiday': '#fbbf24',
  'Company Event':   '#8b5cf6',
  'Observance':      '#22d3ee',
};
const EVENT_TYPES = ['Regular Holiday', 'Special Holiday', 'Company Event', 'Observance'];
const DAY_LABELS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const { width: SCREEN_W } = Dimensions.get('window');
const CELL_SIZE = Math.floor((SCREEN_W - 28 - 12) / 7); // 7 columns, 14px side padding each side, 12px gaps

// ── Calendar helpers ──────────────────────────────────────────────────────
function buildGrid(year, month) {
  const firstDow   = new Date(year, month, 1).getDay();   // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = [];
  let week = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function fmtMonthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

function fmtEventDate(v) {
  if (!v) return '-';
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Main Screen ───────────────────────────────────────────────────────────
export default function HRCalendarScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const today  = new Date();

  const [year,       setYear]       = useState(today.getFullYear());
  const [month,      setMonth]      = useState(today.getMonth());       // 0-based
  const [events,     setEvents]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState('');
  const [selected,   setSelected]   = useState(null); // 'YYYY-MM-DD' or null = all
  const [addModal,   setAddModal]   = useState(false);
  const [form,       setForm]       = useState({ event_date: '', title: '', event_type: 'Company Event', description: '', is_paid_holiday: false });
  const [submitting, setSubmitting] = useState(false);
  const [toast,      setToast]      = useState('');

  async function load(y, m, isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data } = await api.get('/company-calendar/events', { params: { month: monthKey(y, m) } });
      setEvents(data.events || []);
      setError('');
    } catch (err) { setError(getApiMessage(err, 'Failed to load calendar.')); }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(year, month); setSelected(null); }, [year, month]);

  function shiftMonth(delta) {
    let m = month + delta, y = year;
    if (m < 0)  { m = 11; y -= 1; }
    if (m > 11) { m = 0;  y += 1; }
    setYear(y); setMonth(m);
  }

  async function deleteEvent(eventId) {
    try {
      await api.delete(`/company-calendar/events/${eventId}`);
      setEvents((prev) => prev.filter((e) => e.event_id !== eventId));
      showToast('Event deleted.');
    } catch (err) { setError(getApiMessage(err, 'Delete failed.')); }
  }

  async function submitAdd() {
    if (!form.event_date || !form.title.trim()) { setError('Date and title are required.'); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post('/company-calendar/events', { ...form, is_paid_holiday: form.is_paid_holiday ? 1 : 0 });
      if (!data.success) throw new Error(data.message);
      setAddModal(false);
      resetForm();
      showToast('Event added!');
      await load(year, month);
    } catch (err) { setError(getApiMessage(err, 'Failed to add event.')); }
    finally { setSubmitting(false); }
  }

  function resetForm() { setForm({ event_date: '', title: '', event_type: 'Company Event', description: '', is_paid_holiday: false }); }
  function setF(k, v)  { setForm((p) => ({ ...p, [k]: v })); }
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2200); }

  function openAddForDay(dateStr) {
    setError('');
    setForm((p) => ({ ...p, event_date: dateStr }));
    setAddModal(true);
  }

  // ── Derived ──
  const grid = useMemo(() => buildGrid(year, month), [year, month]);

  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach((ev) => {
      const k = String(ev.event_date || '').slice(0, 10);
      if (!map[k]) map[k] = [];
      map[k].push(ev);
    });
    return map;
  }, [events]);

  const visibleEvents = useMemo(() => {
    if (selected) return eventsByDate[selected] || [];
    return events;
  }, [selected, events, eventsByDate]);

  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <View style={s.root}>

      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color={T.accentLight} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Company Calendar</Text>
          <TouchableOpacity style={s.addBtn} onPress={() => { setError(''); resetForm(); setAddModal(true); }}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Month nav */}
        <View style={s.monthNav}>
          <TouchableOpacity style={s.monthArrow} onPress={() => shiftMonth(-1)}>
            <Ionicons name="chevron-back" size={18} color={T.accentLight} />
          </TouchableOpacity>
          <Text style={s.monthLabel}>{fmtMonthLabel(year, month)}</Text>
          <TouchableOpacity style={s.monthArrow} onPress={() => shiftMonth(1)}>
            <Ionicons name="chevron-forward" size={18} color={T.accentLight} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(year, month, true)} tintColor={T.accentLight} />}
      >
        {/* ── Calendar grid ── */}
        <View style={s.calendarWrap}>
          {/* Day-of-week headers */}
          <View style={s.dowRow}>
            {DAY_LABELS.map((d, i) => (
              <View key={d} style={s.dowCell}>
                <Text style={[s.dowText, (i === 0 || i === 6) && s.dowWeekend]}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Week rows */}
          {loading ? (
            <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} />
          ) : (
            grid.map((week, wi) => (
              <View key={wi} style={s.weekRow}>
                {week.map((day, di) => {
                  if (!day) return <View key={`e-${di}`} style={s.dayCell} />;
                  const dateStr   = toDateStr(year, month, day);
                  const isToday   = dateStr === todayStr;
                  const isSel     = dateStr === selected;
                  const dayEvents = eventsByDate[dateStr] || [];
                  const isWeekend = di === 0 || di === 6;

                  return (
                    <TouchableOpacity
                      key={day}
                      style={[
                        s.dayCell,
                        isToday && s.dayCellToday,
                        isSel && s.dayCellSelected,
                      ]}
                      onPress={() => setSelected(isSel ? null : dateStr)}
                      onLongPress={() => openAddForDay(dateStr)}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        s.dayNum,
                        isWeekend && s.dayNumWeekend,
                        isToday   && s.dayNumToday,
                        isSel     && s.dayNumSelected,
                      ]}>
                        {day}
                      </Text>

                      {/* Event dots — up to 3 */}
                      {dayEvents.length > 0 && (
                        <View style={s.dotRow}>
                          {dayEvents.slice(0, 3).map((ev, ei) => (
                            <View
                              key={ei}
                              style={[s.dot, { backgroundColor: EVENT_COLORS[ev.event_type] || T.accent }]}
                            />
                          ))}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
        </View>

        {/* ── Legend ── */}
        <View style={s.legend}>
          {Object.entries(EVENT_COLORS).map(([type, color]) => (
            <View key={type} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: color }]} />
              <Text style={s.legendText}>{type}</Text>
            </View>
          ))}
        </View>

        {/* ── Event list ── */}
        <View style={s.eventSection}>
          <View style={s.eventSectionHeader}>
            <Text style={s.eventSectionTitle}>
              {selected ? fmtEventDate(selected) : `All Events · ${fmtMonthLabel(year, month)}`}
            </Text>
            {selected && (
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Text style={s.clearSel}>Show all</Text>
              </TouchableOpacity>
            )}
          </View>

          {error ? <Text style={s.errorText}>{error}</Text> : null}

          {!loading && visibleEvents.length === 0 && (
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={40} color={T.textMuted} />
              <Text style={s.emptyText}>
                {selected ? 'No events on this day' : 'No events this month'}
              </Text>
              <TouchableOpacity style={s.addEventBtn} onPress={() => openAddForDay(selected || '')}>
                <Ionicons name="add" size={14} color={T.accent} />
                <Text style={s.addEventBtnText}>Add event</Text>
              </TouchableOpacity>
            </View>
          )}

          {visibleEvents.map((ev) => {
            const color = EVENT_COLORS[ev.event_type] || T.accent;
            return (
              <View key={ev.event_id} style={[s.eventCard, { borderLeftColor: color }]}>
                <View style={[s.eventColorBar, { backgroundColor: color + '30' }]}>
                  <View style={[s.eventDot, { backgroundColor: color }]} />
                </View>
                <View style={s.eventBody}>
                  <Text style={s.eventTitle}>{ev.title}</Text>
                  <Text style={[s.eventType, { color }]}>{ev.event_type}</Text>
                  {!selected && <Text style={s.eventDate}>{fmtEventDate(ev.event_date)}</Text>}
                  {ev.description ? <Text style={s.eventDesc} numberOfLines={2}>{ev.description}</Text> : null}
                </View>
                <View style={s.eventRight}>
                  {ev.is_paid_holiday ? (
                    <View style={s.paidBadge}><Text style={s.paidText}>Paid</Text></View>
                  ) : null}
                  <TouchableOpacity onPress={() => deleteEvent(ev.event_id)} style={s.deleteBtn}>
                    <Ionicons name="trash-outline" size={16} color="#f87171" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* ── Toast ── */}
      {toast ? (
        <View style={s.toast}>
          <Ionicons name="checkmark-circle" size={15} color="#34d399" />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* ── Add Event Modal ── */}
      <Modal visible={addModal} transparent animationType="slide" onRequestClose={() => setAddModal(false)}>
        <Pressable style={s.modalBg} onPress={() => setAddModal(false)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Add Event</Text>
            {error ? <Text style={s.modalError}>{error}</Text> : null}

            <Text style={s.fieldLabel}>Date (YYYY-MM-DD) *</Text>
            <TextInput
              style={s.fieldInput}
              value={form.event_date}
              onChangeText={(v) => setF('event_date', v)}
              placeholder="2026-06-19"
              placeholderTextColor={T.textMuted}
              keyboardType="numeric"
            />

            <Text style={s.fieldLabel}>Title *</Text>
            <TextInput
              style={s.fieldInput}
              value={form.title}
              onChangeText={(v) => setF('title', v)}
              placeholder="Event title"
              placeholderTextColor={T.textMuted}
            />

            <Text style={s.fieldLabel}>Type</Text>
            <View style={s.typeRow}>
              {EVENT_TYPES.map((t) => {
                const active = form.event_type === t;
                const color  = EVENT_COLORS[t] || T.accent;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[s.typeChip, active && { backgroundColor: color + '25', borderColor: color }]}
                    onPress={() => setF('event_type', t)}
                  >
                    {active && <View style={[s.typeChipDot, { backgroundColor: color }]} />}
                    <Text style={[s.typeChipText, active && { color }]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.fieldLabel}>Description</Text>
            <TextInput
              style={[s.fieldInput, { minHeight: 64 }]}
              value={form.description}
              onChangeText={(v) => setF('description', v)}
              placeholder="Optional…"
              placeholderTextColor={T.textMuted}
              multiline textAlignVertical="top"
            />

            <TouchableOpacity style={s.paidToggle} onPress={() => setF('is_paid_holiday', !form.is_paid_holiday)}>
              <Ionicons name={form.is_paid_holiday ? 'checkbox' : 'square-outline'} size={22} color={T.accent} />
              <Text style={s.paidToggleText}>Mark as Paid Holiday</Text>
            </TouchableOpacity>

            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setAddModal(false); setError(''); }}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, submitting && { opacity: 0.6 }]}
                onPress={submitAdd}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.confirmText}>Add Event</Text>
                }
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },

  // Header
  header:     { backgroundColor: T.headerBg, paddingHorizontal: 14, paddingBottom: 14 },
  headerRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  backBtn:    { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:{ flex: 1, fontSize: 20, fontWeight: '900', color: T.textPrimary },
  addBtn:     { width: 36, height: 36, borderRadius: 12, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  monthNav:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  monthArrow: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(139,92,246,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  monthLabel: { flex: 1, fontSize: 16, fontWeight: '800', color: T.textPrimary, textAlign: 'center' },

  body: { paddingBottom: 60 },

  // ── Calendar grid ──
  calendarWrap: { backgroundColor: T.surface, marginHorizontal: 14, marginTop: 14, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: T.border },

  dowRow:     { flexDirection: 'row', marginBottom: 6 },
  dowCell:    { width: CELL_SIZE, alignItems: 'center', paddingVertical: 4 },
  dowText:    { fontSize: 11, fontWeight: '700', color: T.textMuted },
  dowWeekend: { color: '#f87171' },

  weekRow: { flexDirection: 'row' },

  dayCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginVertical: 2,
  },
  dayCellToday:    { backgroundColor: T.accentBg || '#2d1f52', borderWidth: 1, borderColor: T.accent },
  dayCellSelected: { backgroundColor: T.accent },

  dayNum:         { fontSize: 13, fontWeight: '600', color: T.textSub },
  dayNumWeekend:  { color: '#f87171' },
  dayNumToday:    { color: T.accentLight, fontWeight: '800' },
  dayNumSelected: { color: '#fff', fontWeight: '900' },

  dotRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
  dot:    { width: 5, height: 5, borderRadius: 3 },

  // ── Legend ──
  legend:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 14, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: T.textSub, fontWeight: '600' },

  // ── Event list ──
  eventSection:      { marginTop: 16, paddingHorizontal: 14 },
  eventSectionHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  eventSectionTitle: { fontSize: 13, fontWeight: '800', color: T.textPrimary },
  clearSel:          { fontSize: 12, color: T.accentLight, fontWeight: '700' },

  eventCard:    { flexDirection: 'row', alignItems: 'stretch', backgroundColor: T.surface, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: T.border, borderLeftWidth: 3, overflow: 'hidden' },
  eventColorBar:{ width: 36, alignItems: 'center', justifyContent: 'center' },
  eventDot:     { width: 10, height: 10, borderRadius: 5 },
  eventBody:    { flex: 1, padding: 12 },
  eventTitle:   { fontSize: 14, fontWeight: '800', color: T.textPrimary },
  eventType:    { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  eventDate:    { fontSize: 11, color: T.textSub, marginTop: 3 },
  eventDesc:    { fontSize: 11, color: T.textMuted, marginTop: 4, lineHeight: 15 },
  eventRight:   { padding: 10, alignItems: 'flex-end', justifyContent: 'space-between' },
  paidBadge:    { backgroundColor: '#0d2e1e', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3 },
  paidText:     { fontSize: 9, color: '#34d399', fontWeight: '800' },
  deleteBtn:    { padding: 4 },

  // ── Empty ──
  empty:       { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText:   { fontSize: 14, color: T.textSub },
  addEventBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: T.accent + '55', backgroundColor: T.accent + '15' },
  addEventBtnText: { color: T.accent, fontWeight: '700', fontSize: 13 },

  // ── Error / Toast ──
  errorText: { color: '#f87171', fontSize: 12, marginBottom: 8 },
  toast:     { position: 'absolute', bottom: 80, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#0d2e1e', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#065f46' },
  toastText: { color: '#34d399', fontWeight: '700', fontSize: 13 },

  // ── Add Modal ──
  modalBg:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet:  { backgroundColor: T.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderColor: T.border },
  modalHandle: { width: 40, height: 4, backgroundColor: T.border, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  modalTitle:  { fontSize: 18, fontWeight: '900', color: T.textPrimary, marginBottom: 12 },
  modalError:  { color: '#f87171', fontSize: 12, marginBottom: 8 },
  fieldLabel:  { fontSize: 10, color: T.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5, marginTop: 10 },
  fieldInput:  { backgroundColor: T.surfaceAlt, borderRadius: 12, borderWidth: 1, borderColor: T.border, color: T.textPrimary, fontSize: 14, padding: 12 },
  typeRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border },
  typeChipDot: { width: 6, height: 6, borderRadius: 3 },
  typeChipText:{ fontSize: 11, color: T.textSub, fontWeight: '700' },
  paidToggle:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  paidToggleText: { fontSize: 13, color: T.textPrimary, fontWeight: '600' },
  modalActions:{ flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelBtn:   { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border },
  cancelText:  { color: T.textSub, fontWeight: '700', fontSize: 14 },
  confirmBtn:  { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: T.accent },
  confirmText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
