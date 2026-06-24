import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
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

  function buildPayslipHtml() {
    const m = (v) => Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const esc = (v) => String(v ?? '-').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const dash = (v) => Number(v) ? m(v) : '-';
    const fmtDate = (v) => {
      if (!v) return '-';
      const d = new Date(String(v).replace(' ', 'T'));
      return isNaN(d.getTime()) ? String(v)
        : d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payslip - ${esc(fullName)}</title>
  <style>
    @page { size: A5 portrait; margin: 14mm; }
    html, body { margin: 0; padding: 16px; background: #fff; color: #000; font-family: Arial, sans-serif; font-size: 12px; }
    .rule { border-top: 1.5px solid #000; margin: 6px 0; }
    .center { text-align: center; }
    .heavy { font-weight: 900; font-size: 14px; text-transform: uppercase; }
    .ps-title { font-size: 18px; font-weight: 900; letter-spacing: 4px; margin: 4px 0; }
    .info-tbl { width: 100%; border-collapse: collapse; margin: 6px 0; }
    .info-tbl td { padding: 2px 3px; font-size: 11px; }
    .il { font-weight: 700; min-width: 100px; white-space: nowrap; }
    .ic { padding: 0 6px; }
    .field-tbl { width: 100%; border-collapse: collapse; margin: 4px 0; }
    .field-tbl td { padding: 2px 3px; font-size: 11px; }
    .fv { text-align: right; font-weight: 700; }
    .cols-tbl { width: 100%; border-collapse: collapse; margin: 3px 0; font-size: 11px; }
    .cols-tbl td { padding: 2px 4px; }
    .ch { font-weight: 700; }
    .cc { text-align: center; width: 60px; }
    .cr { text-align: right; width: 80px; }
    .ind { padding-left: 16px !important; }
    .sh { font-weight: 700; font-size: 11px; margin: 4px 0 2px; }
    .box-tbl { width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin: 4px 0; font-size: 11px; }
    .box-tbl td { padding: 4px 8px; font-weight: 700; }
    .bv { text-align: right; width: 100px; border-left: 1px solid #666; }
    .net td { border-top: 1px solid #000; }
    .mt { margin-top: 8px; }
    .sig-row { display: flex; gap: 30px; margin-top: 30px; }
    .sig-box { flex: 1; text-align: center; font-size: 11px; }
    .sig-lbl { margin-bottom: 30px; }
    .sig-line { border-bottom: 1px solid #000; }
    .footer { text-align: center; font-size: 9px; color: #888; font-style: italic; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="rule"></div>
  <div class="center heavy">${esc(p.company || 'AstreaBlue Intelligence Inc.')}</div>
  <div class="center ps-title">P A Y S L I P</div>
  <div class="center">PAYROLL PERIOD COVERED : ${esc(p.payroll_range || '-')}</div>

  <table class="info-tbl">
    <tr><td class="il">EMPLOYEE</td><td class="ic">:</td><td>${esc(fullName)}</td></tr>
    <tr><td class="il">ID.</td><td class="ic">:</td><td>${esc(p.emp_code || '-')}</td></tr>
    <tr><td class="il">DEPARTMENT</td><td class="ic">:</td><td>${esc(p.department || '-')}</td></tr>
  </table>
  <div class="rule"></div>

  <table class="field-tbl">
    <tr><td>MONTHLY/DAILY [Basic + De Minimis]</td><td class="fv">${m(p.basic_salary)}</td></tr>
    <tr><td>TAX STATUS</td><td class="fv">${esc(p.tax_status || '-')}</td></tr>
  </table>

  <table class="cols-tbl">
    <thead><tr class="ch"><td>EARNINGS</td><td class="cc">Current</td><td class="cc">Adj.</td><td class="cr">Amount</td></tr></thead>
    <tbody>
      <tr><td class="ind">BASIC SALARY PAY</td><td class="cc">-</td><td class="cc">-</td><td class="cr">${m(p.gross_pay)}</td></tr>
    </tbody>
  </table>
  <table class="box-tbl">
    <tr><td>GROSS PAY</td><td class="bv">${m(p.gross_pay)}</td></tr>
  </table>

  <div class="sh">DEDUCTIONS</div>
  <table class="cols-tbl">
    <tbody>
      <tr><td class="ind">Absences</td><td class="cc">-</td><td class="cc">-</td><td class="cr">${dash(p.absence_deduction)}</td></tr>
      <tr><td class="ind">Tardiness</td><td class="cc">-</td><td class="cc">-</td><td class="cr">${dash(p.late_deduction)}</td></tr>
      <tr><td class="ind">Undertime</td><td class="cc">-</td><td class="cc">-</td><td class="cr">${dash(p.undertime_deduction)}</td></tr>
      <tr><td class="ind">SSS Premium</td><td class="cc">${m(p.sss_employee)}</td><td class="cc">-</td><td class="cr">${m(p.sss_employee)}</td></tr>
      <tr><td class="ind">Philhealth</td><td class="cc">${m(p.philhealth_employee)}</td><td class="cc">-</td><td class="cr">${m(p.philhealth_employee)}</td></tr>
      <tr><td class="ind">Pag-Ibig</td><td class="cc">${m(p.pagibig_employee)}</td><td class="cc">-</td><td class="cr">${m(p.pagibig_employee)}</td></tr>
      <tr><td class="ind">TAX WITHHELD</td><td class="cc">${m(p.tax_withheld)}</td><td class="cc">-</td><td class="cr">${m(p.tax_withheld)}</td></tr>
      <tr><td class="ind">Loan Deductions</td><td class="cc">-</td><td class="cc">-</td><td class="cr">${dash(p.loans)}</td></tr>
    </tbody>
  </table>
  <table class="box-tbl">
    <tr><td>TOTAL DEDUCTIONS</td><td class="bv">${m(p.total_deductions)}</td></tr>
    <tr class="net"><td>NET PAY</td><td class="bv">${m(p.net_pay)}</td></tr>
  </table>

  <table class="box-tbl mt">
    <tr><td>TAXABLE GROSS INCOME TO-DATE</td><td class="bv">${m(p.taxable_gross_income_to_date || p.gross_pay)}</td></tr>
    <tr><td>WITHHOLDING TAX TO-DATE</td><td class="bv">${m(p.withholding_tax_to_date || p.tax_withheld)}</td></tr>
  </table>
  <div class="rule"></div>

  <div class="sig-row">
    <div class="sig-box"><div class="sig-lbl">Employer Signature</div><div class="sig-line"></div></div>
    <div class="sig-box"><div class="sig-lbl">Employee Signature</div><div class="sig-line"></div></div>
  </div>
  <div class="footer">This is a system generated payslip</div>
</body>
</html>`;
  }

  async function downloadPayslip() {
    if (!payslip) return;
    const empCode = p.emp_code || 'employee';
    const date = new Date().toISOString().slice(0, 10);
    const filename = `payslip-${empCode}-${date}.html`;
    const html = buildPayslipHtml();

    try {
      if (Platform.OS === 'android') {
        const perms = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!perms.granted) return;
        const uri = await FileSystem.StorageAccessFramework.createFileAsync(
          perms.directoryUri, filename, 'text/html'
        );
        await FileSystem.writeAsStringAsync(uri, html, { encoding: FileSystem.EncodingType.UTF8 });
        Alert.alert('Downloaded', `Payslip saved as "${filename}".`);
      } else {
        const fileUri = FileSystem.documentDirectory + filename;
        await FileSystem.writeAsStringAsync(fileUri, html, { encoding: FileSystem.EncodingType.UTF8 });
        Alert.alert('Downloaded', `Payslip saved as "${filename}".\nFind it in the Files app under this app's folder.`);
      }
    } catch {
      Alert.alert('Error', 'Could not save the payslip. Please try again.');
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
              <TouchableOpacity style={s.downloadBtn} onPress={downloadPayslip} accessibilityLabel="Download payslip">
                <Ionicons name="download-outline" size={20} color="#1e40af" />
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
  downloadBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
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
