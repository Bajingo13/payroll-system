import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';

// ── Helpers ──────────────────────────────────────────────
function money(v) {
  return Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

function formatDate(v) {
  if (!v) return '-';
  const d = new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? String(v)
    : d.toLocaleDateString('en-PH', { month: 'long', day: '2-digit', year: 'numeric' });
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function chunkToWords(n) {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + chunkToWords(n % 100) : '');
}

function numberToWords(amount) {
  const n = Math.abs(Math.floor(Number(amount || 0)));
  const cents = Math.round((Math.abs(Number(amount || 0)) - n) * 100);
  if (n === 0 && cents === 0) return 'Zero Pesos';
  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const remainder = n % 1_000;
  let words = '';
  if (billions) words += chunkToWords(billions) + ' Billion ';
  if (millions) words += chunkToWords(millions) + ' Million ';
  if (thousands) words += chunkToWords(thousands) + ' Thousand ';
  if (remainder) words += chunkToWords(remainder);
  words = words.trim() + ' Pesos';
  if (cents) words += ' and ' + chunkToWords(cents) + ' Centavos';
  return words + ' Only';
}

// ── Table row ─────────────────────────────────────────────
function TR({ label, amount, bold }) {
  return (
    <View style={[t.row, bold && t.rowBold]}>
      <Text style={[t.label, bold && { fontWeight: '800', color: '#0f172a' }]}>{label}</Text>
      <Text style={[t.amount, bold && { fontWeight: '800', color: '#0f172a' }]}>{amount}</Text>
    </View>
  );
}

// ── Main component ─────────────────────────────────────────
export default function PayslipModal({ visible, payrollId, onClose }) {
  const [loading, setLoading] = useState(false);
  const [payslip, setPayslip] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible && payrollId) {
      setLoading(true); setPayslip(null); setError('');
      api.get(`/employee/payslip/${payrollId}`)
        .then(({ data }) => { if (data.success) setPayslip(data.payslip); else setError(data.message || 'Failed to load.'); })
        .catch(() => setError('Failed to load payslip.'))
        .finally(() => setLoading(false));
    }
  }, [visible, payrollId]);

  const p = payslip || {};
  const fullName = [p.first_name, p.middle_name ? p.middle_name[0] + '.' : '', p.last_name].filter(Boolean).join(' ');

  async function sharePayslip() {
    if (!payslip) return;
    const lines = [
      `PAYSLIP — ${p.payroll_range || '-'}`,
      `${'─'.repeat(36)}`,
      `Employee : ${fullName || '-'}`,
      `ID       : ${p.emp_code || '-'}`,
      `Position : ${p.position || '-'}`,
      `Dept     : ${p.department || '-'}`,
      `Period   : ${p.payroll_range || '-'}`,
      `${'─'.repeat(36)}`,
      `EARNINGS`,
      ...(Number(p.basic_salary) > 0 ? [`  Basic Salary           ${money(p.basic_salary)}`] : []),
      ...(Number(p.overtime) > 0 ? [`  Overtime Pay           ${money(p.overtime)}`] : []),
      ...(Number(p.holiday_pay) > 0 ? [`  Holiday Pay            ${money(p.holiday_pay)}`] : []),
      ...(p.allowances || []).filter(a => Number(a.amount) > 0).map(a => `  ${(a.allowance_name || 'Allowance').padEnd(22)} ${money(a.amount)}`),
      `  Total Earnings         ${money(p.gross_pay)}`,
      `${'─'.repeat(36)}`,
      `DEDUCTIONS`,
      ...(Number(p.absence_deduction) > 0 ? [`  Absences               ${money(p.absence_deduction)}`] : []),
      ...(Number(p.late_deduction) > 0 ? [`  Tardiness              ${money(p.late_deduction)}`] : []),
      ...(Number(p.sss_employee) > 0 ? [`  SSS Premium            ${money(p.sss_employee)}`] : []),
      ...(Number(p.philhealth_employee) > 0 ? [`  PhilHealth             ${money(p.philhealth_employee)}`] : []),
      ...(Number(p.pagibig_employee) > 0 ? [`  Pag-IBIG               ${money(p.pagibig_employee)}`] : []),
      ...(Number(p.tax_withheld) > 0 ? [`  Tax Withheld           ${money(p.tax_withheld)}`] : []),
      ...(Number(p.loans) > 0 ? [`  Loans                  ${money(p.loans)}`] : []),
      `  Total Deductions       ${money(p.total_deductions)}`,
      `${'─'.repeat(36)}`,
      `NET PAY                  ${money(p.net_pay)}`,
      `${'─'.repeat(36)}`,
      `${numberToWords(p.net_pay)}`,
      ``,
      `AstreaBlue HRIS — System Generated`,
    ];
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // user cancelled share sheet
    }
  }

  // Build earnings rows
  const earnings = [];
  if (Number(p.basic_salary) > 0) earnings.push({ label: 'Basic Salary', val: p.basic_salary });
  if (Number(p.overtime) > 0) earnings.push({ label: 'Overtime Pay', val: p.overtime });
  if (Number(p.holiday_pay) > 0) earnings.push({ label: 'Holiday Pay', val: p.holiday_pay });
  if (Number(p.taxable_allowances) > 0) earnings.push({ label: 'Taxable Allowances', val: p.taxable_allowances });
  if (Number(p.non_taxable_allowances) > 0) earnings.push({ label: 'Non-Taxable Allowances', val: p.non_taxable_allowances });
  (p.allowances || []).filter(a => Number(a.amount) > 0).forEach(a => earnings.push({ label: a.allowance_name || 'Allowance', val: a.amount }));
  if (Number(p.adj_comp) !== 0) earnings.push({ label: 'Adjustment', val: p.adj_comp });

  // Build deductions rows
  const deductions = [];
  if (Number(p.absence_deduction) > 0) deductions.push({ label: `Absences${p.absence_time ? ` (${p.absence_time}d)` : ''}`, val: p.absence_deduction });
  if (Number(p.late_deduction) > 0) deductions.push({ label: `Late${p.late_time ? ` (${p.late_time}m)` : ''}`, val: p.late_deduction });
  if (Number(p.undertime_deduction) > 0) deductions.push({ label: `Undertime${p.undertime ? ` (${p.undertime}m)` : ''}`, val: p.undertime_deduction });
  if (Number(p.sss_employee) > 0) deductions.push({ label: 'SSS', val: p.sss_employee });
  if (Number(p.philhealth_employee) > 0) deductions.push({ label: 'PhilHealth', val: p.philhealth_employee });
  if (Number(p.pagibig_employee) > 0) deductions.push({ label: 'Pag-IBIG', val: p.pagibig_employee });
  if (Number(p.gsis_employee) > 0) deductions.push({ label: 'GSIS', val: p.gsis_employee });
  if (Number(p.tax_withheld) > 0) deductions.push({ label: 'Tax Withheld', val: p.tax_withheld });
  if (Number(p.loans) > 0) deductions.push({ label: 'Loans', val: p.loans });
  if (Number(p.other_deductions) > 0) deductions.push({ label: 'Other Deductions', val: p.other_deductions });
  (p.deductions || []).filter(d => Number(d.amount) > 0).forEach(d => deductions.push({ label: d.deduction_name || 'Deduction', val: d.amount }));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.root}>
        {/* Top bar */}
        <View style={s.topBar}>
          <Text style={s.topBarTitle}>Payslip Preview</Text>
          <View style={s.topBarActions}>
            {payslip && (
              <TouchableOpacity style={s.shareBtn} onPress={sharePayslip} accessibilityLabel="Share payslip">
                <Ionicons name="share-outline" size={20} color="#1e40af" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.closeBtn} onPress={onClose} accessibilityLabel="Close payslip">
              <Ionicons name="close" size={20} color="#475569" />
            </TouchableOpacity>
          </View>
        </View>

        {loading && (
          <View style={s.center}>
            <ActivityIndicator size="large" color="#1e40af" />
            <Text style={s.loadingText}>Loading payslip…</Text>
          </View>
        )}
        {error ? (
          <View style={s.center}>
            <Ionicons name="alert-circle-outline" size={44} color="#b91c1c" />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        {payslip && (
          <ScrollView contentContainerStyle={s.sheet}>
            {/* ── Company Header ── */}
            <View style={s.companyHeader}>
              <Text style={s.companyName}>Astreablue Intelligence Inc.</Text>
              <Text style={s.companyAddr}>Unit 2004, Philippine AXA Life Centre 1286</Text>
              <Text style={s.companyAddr}>Sen. Gil Puyat (Buendia Ave.), Makati City</Text>
              <Text style={s.payslipTitle}>PAYSLIP</Text>
            </View>

            {/* ── Info Grid ── */}
            <View style={s.infoGrid}>
              <View style={s.infoCol}>
                <View style={s.infoRow}><Text style={s.infoLabel}>Date of Joining</Text><Text style={s.infoSep}>:</Text><Text style={s.infoVal}>{formatDate(p.date_hired)}</Text></View>
                <View style={s.infoRow}><Text style={s.infoLabel}>Pay Period</Text><Text style={s.infoSep}>:</Text><Text style={s.infoVal}>{p.payroll_range || '-'}</Text></View>
                <View style={s.infoRow}><Text style={s.infoLabel}>Status</Text><Text style={s.infoSep}>:</Text><Text style={s.infoVal}>{p.payroll_status || '-'}</Text></View>
              </View>
              <View style={s.infoCol}>
                <View style={s.infoRow}><Text style={s.infoLabel}>Employee Name</Text><Text style={s.infoSep}>:</Text><Text style={s.infoVal}>{fullName || '-'}</Text></View>
                <View style={s.infoRow}><Text style={s.infoLabel}>Position</Text><Text style={s.infoSep}>:</Text><Text style={s.infoVal}>{p.position || '-'}</Text></View>
                <View style={s.infoRow}><Text style={s.infoLabel}>Department</Text><Text style={s.infoSep}>:</Text><Text style={s.infoVal}>{p.department || '-'}</Text></View>
              </View>
            </View>

            {/* ── Earnings Table ── */}
            <View style={t.table}>
              <View style={t.head}>
                <Text style={t.headCell}>Earnings</Text>
                <Text style={[t.headCell, t.headRight]}>Amount</Text>
              </View>
              {earnings.map((e, i) => <TR key={i} label={e.label} amount={money(e.val)} />)}
              <TR label="Total Earnings" amount={money(p.gross_pay)} bold />
            </View>

            {/* ── Deductions Table ── */}
            <View style={[t.table, { marginTop: 12 }]}>
              <View style={t.head}>
                <Text style={t.headCell}>Deductions</Text>
                <Text style={[t.headCell, t.headRight]}>Amount</Text>
              </View>
              {deductions.map((d, i) => <TR key={i} label={d.label} amount={money(d.val)} />)}
              <TR label="Total Deductions" amount={money(p.total_deductions)} bold />
              <TR label="NET PAY" amount={money(p.net_pay)} bold />
            </View>

            {/* ── Amount in Words ── */}
            <View style={s.wordsBox}>
              <Text style={s.wordsAmount}>₱{money(p.net_pay)}</Text>
              <Text style={s.wordsText}>{numberToWords(p.net_pay)}</Text>
            </View>

            {/* ── Signatures ── */}
            <View style={s.sigRow}>
              <View style={s.sigBox}>
                <Text style={s.sigLabel}>Employer Signature</Text>
                <View style={s.sigLine} />
              </View>
              <View style={s.sigBox}>
                <Text style={s.sigLabel}>Employee Signature</Text>
                <View style={s.sigLine} />
              </View>
            </View>

            {/* ── Footer ── */}
            <Text style={s.footerNote}>This is a system generated payslip</Text>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// Table styles
const t = StyleSheet.create({
  table: { borderWidth: 1, borderColor: '#555', borderRadius: 4, overflow: 'hidden' },
  head: { flexDirection: 'row', backgroundColor: '#d9d9d9', borderBottomWidth: 1, borderBottomColor: '#555' },
  headCell: { flex: 1, fontSize: 14, fontWeight: '800', color: '#0f172a', padding: 8, textAlign: 'center' },
  headRight: { flex: 0, width: 110, borderLeftWidth: 1, borderLeftColor: '#555' },
  row: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#d1d5db' },
  rowBold: { backgroundColor: '#f9fafb' },
  label: { flex: 1, fontSize: 13, color: '#374151', padding: 6, paddingLeft: 10 },
  amount: { width: 110, fontSize: 13, color: '#374151', padding: 6, textAlign: 'right', paddingRight: 10, borderLeftWidth: 1, borderLeftColor: '#d1d5db' },
});

// Main styles
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f3f4f6' },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  topBarTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  topBarActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  shareBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  loadingText: { fontSize: 14, color: '#64748b' },
  errorText: { fontSize: 14, color: '#b91c1c', textAlign: 'center' },

  // Payslip sheet
  sheet: { padding: 16, paddingBottom: 40 },
  companyHeader: {
    backgroundColor: '#fff', borderWidth: 2, borderColor: '#9ca3ff',
    borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 14,
  },
  companyName: { fontSize: 16, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  companyAddr: { fontSize: 11, color: '#475569', textAlign: 'center', marginTop: 2 },
  payslipTitle: { fontSize: 18, fontWeight: '900', color: '#1e40af', marginTop: 10, letterSpacing: 2 },

  // Info grid
  infoGrid: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  infoCol: { flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  infoRow: { flexDirection: 'row', marginBottom: 5 },
  infoLabel: { fontSize: 11, color: '#64748b', flex: 1.2 },
  infoSep: { fontSize: 11, color: '#64748b', marginHorizontal: 4 },
  infoVal: { fontSize: 11, fontWeight: '600', color: '#0f172a', flex: 1.5 },

  // Amount in words
  wordsBox: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 12,
  },
  wordsAmount: { fontSize: 22, fontWeight: '900', color: '#1e40af', marginBottom: 4 },
  wordsText: { fontSize: 12, color: '#374151', textAlign: 'center', fontStyle: 'italic' },

  // Signatures
  sigRow: { flexDirection: 'row', gap: 20, marginTop: 24, marginBottom: 16 },
  sigBox: { flex: 1, alignItems: 'center' },
  sigLabel: { fontSize: 12, color: '#374151', marginBottom: 36, textAlign: 'center' },
  sigLine: { height: 2, width: '80%', backgroundColor: '#777' },

  footerNote: { textAlign: 'center', fontSize: 12, color: '#64748b', fontStyle: 'italic', marginTop: 8 },
});
