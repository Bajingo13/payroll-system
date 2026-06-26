import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const FILTER_CATS = [
  ['company','Company'], ['location','Location'], ['branch','Branch'],
  ['division','Division'], ['department','Department'], ['class','Class'],
  ['position','Position'], ['employee_type','Employee Type','empType'],
  ['salary_type','Salary Type','salaryType'],
];

const OT_TYPES = [
  { key:'rg', label:'Regular' }, { key:'rd', label:'Rest Day' },
  { key:'sd', label:'Special Day' }, { key:'sdrd', label:'Sp. Day Rest Day' },
  { key:'hd', label:'Holiday' }, { key:'hdrd', label:'Holiday Rest Day' },
];

const OT_ADJ_ROWS = [
  { key:'rg_rate', label:'RG RATE', rate:'1.00%' },
  { key:'rg_ot', label:'RG OT', rate:'1.25%' },
  { key:'rd_rate', label:'RD RATE', rate:'1.30%' },
  { key:'rd_ot', label:'RD OT', rate:'1.69%' },
  { key:'sd_rate', label:'SD RATE', rate:'0.30%' },
  { key:'sd_ot', label:'SD OT', rate:'1.69%' },
  { key:'sdrd_rate', label:'SDRD RATE', rate:'1.50%' },
  { key:'sdrd_ot', label:'SDRD OT', rate:'1.95%' },
  { key:'hd_rate', label:'HD RATE', rate:'1.00%' },
  { key:'hd_ot', label:'HD OT', rate:'2.60%' },
  { key:'hdrd_rate', label:'HDRD RATE', rate:'2.60%' },
  { key:'hdrd_ot', label:'HDRD OT', rate:'3.38%' },
];

const ND_ADJ_ROWS = [
  { key:'rg_rate', label:'RG ND', baseRate:'1.00%' },
  { key:'rg_ot', label:'RG OTND', baseRate:'1.25%' },
  { key:'rd_rate', label:'RD ND', baseRate:'1.30%' },
  { key:'rd_ot', label:'RD OTND', baseRate:'1.69%' },
  { key:'sd_rate', label:'SD ND', baseRate:'1.30%' },
  { key:'sd_ot', label:'SD OTND', baseRate:'1.69%' },
  { key:'sdrd_rate', label:'SDRD ND', baseRate:'1.50%' },
  { key:'sdrd_ot', label:'SDRD OTND', baseRate:'1.95%' },
  { key:'hd_rate', label:'HD ND', baseRate:'2.00%' },
  { key:'hd_ot', label:'HD OTND', baseRate:'2.60%' },
  { key:'hdrd_rate', label:'HDRD ND', baseRate:'2.60%' },
  { key:'hdrd_ot', label:'HDRD OTND', baseRate:'3.38%' },
];

const ATT_ROWS = [
  { key:'basic_salary', label:'Basic Salary', hasTime:true },
  { key:'absences',     label:'Absences',     hasTime:true },
  { key:'late',         label:'Late',          hasTime:true },
  { key:'undertime',    label:'Undertime',     hasTime:true },
  { key:'others',       label:'Others',        hasTime:false },
];

const PREM_ROWS = [
  { key:'gsis', label:'GSIS' }, { key:'sss', label:'SSS' },
  { key:'pagibig', label:'Pag-ibig' }, { key:'philhealth', label:'Philhealth' },
];

function toNum(v) { const n = Number(v||0); return isFinite(n)?n:0; }
function fmt(v)   { return toNum(v).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function getCalendarMonthEndDay(monthValue, yearValue) {
  const month = parseInt(monthValue, 10);
  const year = parseInt(yearValue, 10);

  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    return 30;
  }

  return new Date(year, month, 0).getDate();
}

function getCalendarMonthNumber(monthRow) {
  const names = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const byName = names.indexOf(String(monthRow?.month_name || '').trim().toLowerCase()) + 1;
  if (byName) return byName;
  const byId = parseInt(monthRow?.month_id, 10);
  if (Number.isInteger(byId) && byId >= 1 && byId <= 12) return byId;
  return 0;
}

function getPayrollPeriodBounds(periodRow, monthRow, yearValue) {
  const month = getCalendarMonthNumber(monthRow);
  const year = parseInt(yearValue, 10);
  if (!periodRow || !month || !Number.isInteger(year)) return { start: '', end: '' };

  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  const periodName = String(periodRow.period_name || '').toLowerCase();

  if (periodName.includes('week')) {
    if (periodName.includes('1st')) return { start: `${year}-${mm}-01`, end: `${year}-${mm}-07` };
    if (periodName.includes('2nd')) return { start: `${year}-${mm}-08`, end: `${year}-${mm}-14` };
    if (periodName.includes('3rd')) return { start: `${year}-${mm}-15`, end: `${year}-${mm}-21` };
    return { start: `${year}-${mm}-22`, end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
  }

  if (periodName.includes('first') || periodName.includes('1st')) {
    return { start: `${year}-${mm}-01`, end: `${year}-${mm}-15` };
  }
  if (periodName.includes('second') || periodName.includes('2nd')) {
    return { start: `${year}-${mm}-16`, end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
  }

  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

function parseTimeToMinutes(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value ?? '').trim();
  if (!text) return 0;
  if (text.includes(':')) {
    const [hours, minutes = '0'] = text.split(':');
    return Math.max(0, (Number(hours) || 0) * 60 + (Number(minutes) || 0));
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatMinutesToTime(value) {
  const total = Math.max(0, Math.round(parseTimeToMinutes(value)));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(3, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeAdjustmentTimes(data = {}) {
  const next = { ...data };
  Object.keys(next).forEach((key) => {
    if (key.endsWith('_time')) next[key] = parseTimeToMinutes(next[key]);
  });
  return next;
}

function sumAllowanceRows(rows = []) {
  return rows.reduce((acc, row) => {
    if (Number(row.is_taxable) === 1) acc.taxable += toNum(row.amount);
    else acc.nontaxable += toNum(row.amount);
    return acc;
  }, { taxable: 0, nontaxable: 0 });
}

function effectiveAllowanceTotals(payroll, rows = []) {
  const rowTotals = sumAllowanceRows(rows);
  return {
    taxable: rows.length ? rowTotals.taxable : toNum(payroll.taxable_allowances),
    nontaxable: rows.length ? rowTotals.nontaxable : toNum(payroll.non_taxable_allowances)
  };
}

function effectiveDeductionTotal(payroll, rows = []) {
  return rows.length ? rows.reduce((sum, row) => sum + toNum(row.amount), 0) : toNum(payroll.total_deductions);
}

function makeEmptyPayroll() {
  return {
    basic_salary:'', absence_time:'', absence_deduction:'',
    late_time:'', late_deduction:'', undertime:'', undertime_deduction:'',
    overtime:'', holiday_pay:'', taxable_allowances:'', non_taxable_allowances:'',
    adj_comp:'', adj_non_comp:'', total_leaves_used:'',
    gsis_employee:'', gsis_employer:'', gsis_ecc:'',
    sss_employee:'', sss_employer:'', sss_ecc:'',
    pagibig_employee:'', pagibig_employer:'', pagibig_ecc:'',
    philhealth_employee:'', philhealth_employer:'', philhealth_ecc:'',
    tax_withheld:'', total_deductions:'', loans:'', other_deductions:'', premium_adj:'',
    ytd_sss:'', ytd_wtax:'', ytd_philhealth:'', ytd_gsis:'', ytd_pagibig:'', ytd_gross:'',
    payroll_status:'Active',
  };
}

function makeEmptyOtNd() {
  const d={};
  OT_TYPES.forEach(({key}) => {
    d[`${key}_rate`]=''; d[`${key}_ot`]='';
    d[`${key}_rate_nd`]=''; d[`${key}_ot_nd`]='';
    d[`${key}_rate_time`]=''; d[`${key}_ot_time`]='';
    d[`${key}_rate_nd_time`]=''; d[`${key}_ot_nd_time`]='';
  });
  return d;
}

function makeEmptyOtNdAdj() {
  const d={};
  OT_TYPES.forEach(({key}) => {
    d[`ot_adj_${key}_rate`]=''; d[`ot_adj_${key}_ot`]='';
    d[`nd_adj_${key}_rate`]=''; d[`nd_adj_${key}_ot`]='';
    d[`ot_adj_${key}_rate_time`]=''; d[`ot_adj_${key}_ot_time`]='';
    d[`nd_adj_${key}_rate_time`]=''; d[`nd_adj_${key}_ot_time`]='';
  });
  return d;
}

function makeEmptyAttAdj() {
  const d={ tax_withheld:'' };
  ATT_ROWS.forEach(({key,hasTime}) => {
    if(hasTime) d[`${key}_time`]='';
    d[`${key}_amt`]='';
  });
  PREM_ROWS.forEach(({key}) => {
    d[`${key}_emp`]=''; d[`${key}_employer`]=''; d[`${key}_ecc`]='';
  });
  return d;
}

function makeEmptyLeaveRows() {
  return Array.from({length: 8}, () => ({ leave_type_id: '', used: '', amount: '' }));
}

function dateKey(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function inclusiveDays(startDate, endDate) {
  const start = new Date(`${dateKey(startDate)}T12:00:00Z`);
  const end = new Date(`${dateKey(endDate)}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

function getHrisPeriodRange(hrisData) {
  const [start = '', end = ''] = String(hrisData?.period_range || '').split(' to ');
  return { start: dateKey(start), end: dateKey(end) };
}

function buildPeriodLeaveRows(hrisData, basicSalary = 0, leaveBalances = []) {
  const requests = hrisData?.absences?.requests || [];
  const { start: periodStart, end: periodEnd } = getHrisPeriodRange(hrisData);
  const dailyRate = toNum(basicSalary) / 26;
  const grouped = new Map();

  leaveBalances.forEach((balance) => {
    if (!balance.leave_type_id) return;
    grouped.set(String(balance.leave_type_id), {
      leave_type_id: String(balance.leave_type_id),
      used: '',
      amount: ''
    });
  });

  if (!periodStart || !periodEnd) {
    const rows = Array.from(grouped.values());
    while (rows.length < 8) rows.push({ leave_type_id: '', used: '', amount: '' });
    return rows;
  }

  requests.forEach((request) => {
    const leaveTypeId = request.leave_type_id;
    const requestStart = dateKey(request.start_date);
    const requestEnd = dateKey(request.end_date);
    if (!leaveTypeId || !requestStart || !requestEnd) return;

    const clippedStart = requestStart > periodStart ? requestStart : periodStart;
    const clippedEnd = requestEnd < periodEnd ? requestEnd : periodEnd;
    const used = inclusiveDays(clippedStart, clippedEnd);
    if (used <= 0) return;

    const key = String(leaveTypeId);
    const current = grouped.get(key) || { leave_type_id: key, used: 0, amount: 0 };
    current.used = toNum(current.used) + used;
    current.amount = Math.round(current.used * dailyRate * 100) / 100;
    grouped.set(key, current);
  });

  const rows = Array.from(grouped.values());
  while (rows.length < 8) rows.push({ leave_type_id: '', used: '', amount: '' });
  return rows;
}

function applyContributionRows(payroll, contributions = []) {
  const next = { ...payroll };
  // contribution_type_id 4 is Withholding Tax (WTax) and only has an employee-side
  // amount, which feeds tax_withheld directly — it is not GSIS.
  const map = {
    1: ['sss_employee', 'sss_employer', 'sss_ecc'],
    2: ['pagibig_employee', 'pagibig_employer', 'pagibig_ecc'],
    3: ['philhealth_employee', 'philhealth_employer', 'philhealth_ecc'],
    4: ['tax_withheld']
  };

  contributions.forEach((contribution) => {
    if (Number(contribution.enabled) === 0) return;
    const fields = map[Number(contribution.contribution_type_id)];
    if (!fields) return;
    const [employeeField, employerField, eccField] = fields;
    if (!toNum(next[employeeField])) next[employeeField] = toNum(contribution.ee_share);
    if (employerField && !toNum(next[employerField])) next[employerField] = toNum(contribution.er_share);
    if (eccField && !toNum(next[eccField])) next[eccField] = toNum(contribution.ecc);
  });

  return next;
}

async function computePayrollDeductions(payroll, rec = {}, allowances = [], deductions = []) {
  const allowanceTotals = effectiveAllowanceTotals(payroll, allowances);
  const deductionTotal = effectiveDeductionTotal(payroll, deductions);
  const { data } = await api.post('/payroll/auto-compute', {
    basic_salary: toNum(payroll.basic_salary),
    absence_deduction: toNum(payroll.absence_deduction),
    late_deduction: toNum(payroll.late_deduction),
    undertime_deduction: toNum(payroll.undertime_deduction),
    overtime: toNum(payroll.overtime),
    holiday_pay: toNum(payroll.holiday_pay),
    taxable_allowances: allowanceTotals.taxable,
    non_taxable_allowances: allowanceTotals.nontaxable,
    adj_comp: toNum(payroll.adj_comp),
    adj_non_comp: toNum(payroll.adj_non_comp),
    total_leaves_used: toNum(payroll.total_leaves_used),
    total_deductions: deductionTotal,
    loans: toNum(payroll.loans),
    other_deductions: toNum(payroll.other_deductions),
    premium_adj: toNum(payroll.premium_adj),
    payroll_period: rec.payroll_period || '',
    tax_status: rec.tax_status || 'Z',
    gsis_no: rec.gsis_no || '',
    is_government_employee: Boolean(rec.gsis_no)
  });
  return data?.success ? data : null;
}

export default function PayrollComputationPage() {
  const { user } = useAuth();

  const [step, setStep]   = useState('setup');
  const [meta, setMeta]   = useState({ payrollGroups:[], payrollPeriods:[], payrollMonths:[], payrollYears:[] });
  const [lists, setLists] = useState({});
  const currentMonthId = String(new Date().getMonth() + 1);
  const currentDay = new Date().getDate();
  const [filters, setFilters] = useState({
    payroll_group:'2', payroll_period:currentDay <= 15 ? 5 : 6, month:currentMonthId, year:'',
    option:'active',
    company:'', location:'', branch:'', division:'', department:'',
    class:'', position:'', empType:'', salaryType:'',
  });

  const [runId, setRunId]             = useState(null);
  const [employees, setEmployees]     = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [activeTab, setActiveTab]     = useState('payroll');
  const [isEditing, setIsEditing]     = useState(false);

  const [payroll, setPayroll]   = useState(makeEmptyPayroll);
  const [otNd, setOtNd]         = useState(makeEmptyOtNd);
  const [otNdAdj, setOtNdAdj]   = useState(makeEmptyOtNdAdj);
  const [attAdj, setAttAdj]     = useState(makeEmptyAttAdj);
  const [allowances, setAllowances] = useState([]);
  const [allowanceTypes, setAllowanceTypes] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [deductionTypes, setDeductionTypes] = useState([]);
  const [empDataMap, setEmpDataMap] = useState({});

  const [showEmpModal, setShowEmpModal]       = useState(false);
  const [availableEmps, setAvailableEmps]     = useState([]);
  const [selectedForModal, setSelectedForModal] = useState(new Set());
  const [modalSelectMode, setModalSelectMode] = useState('');
  const [modalSearch, setModalSearch]         = useState('');
  const [modalSearchBy, setModalSearchBy]     = useState('employee_id');
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [pendingAddEmps, setPendingAddEmps]   = useState([]);
  const [pendingAddRunId, setPendingAddRunId] = useState(null);
  const [incompleteAction, setIncompleteAction] = useState('proceed');
  const [showSaveModal, setShowSaveModal]     = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showBackModal, setShowBackModal]     = useState(false);

  const [hrisData, setHrisData]       = useState(null);
  const [hrisLoading, setHrisLoading] = useState(false);

  const [empLoans, setEmpLoans]         = useState([]);
  const [loansLoading, setLoansLoading] = useState(false);
  const [empLeaveData, setEmpLeaveData] = useState({ leaveBalances: [], leaveRequests: [] });
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [leaveRows, setLeaveRows] = useState(makeEmptyLeaveRows);
  const [loanRows, setLoanRows]         = useState([]);
  const [selectedLoanRow, setSelectedLoanRow] = useState(null);
  const [otherDedRows, setOtherDedRows] = useState([]);
  const [selectedDedRow, setSelectedDedRow]   = useState(null);

  const [searchBy, setSearchBy]       = useState('employee_id');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading]         = useState(false);
  const [toast, setToast]             = useState('');
  const [toastType, setToastType]     = useState('success');
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [yearInputText, setYearInputText]   = useState('');
  const yearPickerRef = useRef(null);

  const selectedPeriod = meta.payrollPeriods.find(p => String(p.period_id) === String(filters.payroll_period));
  const selectedMonth  = meta.payrollMonths.find(m => String(m.month_id)   === String(filters.month));
  const selectedYear   = meta.payrollYears.find(y  => String(y.year_id) === String(filters.year) || y.year_value === String(filters.year));
  const yearLabel      = selectedYear?.year_value || (/^\d{4}$/.test(String(filters.year)) ? String(filters.year) : '');
  const payrollPeriodBounds = getPayrollPeriodBounds(selectedPeriod, selectedMonth, yearLabel);
  const payrollRange   = (() => {
    if (!selectedPeriod || !selectedMonth) return '';
    const periodName = selectedPeriod.period_name?.toLowerCase() || '';
    const monthName = selectedMonth.month_name || '';
    const lastDay = getCalendarMonthEndDay(selectedMonth.month_id, yearLabel);
    
    // For weekly periods
    if (periodName.includes('week')) {
      return `${monthName} (${selectedPeriod.period_name}), ${yearLabel}`;
    }
    
    // For semi-monthly periods (check first and second without "week")
    if (periodName.includes('first') || periodName.includes('1st half')) {
      return `${monthName} 1-15, ${yearLabel}`;
    }
    if (periodName.includes('second') || periodName.includes('2nd half')) {
      return `${monthName} 16-${lastDay}, ${yearLabel}`;
    }
    
    // For monthly periods
    if (periodName.includes('monthly')) {
      return `${monthName} 1-${lastDay}, ${yearLabel}`;
    }
    
    // Default format
    return [selectedPeriod.period_name, monthName, yearLabel].filter(Boolean).join(' ');
  })();
  const periodReady    = Boolean(filters.payroll_group && filters.payroll_period && filters.month && filters.year);

  const allowanceTotals = useMemo(() => effectiveAllowanceTotals(payroll, allowances), [payroll, allowances]);
  const deductionRowsTotal = useMemo(() => effectiveDeductionTotal(payroll, deductions), [payroll, deductions]);
  const totals = useMemo(() => {
    const gross =
      toNum(payroll.basic_salary) - toNum(payroll.absence_deduction) -
      toNum(payroll.late_deduction) - toNum(payroll.undertime_deduction) +
      toNum(payroll.overtime) + allowanceTotals.taxable +
      allowanceTotals.nontaxable + toNum(payroll.adj_comp) +
      toNum(payroll.adj_non_comp) + toNum(payroll.total_leaves_used);
    const ded =
      toNum(payroll.gsis_employee) + toNum(payroll.sss_employee) +
      toNum(payroll.pagibig_employee) + toNum(payroll.philhealth_employee) +
      toNum(payroll.tax_withheld) + deductionRowsTotal +
      toNum(payroll.loans) + toNum(payroll.other_deductions) + toNum(payroll.premium_adj);
    return { gross, ded, net: gross - ded };
  }, [payroll, allowanceTotals, deductionRowsTotal]);

  const filteredEmps = useMemo(() => {
    if (!searchInput) return employees;
    const q = searchInput.toLowerCase();
    return employees.filter(e => {
      if (searchBy === 'employee_id') return (e.emp_code||'').toLowerCase().includes(q);
      if (searchBy === 'last_name')   return (e.last_name||'').toLowerCase().includes(q);
      if (searchBy === 'first_name')  return (e.first_name||'').toLowerCase().includes(q);
      return true;
    });
  }, [employees, searchInput, searchBy]);

  const filteredModalEmps = useMemo(() => {
    if (!modalSearch) return availableEmps;
    const q = modalSearch.toLowerCase();
    return availableEmps.filter(e => {
      if (modalSearchBy === 'employee_id') return (e.emp_code||'').toLowerCase().includes(q);
      if (modalSearchBy === 'last_name')   return (e.last_name||'').toLowerCase().includes(q);
      if (modalSearchBy === 'first_name')  return (e.first_name||'').toLowerCase().includes(q);
      return true;
    });
  }, [availableEmps, modalSearch, modalSearchBy]);

  useEffect(() => {
    if (!showYearPicker) return;
    const handle = e => { if (yearPickerRef.current && !yearPickerRef.current.contains(e.target)) setShowYearPicker(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showYearPicker]);

  useEffect(() => {
    async function load() {
      const { data } = await api.get('/payroll_periods');
      const p = data.data || {};
      setMeta({
        payrollGroups: p.payrollGroups || [],
        payrollPeriods: p.payrollPeriods || [],
        payrollMonths: p.payrollMonths || [],
        payrollYears: p.payrollYears || [],
      });
      // Auto-fill year with current year (prefer matching payrollYears entry)
      try {
        const nowYear = String(new Date().getFullYear());
        const found = (p.payrollYears || []).find(y => String(y.year_value) === nowYear);
        if (found) {
          setFilters(f => ({ ...f, year: found.year_id }));
          setYearInputText(String(found.year_value));
        } else {
          setFilters(f => ({ ...f, year: nowYear }));
          setYearInputText(nowYear);
        }
      } catch (e) {
        // non-fatal
      }
      const entries = await Promise.all(FILTER_CATS.map(async ([cat]) => {
        const { data:d } = await api.get(`/system_lists/${cat}`);
        return [cat, d || []];
      }));
      setLists(Object.fromEntries(entries));
      const { data: allowanceTypeRows } = await api.get('/allowances').catch(() => ({ data: [] }));
      setAllowanceTypes(Array.isArray(allowanceTypeRows) ? allowanceTypeRows : []);
      const { data: deductionTypeRows } = await api.get('/deductions').catch(() => ({ data: [] }));
      setDeductionTypes(Array.isArray(deductionTypeRows) ? deductionTypeRows : []);
    }
    load().catch(err => flash(getApiMessage(err,'Failed to load data.'),'warning'));
  }, []);

  function flash(msg, type='success') {
    setToast(msg); setToastType(type);
    setTimeout(() => setToast(''), 3500);
  }
  function upFilter(k,v) { setFilters(f=>({...f,[k]:v})); }
  function upPayroll(k,v) { setPayroll(p=>({...p,[k]:v})); }
  function upOtNd(k,v)    { setOtNd(p=>({...p,[k]:v})); }
  function upOtNdAdj(k,v) { setOtNdAdj(p=>({...p,[k]:v})); }
  function upAttAdj(k,v)  { setAttAdj(p=>({...p,[k]:v})); }
  function addLoanRow() {
    setLoanRows(prev => [...prev, { description:'', loan_amount:'', amortization:'', date_start:'', date_end:'', balance:'', skip:false, payment:'' }]);
  }
  
  function handlePayrollGroupChange(value) {
    setFilters(f => ({
      ...f,
      payroll_group: value,
      payroll_period: '',   // clear period when group changes
    }));
  }

  useEffect(() => {
    async function loadPeriodsByGroup() {
      if (!filters.payroll_group) {
        setMeta(prev => ({ ...prev, payrollPeriods: [] }));
        return;
      }

      const { data } = await api.get('/payroll_periods', {
        params: { groupId: filters.payroll_group }
      });

      const p = data.data || {};
      // If the selected payroll group is exactly 'Monthly' (case-insensitive),
      // replace the periods with a single Monthly option and auto-select it.
      const group = meta.payrollGroups.find(g => String(g.group_id) === String(filters.payroll_group));
      const gname = (group?.group_name || '').toLowerCase();
      if (gname === 'monthly') {
        const monthlyOption = { period_id: 'monthly', period_name: 'Monthly' };
        setMeta(prev => ({ ...prev, payrollPeriods: [monthlyOption] }));
        setFilters(f => ({ ...f, payroll_period: monthlyOption.period_id }));
      } else {
        setMeta(prev => ({ ...prev, payrollPeriods: p.payrollPeriods || [] }));
      }
    }

    loadPeriodsByGroup().catch(err =>
      flash(getApiMessage(err, 'Failed to load payroll periods.'), 'warning')
    );
  }, [filters.payroll_group]);

  function deleteLoanRow() {
    if (selectedLoanRow === null) return;
    setLoanRows(prev => {
      const next = prev.filter((_, i) => i !== selectedLoanRow);
      const total = next.filter(r=>!r.skip).reduce((s,r)=>s+toNum(r.payment),0);
      setPayroll(p=>({...p, loans: total.toFixed(2)}));
      return next;
    });
    setSelectedLoanRow(null);
  }
  function upLoanRow(i, field, value) {
    setLoanRows(prev => {
      const next = prev.map((r,idx)=>idx===i?{...r,[field]:value}:r);
      const total = next.filter(r=>!r.skip).reduce((s,r)=>s+toNum(r.payment),0);
      setPayroll(p=>({...p, loans: total.toFixed(2)}));
      return next;
    });
  }
  function addDedRow() {
    setOtherDedRows(prev => [...prev, { description:'', employee_share:'', employer_share:'', date_start:'', date_end:'', skip:false }]);
  }
  function deleteDedRow() {
    if (selectedDedRow === null) return;
    setOtherDedRows(prev => {
      const next = prev.filter((_, i) => i !== selectedDedRow);
      const total = next.filter(r=>!r.skip).reduce((s,r)=>s+toNum(r.employee_share),0);
      setPayroll(p=>({...p, other_deductions: total.toFixed(2)}));
      return next;
    });
    setSelectedDedRow(null);
  }
  function upDedRow(i, field, value) {
    setOtherDedRows(prev => {
      const next = prev.map((r,idx)=>idx===i?{...r,[field]:value}:r);
      const total = next.filter(r=>!r.skip).reduce((s,r)=>s+toNum(r.employee_share),0);
      setPayroll(p=>({...p, other_deductions: total.toFixed(2)}));
      return next;
    });
  }
  function upLeaveRow(i, field, value) {
    const dailyRate = toNum(payroll.basic_salary) / 26;
    setLeaveRows(prev => {
      const next = prev.map((r, idx) => idx === i ? {...r, [field]: value} : r);
      if (field === 'used') {
        next[i] = {...next[i], amount: parseFloat((toNum(value) * dailyRate).toFixed(2))};
      }
      const total = next.reduce((s, r) => s + toNum(r.amount), 0);
      setPayroll(p => ({...p, total_leaves_used: total.toFixed(2)}));
      return next;
    });
  }

  function getAllowanceTypeOptions(taxable) {
    return allowanceTypes.filter(type => taxable ? Number(type.taxable) === 1 : Number(type.taxable) !== 1);
  }

  function updateAllowanceSlot(taxable, slotIndex, field, value) {
    setAllowances(prev => {
      const next = [...prev];
      let index = findAllowanceIndexBySlotInRows(prev, taxable, slotIndex);

      if (field === 'allowance_type_id') {
        if (!value) {
          if (index >= 0) next.splice(index, 1);
          return next;
        }
        const option = allowanceTypes.find(type => String(type.id) === String(value));
        const row = {
          ...(index >= 0 ? next[index] : {}),
          emp_allowance_id: index >= 0 ? next[index].emp_allowance_id : null,
          source_emp_allowance_id: index >= 0 ? next[index].source_emp_allowance_id : null,
          allowance_type_id: value,
          allowance_name: option?.name || '',
          is_taxable: taxable ? 1 : 0,
          amount: index >= 0 ? next[index].amount : toNum(option?.amount).toFixed(2),
          period: index >= 0 ? next[index].period : (selectedPeriod?.period_name || ''),
          input_days: index >= 0 ? next[index].input_days : '00:00:00'
        };
        if (index >= 0) next[index] = row;
        else next.push(row);
        return next;
      }

      if (index < 0) return next;
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function findAllowanceIndexBySlotInRows(rows, taxable, slotIndex) {
    let count = 0;
    for (let index = 0; index < rows.length; index++) {
      const isTaxable = Number(rows[index].is_taxable) === 1;
      if (taxable ? isTaxable : !isTaxable) {
        if (count === slotIndex) return index;
        count++;
      }
    }
    return -1;
  }

  function updateDeductionSlot(slotIndex, field, value) {
    setDeductions(prev => {
      const next = [...prev];
      const index = slotIndex < next.length ? slotIndex : -1;

      if (field === 'deduction_type_id') {
        if (!value) {
          if (index >= 0) next.splice(index, 1);
          return next;
        }

        const option = deductionTypes.find(type => String(type.id) === String(value));
        const row = {
          ...(index >= 0 ? next[index] : {}),
          emp_deduction_id: index >= 0 ? next[index].emp_deduction_id : null,
          source_emp_deduction_id: index >= 0 ? next[index].source_emp_deduction_id : null,
          deduction_type_id: value,
          deduction_name: option?.name || '',
          amount: index >= 0 ? next[index].amount : toNum(option?.amount).toFixed(2),
          period: index >= 0 ? next[index].period : (selectedPeriod?.period_name || '')
        };

        if (index >= 0) next[index] = row;
        else next.push(row);
        return next;
      }

      if (index < 0) return next;
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  async function loadRunEmployees(rid) {
    const { data } = await api.get('/employees_for_payroll_run', {
      params: {
        run_id:rid, status:filters.option,
        company:filters.company||'', location:filters.location||'',
        branch:filters.branch||'', division:filters.division||'',
        department:filters.department||'', class:filters.class||'',
        position:filters.position||'', empType:filters.empType||'',
        salaryType:filters.salaryType||'',
      }
    });
    setEmployees(data.employees || []);
  }

  async function openEmpModal() {
    try {
      const { missing } = await getPayrollRunEmployeeState(runId);
      if (!missing.length) {
        flash('There are no employees to be selected for this payroll run.','warning');
        return;
      }
      openEmployeeSelection(runId, missing);
    } catch(err) {
      flash(getApiMessage(err,'Failed to load employees.'),'warning');
    }
  }

  function openEmployeeSelection(rid, employeesToAdd) {
    setAvailableEmps(employeesToAdd);
    setSelectedForModal(new Set());
    setModalSelectMode('');
    setModalSearch('');
    setPendingAddRunId(rid);
    setShowIncompleteModal(false);
    setShowEmpModal(true);
  }

  async function getPayrollRunEmployeeState(rid) {
    const selectedGrp = meta.payrollGroups.find(g => String(g.group_id) === String(filters.payroll_group));
    const [{ data:empCheck }, { data:empData }] = await Promise.all([
      rid
        ? api.get(`/payroll_runs/${rid}/employees`)
        : Promise.resolve({ data: { employees: [] } }),
      api.get('/employees_for_payroll', {
        params: {
          option:'active',
          company:filters.company||'', location:filters.location||'',
          branch:filters.branch||'', division:filters.division||'',
          department:filters.department||'', class:filters.class||'',
          position:filters.position||'', empType:filters.empType||'',
          salaryType:filters.salaryType||'', payroll_period: selectedGrp?.group_name || '',
          period_start: payrollPeriodBounds.start || '',
          period_end: payrollPeriodBounds.end || ''
        }
      })
    ]);
    const existingRunEmpIds = new Set((empCheck.employees || []).map(emp => String(emp.employee_id)));
    const missing = (empData.employees || []).filter(emp => !existingRunEmpIds.has(String(emp.employee_id)));
    return { existing: empCheck.employees || [], missing };
  }

  async function proceedToComputation() {
    if (!periodReady) { flash('Select Payroll Group, Period, Month, and Year first.','warning'); return; }
    setLoading(true);
    try {
      setSelectedEmp(null);
      setHrisData(null);
      setEmpDataMap({});
      setPayroll(makeEmptyPayroll());
      setLeaveRows(makeEmptyLeaveRows());
      setLoanRows([]);
      setOtherDedRows([]);
      const selectedGrp = meta.payrollGroups.find(g => String(g.group_id) === String(filters.payroll_group));
      const selectedPer = meta.payrollPeriods.find(p => String(p.period_id) === String(filters.payroll_period));
      const selectedMon = meta.payrollMonths.find(m => String(m.month_id) === String(filters.month));
      const selectedYear = meta.payrollYears?.find(y => String(y.year_id) === String(filters.year));
      const { data:runData } = await api.post('/payroll_runs', {
        group_id:(selectedGrp?.group_name||'').toLowerCase(), period_id:(selectedPer?.period_name||'').toLowerCase(),
        month_id: selectedMon?.month_id, year_id: selectedYear?.year_value || filters.year, payroll_range:payrollRange,
        user_id:user?.user_id, admin_name:user?.full_name||user?.username,
      });
      if (!runData.success) throw new Error(runData.message||'Failed to create payroll run.');
      const rid = runData.run_id;
      setRunId(rid);
      const { existing, missing } = await getPayrollRunEmployeeState(rid);
      if (!existing.length) {
        if (missing.length) {
          setPendingAddEmps([]);
          setIncompleteAction('proceed');
          openEmployeeSelection(rid, missing);
        } else {
          setPendingAddEmps([]);
          setPendingAddRunId(null);
          setIncompleteAction('proceed');
          flash('There are no employees to be selected for this payroll run.','warning');
        }
      } else if (missing.length) {
        setPendingAddEmps(missing);
        setPendingAddRunId(rid);
        setIncompleteAction('proceed');
        setShowIncompleteModal(true);
      } else {
        setPendingAddEmps([]);
        setPendingAddRunId(null);
        setIncompleteAction('proceed');
        await loadRunEmployees(rid);
        setStep('computation');
      }
    } catch(err) {
      flash(getApiMessage(err,'Failed to proceed.'),'warning');
    } finally {
      setLoading(false);
    }
  }

  function chooseAddMissingEmployees() {
    openEmployeeSelection(pendingAddRunId || runId, pendingAddEmps);
  }

  async function continueWithoutAdding() {
    const rid = pendingAddRunId || runId;
    if (!rid) { flash('No payroll run loaded.','warning'); return; }
    setLoading(true);
    try {
      const action = incompleteAction;
      setShowIncompleteModal(false);
      setPendingAddEmps([]);
      setPendingAddRunId(null);
      setIncompleteAction('proceed');
      await loadRunEmployees(rid);
      if (action === 'save') {
        setShowSaveModal(true);
      } else {
        setStep('computation');
      }
    } catch(err) {
      flash(getApiMessage(err,'Failed to load payroll run.'),'warning');
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePayrollClick() {
    if (!runId) { flash('No payroll run loaded.','warning'); return; }
    setLoading(true);
    try {
      const { missing } = await getPayrollRunEmployeeState(runId);
      if (missing.length) {
        setPendingAddEmps(missing);
        setPendingAddRunId(runId);
        setIncompleteAction('save');
        setShowIncompleteModal(true);
      } else {
        setPendingAddEmps([]);
        setPendingAddRunId(null);
        setIncompleteAction('proceed');
        setShowSaveModal(true);
      }
    } catch(err) {
      flash(getApiMessage(err,'Failed to check payroll employees.'),'warning');
    } finally {
      setLoading(false);
    }
  }

  async function confirmAddEmployees() {
    if (selectedForModal.size === 0) { flash('Select at least one employee.','warning'); return; }
    const targetRunId = pendingAddRunId || runId;
    if (!targetRunId) { flash('No payroll run loaded.','warning'); return; }
    setLoading(true);
    try {
      await api.post(`/payroll_runs/${targetRunId}/employees`, { employees:Array.from(selectedForModal) });
      setShowEmpModal(false);
      setPendingAddEmps([]);
      setPendingAddRunId(null);
      setIncompleteAction('proceed');
      await loadRunEmployees(targetRunId);
      setStep('computation');
    } catch(err) {
      flash(getApiMessage(err,'Failed to add employees.'),'warning');
    } finally {
      setLoading(false);
    }
  }

  async function loadEmpData(empId, rid) {
    const effectiveRunId = rid || runId;
    // Fetch settings first so we can pass basic_salary to the HRIS endpoint
    const settingsResp = await api.get(`/employee_payroll_settings/${empId}`, {
      params:{ run_id:effectiveRunId, group_id:filters.payroll_group||'', periodOption:selectedPeriod?.period_name||'' }
    });
    const { data } = settingsResp;
    if (!data.success) throw new Error(data.message||'Failed to load payroll data.');
    const rec = data.data || {};
    console.log('Payroll settings for employee', empId, rec);
    console.log(JSON.stringify(rec, null, 2));

    // Compute basic_salary from settings so we can pass it to HRIS
    let computedBasicSalary = toNum(rec.basic_salary);
    if (rec.main_computation) {
      const rawSalary = toNum(rec.main_computation);
      if (rawSalary > 0) {
        const grp = (meta.payrollGroups || []).find(g => String(g.group_id) === String(filters.payroll_group));
        const gName = (grp?.group_name || '').toUpperCase();
        const weekInYear = toNum(rec.week_in_year) || 52;
        if (gName.includes('SEMI')) computedBasicSalary = Math.round(rawSalary / 2 * 100) / 100;
        else if (gName.includes('WEEK')) computedBasicSalary = Math.round(rawSalary * 12 / weekInYear * 100) / 100;
        else computedBasicSalary = rawSalary;
      }
    }

    // Fetch HRIS with the correct basic_salary so deductions are computed properly
    let hris = null;
    if (filters.month && filters.year && filters.payroll_period) {
      try {
        const hrisResp = await api.get('/payroll/hris-data', {
          params:{ employee_id:empId, month_id:filters.month, year_id:filters.year, period_id:filters.payroll_period, run_id:effectiveRunId||'', group_id:filters.payroll_group||'', basic_salary:computedBasicSalary||'' }
        });
        if (hrisResp.data?.success) hris = hrisResp.data;
      } catch { /* no HRIS data available */ }
    }

    const nextP = makeEmptyPayroll();

    Object.keys(nextP).forEach(k => {
      if (rec[k] != null) nextP[k] = rec[k];
    });

    // Use the already-computed basic_salary
    if (computedBasicSalary > 0) {
      nextP.basic_salary = computedBasicSalary;
    }
    
    const allowList = rec.allowances||[];

    if (!toNum(nextP.taxable_allowances)) {
      const tx = allowList
        .filter(a => Number(a.is_taxable)===1)
        .reduce((s,a)=>s+toNum(a.amount),0);

      if (tx>0) nextP.taxable_allowances = tx;
    }

    if (!toNum(nextP.non_taxable_allowances)) {
      const nt = allowList
        .filter(a => Number(a.is_taxable)!==1)
        .reduce((s,a)=>s+toNum(a.amount),0);

      if (nt>0) nextP.non_taxable_allowances = nt;
    }

    const deductionList = rec.deductions || [];

    if (!toNum(nextP.total_deductions)) {
      const totalDeductionRows = deductionList
        .reduce((s, d) => s + toNum(d.amount), 0);

      if (totalDeductionRows > 0)
        nextP.total_deductions = totalDeductionRows;
    }

    const nextOt  = makeEmptyOtNd();    const otR = rec.ot_nd||{};       Object.keys(nextOt).forEach(k=>{if(otR[k]!=null)nextOt[k]=otR[k];});
    const nextAdj = makeEmptyOtNdAdj(); const aR  = rec.ot_nd_adj||{};   Object.keys(nextAdj).forEach(k=>{if(aR[k]!=null)nextAdj[k]=aR[k];});
    const nextAtt = makeEmptyAttAdj();  const atR = rec.attendance_adj||{}; Object.keys(nextAtt).forEach(k=>{if(atR[k]!=null)nextAtt[k]=atR[k];});
    if (hris) {
      const hrisAbsenceMinutes = Math.round((hris.absences?.total_days || 0) * 480);
      const hrisLateMinutes    = hris.attendance?.late_minutes || 0;
      const hrisUndertimeMinutes = hris.attendance?.undertime_minutes || 0;
      const hrisOtMinutes      = Math.round((hris.ot?.total_hours || 0) * 60);
      nextP.absence_time        = hrisAbsenceMinutes;
      nextP.absence_deduction   = (hris.absences?.computed_deduction || 0).toFixed(2);
      nextP.late_time           = hrisLateMinutes;
      nextP.late_deduction      = (hris.attendance?.late_deduction || 0).toFixed(2);
      nextP.undertime           = hrisUndertimeMinutes;
      nextP.undertime_deduction = (hris.attendance?.undertime_deduction || 0).toFixed(2);
      nextP.overtime            = (hris.ot?.computed_amount || 0).toFixed(2);
      nextP.holiday_pay         = (hris.holiday?.computed_amount || 0).toFixed(2);
      nextP.total_leaves_used   = buildPeriodLeaveRows(hris, nextP.basic_salary, rec.leaveBalances || [])
        .reduce((sum, row) => sum + toNum(row.amount), 0)
        .toFixed(2);
      nextAtt.absences_time  = hrisAbsenceMinutes;
      nextAtt.absences_amt   = (hris.absences?.computed_deduction || 0).toFixed(2);
      nextAtt.late_time      = hrisLateMinutes;
      nextAtt.late_amt       = (hris.attendance?.late_deduction || 0).toFixed(2);
      nextAtt.undertime_time = hrisUndertimeMinutes;
      nextAtt.undertime_amt  = (hris.attendance?.undertime_deduction || 0).toFixed(2);
      nextAdj.ot_adj_rg_ot_time = hrisOtMinutes;
      nextAdj.ot_adj_rg_ot      = (hris.ot?.computed_amount || 0).toFixed(2);
    }

    Object.assign(nextP, applyContributionRows(nextP, rec.contributions || []));
    try {
      const computed = await computePayrollDeductions(nextP, rec, allowList, deductionList);
      console.log('Computed deductions:', computed);
      if (computed) {
        [
          'gsis_employee', 'gsis_employer', 'gsis_ecc',
          'sss_employee', 'sss_employer', 'sss_ecc',
          'pagibig_employee', 'pagibig_employer', 'pagibig_ecc',
          'philhealth_employee', 'philhealth_employer', 'philhealth_ecc',
          'tax_withheld'
        ].forEach((field) => {
          if (!toNum(nextP[field]) && computed[field] != null) { nextP[field] = (computed[field] ?? 0).toFixed(2); }
        });
      }
      console.log('Computed payroll deductions:', computed);
    } catch {
      // Keep loaded payroll values if automatic statutory computation is unavailable.
    }
    
    if (rec.previousYtd) {
      const ytd = rec.previousYtd;

      nextP.ytd_gsis = (
        parseFloat(ytd.ytd_gsis || 0) +
        parseFloat(nextP.gsis_employee || 0)
      ).toFixed(2);

      nextP.ytd_sss = (
        parseFloat(ytd.ytd_sss || 0) +
        parseFloat(nextP.sss_employee || 0)
      ).toFixed(2);

      nextP.ytd_pagibig = (
        parseFloat(ytd.ytd_pagibig || 0) +
        parseFloat(nextP.pagibig_employee || 0)
      ).toFixed(2);

      nextP.ytd_philhealth = (
        parseFloat(ytd.ytd_philhealth || 0) +
        parseFloat(nextP.philhealth_employee || 0)
      ).toFixed(2);

      nextP.ytd_wtax = (
        parseFloat(ytd.ytd_wtax || 0) +
        parseFloat(nextP.tax_withheld || 0)
      ).toFixed(2);

      const gross =
        toNum(nextP.basic_salary) -
        toNum(nextP.absence_deduction) -
        toNum(nextP.late_deduction) -
        toNum(nextP.undertime_deduction) +
        toNum(nextP.overtime) +
        toNum(nextP.taxable_allowances) +
        toNum(nextP.non_taxable_allowances) +
        toNum(nextP.adj_comp) +
        toNum(nextP.adj_non_comp) +
        toNum(nextP.total_leaves_used);

      nextP.ytd_gross = (
        parseFloat(ytd.ytd_gross || 0) + gross
      ).toFixed(2);
    }

    return { payroll:nextP, otNd:nextOt, otNdAdj:nextAdj, attAdj:nextAtt, allowances:rec.allowances||[], deductions:rec.deductions||[], hrisData:hris };
  }

  async function loadLoansAndLeaves(empId, basicSalary = 0, periodHrisData = null) {
    setLoansLoading(true); setLeavesLoading(true);
    try {
      const [loansResp, leavesResp] = await Promise.all([
        api.get('/loan_deductions', { params: { employee_id: empId, status: 'Active' } }).catch(() => ({ data: { loans: [] } })),
        api.get('/payroll/employee-leaves', { params: { employee_id: empId } }).catch(() => ({ data: { leaveBalances: [], leaveRequests: [] } })),
      ]);
      const loans = loansResp.data.loans || [];
      const balances = leavesResp.data.leaveBalances || [];
      setEmpLoans(loans);
      setEmpLeaveData({ leaveBalances: balances, leaveRequests: leavesResp.data.leaveRequests || [] });
      // Build loan rows from active loans
      const lrows = loans.map(l => ({
        description: [l.loan_category, l.loan_reference].filter(Boolean).join(' — '),
        loan_amount: toNum(l.balance_amount),
        amortization: toNum(l.amortization_amount),
        date_start: l.start_date || '',
        date_end: l.end_date || '',
        balance: toNum(l.balance_amount),
        skip: false,
        payment: toNum(l.amortization_amount),
      }));
      setLoanRows(lrows);
      setSelectedLoanRow(null);
      const loanTotal = lrows.reduce((s,r)=>s+toNum(r.payment),0);
      setPayroll(p=>({...p, loans: loanTotal.toFixed(2)}));
      setOtherDedRows([]);
      setSelectedDedRow(null);
      // Build leave rows only from approved requests clipped to the selected payroll period.
      const newRows = buildPeriodLeaveRows(periodHrisData, basicSalary, balances);
      setLeaveRows(newRows);
      const totalLeavesAmt = newRows.reduce((s, r) => s + toNum(r.amount), 0);
      setPayroll(p => ({...p, total_leaves_used: totalLeavesAmt.toFixed(2)}));
    } finally {
      setLoansLoading(false); setLeavesLoading(false);
    }
  }

  async function selectEmployee(emp) {
    if (isEditing) { flash('Save or cancel current changes first.','warning'); return; }
    if (empDataMap[emp.employee_id]) {
      const d = empDataMap[emp.employee_id];
      setPayroll(d.payroll); setOtNd(d.otNd); setOtNdAdj(d.otNdAdj); setAttAdj(d.attAdj);
      setAllowances(d.allowances); setDeductions(d.deductions);
      setHrisData(d.hrisData || null);
      setSelectedEmp(emp); setActiveTab('payroll'); setIsEditing(false);
      loadLoansAndLeaves(emp.employee_id, toNum(d.payroll.basic_salary), d.hrisData);
      return;
    }
    setLoading(true);
    try {
      const d = await loadEmpData(emp.employee_id);
      setEmpDataMap(prev=>({...prev,[emp.employee_id]:d}));
      setPayroll(d.payroll); setOtNd(d.otNd); setOtNdAdj(d.otNdAdj); setAttAdj(d.attAdj);
      setAllowances(d.allowances); setDeductions(d.deductions);
      setHrisData(d.hrisData || null);
      setSelectedEmp(emp); setActiveTab('payroll'); setIsEditing(false);
      loadLoansAndLeaves(emp.employee_id, toNum(d.payroll.basic_salary), d.hrisData);
    } catch(err) {
      flash(getApiMessage(err,'Failed to load employee payroll.'),'warning');
    } finally {
      setLoading(false);
    }
  }

  async function syncFromHris() {
    if (!selectedEmp) return;
    setHrisLoading(true);
    try {
      const { data } = await api.get('/payroll/hris-data', {
        params:{ employee_id:selectedEmp.employee_id, month_id:filters.month, year_id:filters.year, period_id:filters.payroll_period, run_id:runId||'', group_id:filters.payroll_group||'', basic_salary:toNum(payroll.basic_salary)||'' }
      });
      if (!data.success) { flash(data.message||'Failed to fetch HRIS data.','warning'); return; }
      setHrisData(data);
      upPayroll('absence_time',        Math.round((data.absences?.total_days || 0) * 480));
      upPayroll('absence_deduction',   data.absences?.computed_deduction || 0);
      upPayroll('late_time',           data.attendance?.late_minutes || 0);
      upPayroll('late_deduction',      data.attendance?.late_deduction || 0);
      upPayroll('undertime',           data.attendance?.undertime_minutes || 0);
      upPayroll('undertime_deduction', data.attendance?.undertime_deduction || 0);
      upPayroll('overtime',            data.ot?.computed_amount || 0);
      upPayroll('holiday_pay',         data.holiday?.computed_amount || 0);
      const periodLeaveRows = buildPeriodLeaveRows(data, toNum(payroll.basic_salary), empLeaveData.leaveBalances);
      const periodLeaveAmount = periodLeaveRows.reduce((s, r) => s + toNum(r.amount), 0);
      setLeaveRows(periodLeaveRows);
      upPayroll('total_leaves_used', periodLeaveAmount.toFixed(2));
      setAttAdj(prev => ({
        ...prev,
        absences_time: Math.round((data.absences?.total_days || 0) * 480),
        absences_amt: data.absences?.computed_deduction || 0,
        late_time: data.attendance?.late_minutes || 0,
        late_amt: data.attendance?.late_deduction || 0,
        undertime_time: data.attendance?.undertime_minutes || 0,
        undertime_amt: data.attendance?.undertime_deduction || 0,
      }));
      setOtNdAdj(prev => ({
        ...prev,
        ot_adj_rg_ot_time: Math.round((data.ot?.total_hours || 0) * 60),
        ot_adj_rg_ot: data.ot?.computed_amount || 0,
      }));
      flash('Attendance data synced from HRIS records.','success');
    } catch(err) {
      flash(getApiMessage(err,'Failed to sync HRIS data.'),'warning');
    } finally {
      setHrisLoading(false);
    }
  }

  async function doSaveAll() {
    if (!runId) { flash('No payroll run loaded.','warning'); return; }
    setLoading(true);
    try {
      const cache = {...empDataMap};
      if (selectedEmp) cache[selectedEmp.employee_id] = { payroll, otNd, otNdAdj, attAdj, allowances, deductions };
      for (const emp of filteredEmps) {
        if (!cache[emp.employee_id]) {
          cache[emp.employee_id] = await loadEmpData(emp.employee_id);
        }
      }
      const payrolls = filteredEmps.map(emp => {
        const d = cache[emp.employee_id];
        const p = d.payroll;
        const allowTotals = effectiveAllowanceTotals(p, d.allowances);
        const rowDeductions = effectiveDeductionTotal(p, d.deductions);
        const gross = toNum(p.basic_salary)-toNum(p.absence_deduction)-toNum(p.late_deduction)-toNum(p.undertime_deduction)+toNum(p.overtime)+toNum(p.holiday_pay)+allowTotals.taxable+allowTotals.nontaxable+toNum(p.adj_comp)+toNum(p.adj_non_comp)+toNum(p.total_leaves_used);
        const ded   = toNum(p.gsis_employee)+toNum(p.sss_employee)+toNum(p.pagibig_employee)+toNum(p.philhealth_employee)+toNum(p.tax_withheld)+rowDeductions+toNum(p.loans)+toNum(p.other_deductions)+toNum(p.premium_adj);
        return {
          employee_id:emp.employee_id,
          basic_salary:toNum(p.basic_salary), absence_time:toNum(p.absence_time), absence_deduction:toNum(p.absence_deduction),
          late_time:toNum(p.late_time), late_deduction:toNum(p.late_deduction),
          undertime:toNum(p.undertime), undertime_deduction:toNum(p.undertime_deduction),
          overtime:toNum(p.overtime), holiday_pay:toNum(p.holiday_pay),
          taxable_allowances:allowTotals.taxable, non_taxable_allowances:allowTotals.nontaxable,
          adj_comp:toNum(p.adj_comp), adj_non_comp:toNum(p.adj_non_comp), total_leaves_used:toNum(p.total_leaves_used),
          gsis_employee:toNum(p.gsis_employee), gsis_employer:toNum(p.gsis_employer), gsis_ecc:toNum(p.gsis_ecc),
          sss_employee:toNum(p.sss_employee), sss_employer:toNum(p.sss_employer), sss_ecc:toNum(p.sss_ecc),
          pagibig_employee:toNum(p.pagibig_employee), pagibig_employer:toNum(p.pagibig_employer), pagibig_ecc:toNum(p.pagibig_ecc),
          philhealth_employee:toNum(p.philhealth_employee), philhealth_employer:toNum(p.philhealth_employer), philhealth_ecc:toNum(p.philhealth_ecc),
          tax_withheld:toNum(p.tax_withheld), total_deductions:rowDeductions,
          loans:toNum(p.loans), other_deductions:toNum(p.other_deductions), premium_adj:toNum(p.premium_adj),
          ytd_sss:toNum(p.ytd_sss), ytd_wtax:toNum(p.ytd_wtax), ytd_philhealth:toNum(p.ytd_philhealth),
          ytd_gsis:toNum(p.ytd_gsis), ytd_pagibig:toNum(p.ytd_pagibig), ytd_gross:toNum(p.ytd_gross),
          payroll_status:p.payroll_status||'Active',
          gross_pay:gross, grand_total_deductions:ded, net_pay:gross-ded,
          allowances:d.allowances, deductions:d.deductions,
          ot_nd: normalizeAdjustmentTimes(d.otNd || {}),
          ot_nd_adj: normalizeAdjustmentTimes(d.otNdAdj || {}),
          att_adj: normalizeAdjustmentTimes(d.attAdj || {}),
          periodOption:selectedPeriod?.period_name||'',
        };
      });
      const { data } = await api.post('/save_all_employee_payroll', {
        run_id:runId, payrolls, user_id:user?.user_id, admin_name:user?.full_name||user?.username,
      });
      if (!data.success) throw new Error(data.message||'Failed to save.');
      setEmpDataMap(cache);
      flash(`${payrolls.length} employee payroll(s) saved successfully.`,'success');
      setShowSaveModal(false); setIsEditing(false);
      await loadRunEmployees(runId);
    } catch(err) {
      flash(getApiMessage(err,'Failed to save payroll.'),'warning');
    } finally {
      setLoading(false);
    }
  }

  async function doSave() {
    if (!selectedEmp||!runId) return;
    setLoading(true);
    try {
      const { data } = await api.put(`/update_employee_payroll/${selectedEmp.employee_id}`, {
        run_id:runId,
        basic_salary:toNum(payroll.basic_salary),
        absence_time:toNum(payroll.absence_time), absence_deduction:toNum(payroll.absence_deduction),
        late_time:toNum(payroll.late_time), late_deduction:toNum(payroll.late_deduction),
        undertime:toNum(payroll.undertime), undertime_deduction:toNum(payroll.undertime_deduction),
        overtime:toNum(payroll.overtime), holiday_pay:toNum(payroll.holiday_pay), taxable_allowances:allowanceTotals.taxable,
        non_taxable_allowances:allowanceTotals.nontaxable,
        adj_comp:toNum(payroll.adj_comp), adj_non_comp:toNum(payroll.adj_non_comp),
        total_leaves_used:toNum(payroll.total_leaves_used),
        gsis_employee:toNum(payroll.gsis_employee), gsis_employer:toNum(payroll.gsis_employer), gsis_ecc:toNum(payroll.gsis_ecc),
        sss_employee:toNum(payroll.sss_employee), sss_employer:toNum(payroll.sss_employer), sss_ecc:toNum(payroll.sss_ecc),
        pagibig_employee:toNum(payroll.pagibig_employee), pagibig_employer:toNum(payroll.pagibig_employer), pagibig_ecc:toNum(payroll.pagibig_ecc),
        philhealth_employee:toNum(payroll.philhealth_employee), philhealth_employer:toNum(payroll.philhealth_employer), philhealth_ecc:toNum(payroll.philhealth_ecc),
        tax_withheld:toNum(payroll.tax_withheld), total_deductions:deductionRowsTotal,
        loans:toNum(payroll.loans), other_deductions:toNum(payroll.other_deductions), premium_adj:toNum(payroll.premium_adj),
        ytd_sss:toNum(payroll.ytd_sss), ytd_wtax:toNum(payroll.ytd_wtax), ytd_philhealth:toNum(payroll.ytd_philhealth),
        ytd_gsis:toNum(payroll.ytd_gsis), ytd_pagibig:toNum(payroll.ytd_pagibig), ytd_gross:toNum(payroll.ytd_gross),
        payroll_status:payroll.payroll_status||'Active',
        gross_pay:totals.gross, grand_total_deductions:totals.ded, net_pay:totals.net,
        ot_nd:normalizeAdjustmentTimes(otNd), ot_nd_adj:normalizeAdjustmentTimes(otNdAdj), att_adj:normalizeAdjustmentTimes(attAdj),
        periodOption:selectedPeriod?.period_name||'',
        allowances, deductions,
        user_id:user?.user_id, admin_name:user?.full_name||user?.username,
      });
      if (!data.success) throw new Error(data.message||'Failed to save.');
      flash('Payroll saved successfully.','success');
      setIsEditing(false); setShowSaveModal(false);
      await loadRunEmployees(runId);
    } catch(err) {
      flash(getApiMessage(err,'Failed to save payroll.'),'warning');
    } finally {
      setLoading(false);
    }
  }

  async function doDelete() {
    if (!selectedEmp||!runId) return;
    setLoading(true);
    try {
      const { data } = await api.post('/delete-employee', {
        employeeId:selectedEmp.employee_id, runId,
        user_id:user?.user_id, admin_name:user?.full_name||user?.username,
      });
      if (!data.success) throw new Error(data.message||'Failed to delete.');
      flash('Employee payroll record deleted.','success');
      setShowDeleteModal(false); setSelectedEmp(null); setPayroll(makeEmptyPayroll());
      setLeaveRows(makeEmptyLeaveRows()); setLoanRows([]); setOtherDedRows([]);
      setSelectedLoanRow(null); setSelectedDedRow(null);
      await loadRunEmployees(runId);
    } catch(err) {
      flash(getApiMessage(err,'Failed to delete.'),'warning');
    } finally {
      setLoading(false);
    }
  }

  function goBackToSetup() {
    setStep('setup'); setSelectedEmp(null); setEmployees([]);
    setRunId(null); setIsEditing(false); setPayroll(makeEmptyPayroll()); setShowBackModal(false);
    setHrisData(null); setEmpDataMap({});
    setLeaveRows(makeEmptyLeaveRows()); setLoanRows([]); setOtherDedRows([]);
    setSelectedLoanRow(null); setSelectedDedRow(null);
  }

  function handleCancelEdit() {
    if (selectedEmp) selectEmployee(selectedEmp);
    else { setPayroll(makeEmptyPayroll()); setIsEditing(false); }
    setShowCancelModal(false);
  }

  const TABS = [
    {id:'payroll',label:'Payroll'},{id:'ot-nd',label:'OT / ND'},
    {id:'allowances',label:'Allowances'},{id:'deductions',label:'Deductions'},
    {id:'loans',label:'Loans'},{id:'attendanceAdj',label:'Premium Adj'},
    {id:'otherDeductions',label:'Other Deductions'},
    {id:'leaves',label:'Leaves'},
  ];

  function renderIncompleteModal() {
    if (!showIncompleteModal) return null;
    return (
      <div className="payroll-modal">
        <div
          className="modal-content"
        >
          <h3>Incomplete Payroll</h3>
          <p>
            There {pendingAddEmps.length === 1 ? 'is' : 'are'} {pendingAddEmps.length} employee{pendingAddEmps.length === 1 ? '' : 's'} not yet included in this payroll run.
          </p>
          <div style={{display:'flex', justifyContent:'center', gap:22, flexWrap:'wrap'}}>
            <button
              type="button"
              className="btn proceed"
              disabled={loading}
              onClick={chooseAddMissingEmployees}
            >
              Add<br/>Employees
            </button>
            <button
              type="button"
              className="btn cancel-select"
              disabled={loading}
              onClick={continueWithoutAdding}
            >
              Continue Without<br/>Adding
            </button>
          </div>
        </div>
      </div>
    );
  }

  function toggleModal(empId) {
    setModalSelectMode('');
    setSelectedForModal(prev => {
      const n = new Set(prev);
      n.has(empId) ? n.delete(empId) : n.add(empId);
      return n;
    });
  }
  function selectAllModalEmps() {
    setSelectedForModal(new Set(filteredModalEmps.map(e=>e.employee_id)));
    setModalSelectMode('select_all');
  }
  function clearAllModalEmps() {
    setSelectedForModal(new Set());
    setModalSelectMode('clear_all');
  }

  // ============================================================
  // STEP 1: Setup
  // ============================================================
  if (step === 'setup') {
    return (
      <main className="section">
        <header className="header">
          <h2>Payroll Computation</h2>
          <p>Compute employee payroll with automated deductions and real-time payslip generation.</p>
        </header>

        <section>
          <h3>Step 1: Setup Payroll</h3>
          <div className="setup-container">

            <div className="payroll-period-panel">
              <h4>Payroll Period</h4>
              <div className="form-grid">
                <div className="payroll-period-row">
                  <label>Payroll Group:</label>
                  <select value={filters.payroll_group} onChange={e=>handlePayrollGroupChange(e.target.value)}>
                    <option disabled value="">-- Select Group --</option>
                    {meta.payrollGroups.map(g=><option key={g.group_id} value={g.group_id}>{g.group_name}</option>)}
                  </select>
                </div>
                <div className="payroll-period-row">
                  <label>Period:</label>
                  <select value={filters.payroll_period} onChange={e=>upFilter('payroll_period',e.target.value)}>
                    {!filters.payroll_group
                      ? <option disabled value="">-- Please select a group first --</option>
                      : (
                          meta.payrollPeriods.length === 0
                            ? (
                                <>
                                  <option disabled value="">-- Select Period --</option>
                                  <option disabled value="">-- No periods available --</option>
                                </>
                              )
                            : (
                                <>
                                  <option disabled value="">-- Select Period --</option>
                                  {meta.payrollPeriods.map(p => <option key={p.period_id} value={p.period_id}>{p.period_name}</option>)}
                                </>
                              )
                        )
                    }
                  </select>
                </div>
                <div className="payroll-period-row">
                  <label>Month:</label>
                  <select value={filters.month} onChange={e=>upFilter('month',e.target.value)}>
                    <option disabled value="">-- Select Month --</option>
                    {meta.payrollMonths.map(m=><option key={m.month_id} value={m.month_id}>{m.month_name}</option>)}
                  </select>
                </div>
                <div className="payroll-period-row">
                  <label>Year:</label>
                  <div className="year-picker-wrap" ref={yearPickerRef}>
                    <input
                      type="text"
                      className="year-input"
                      value={yearInputText}
                      placeholder="e.g. 2026"
                      onChange={e => {
                        const val = e.target.value;
                        setYearInputText(val);
                        const match = meta.payrollYears.find(y => String(y.year_value) === val);
                        upFilter('year', match ? match.year_id : val);
                      }}
                    />
                    <button type="button" className="year-calendar-btn" onClick={() => setShowYearPicker(p => !p)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </button>
                    {showYearPicker && (
                      <div className="year-picker-dropdown">
                        {Array.from({ length: 21 }, (_, i) => 2015 + i).map(yr => {
                          const found = meta.payrollYears.find(y => String(y.year_value) === String(yr));
                          const isSelected = found ? String(found.year_id)===String(filters.year) : String(filters.year)===String(yr);
                          return (
                            <div
                              key={yr}
                              className={`year-picker-option${isSelected?' selected':''}`}
                              onClick={() => { upFilter('year', found ? found.year_id : String(yr)); setYearInputText(String(yr)); setShowYearPicker(false); }}
                            >
                              {yr}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="payroll-period-row">
                  <label>Generated Payroll Range:</label>
                  <input type="text" value={payrollRange} disabled />
                </div>
              </div>
            </div>

            <div className="filter-panel">
              <h4>Filter</h4>
              <div className="form-grid">
                {FILTER_CATS.map(([cat,label,fk])=>{
                  const key=fk||cat;
                  return (
                    <div key={cat} className="filter-row">
                      <label>{label}:</label>
                      <select value={filters[key]||''} onChange={e=>upFilter(key,e.target.value)}>
                        <option disabled value="">-- Select --</option>
                        {(lists[cat]||[]).map(r=><option key={r.value} value={r.value}>{r.value}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
              <div style={{marginTop:15}}>
                <button type="button" className="btn" style={{float:'right'}} onClick={()=>setFilters(f=>({
                  ...f, company:'',location:'',branch:'',division:'',department:'',
                  class:'',position:'',empType:'',salaryType:'',
                }))}>Clear Filters</button>
                <label>Option:</label><br/>
                <label><input type="radio" name="option" value="all" checked={filters.option==='all'} onChange={()=>upFilter('option','all')} /> All</label>{' '}
                <label><input type="radio" name="option" value="active" checked={filters.option==='active'} onChange={()=>upFilter('option','active')} /> Active</label>{' '}
                <label><input type="radio" name="option" value="hold" checked={filters.option==='hold'} onChange={()=>upFilter('option','hold')} /> Hold</label>
              </div>
            </div>
          </div>

          <div style={{marginTop:25, textAlign:'right'}}>
            <button type="button" className="btn" disabled={loading||!periodReady} onClick={proceedToComputation}>
              {loading?'Loading...':'Proceed to Computation'}
            </button>
          </div>
        </section>

        {renderIncompleteModal()}

        {showEmpModal && (
          <div className="payroll-modal">
            <div className="modal-content large-modal">
              <h3>Select Employees to Add to Payroll</h3>
              <p>Choose the employees you want to include in this payroll run.</p>
              <div className="helper-tools" style={{margin:'10px 0'}}>
                <label><input type="radio" name="ms" checked={modalSelectMode==='select_all'} onChange={selectAllModalEmps} /> Select All</label>
                <label style={{marginLeft:5}}><input type="radio" name="ms" checked={modalSelectMode==='clear_all'} onChange={clearAllModalEmps} /> Clear All</label>
                <label style={{marginLeft:10}}>Quick Search:</label>
                <select value={modalSearchBy} onChange={e=>setModalSearchBy(e.target.value)}>
                  <option value="employee_id">Employee ID</option>
                  <option value="last_name">Last Name</option>
                  <option value="first_name">First Name</option>
                </select>
                <input type="text" value={modalSearch} onChange={e=>setModalSearch(e.target.value)} placeholder="Type to search..." style={{marginLeft:5}} />
              </div>
              <div className="employee-select-container">
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr>
                      <th style={{padding:8,borderBottom:'1px solid #ddd'}}>Select</th>
                      <th style={{padding:8,borderBottom:'1px solid #ddd'}}>Employee ID</th>
                      <th style={{padding:8,borderBottom:'1px solid #ddd'}}>Last Name</th>
                      <th style={{padding:8,borderBottom:'1px solid #ddd'}}>First Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredModalEmps.length===0
                      ? <tr><td colSpan="4" style={{padding:8}}>No employees found.</td></tr>
                      : filteredModalEmps.map(e=>(
                        <tr key={e.employee_id} style={{cursor:'pointer'}} onClick={()=>toggleModal(e.employee_id)}>
                          <td style={{padding:'8px',borderBottom:'1px solid #ddd'}}><input type="checkbox" readOnly checked={selectedForModal.has(e.employee_id)} /></td>
                          <td style={{padding:'8px',borderBottom:'1px solid #ddd'}}>{e.emp_code}</td>
                          <td style={{padding:'8px',borderBottom:'1px solid #ddd'}}>{e.last_name}</td>
                          <td style={{padding:'8px',borderBottom:'1px solid #ddd'}}>{e.first_name}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
              <div className="modal-buttons">
                <button className="btn proceed" disabled={loading} onClick={confirmAddEmployees}>{loading?'Adding...':'Proceed'}</button>
                <button className="btn cancel-select" onClick={()=>setShowEmpModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {toast && <div className={toastType==='success'?'toastSuccess':'toastWarning'}>{toast}</div>}
      </main>
    );
  }

  // ============================================================
  // STEP 2: Computation
  // ============================================================
  return (
    <main className="section">
      <header className="header">
        <h2>Payroll Computation</h2>
        <p>Compute employee payroll with automated deductions and real-time payslip generation.</p>
      </header>

      <section className="section-content">
        <h3>Step 2: Payroll Computation</h3>

        {selectedEmp && (
          <div className="profile-header">
            <div className="profile-photo">
              <div className="pic-placeholder">No Image</div>
            </div>
            <div className="profile-info">
              <h2>{selectedEmp.first_name} {selectedEmp.last_name}</h2>
              <p><strong>Employee ID:</strong> {selectedEmp.emp_code}</p>
              <p><strong>Department:</strong> {selectedEmp.department||'—'}</p>
              <p><strong>Position:</strong> {selectedEmp.position||'—'}</p>
              <p><strong>Status:</strong> {selectedEmp.status||'—'}</p>
            </div>
            <div className="details-actions">
              {!isEditing ? (
                <>
                  <button className="btn edit-btn" type="button" onClick={()=>setIsEditing(true)}>Edit</button>
                  <button className="btn delete-btn" type="button" onClick={()=>setShowDeleteModal(true)}>Delete</button>
                </>
              ) : (
                <>
                  <button className="btn save-btn" type="button" disabled={loading} onClick={()=>setShowSaveModal(true)}>Save</button>
                  <button className="btn cancel-btn" type="button" onClick={()=>setShowCancelModal(true)}>Cancel</button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="table-section">
          <h3 style={{marginBottom:8}}>{payrollRange}</h3>
          <div className="table-header">
            <h4>Employee List</h4>
            <div className="quick-search">
              <label>Quick Search:</label>
              <select value={searchBy} onChange={e=>setSearchBy(e.target.value)}>
                <option value="employee_id">Employee ID</option>
                <option value="last_name">Last Name</option>
                <option value="first_name">First Name</option>
              </select>
              <input type="text" value={searchInput} onChange={e=>setSearchInput(e.target.value)} placeholder="Type to search..." />
            </div>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:'#f0f0f0'}}>
                <th style={th}>No.</th><th style={th}>Company</th><th style={th}>Department</th>
                <th style={th}>Last Name</th><th style={th}>First Name</th><th style={th}>Employee ID</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmps.length===0
                ? <tr><td colSpan="6" style={{padding:8,textAlign:'center',border:'1px solid #ddd'}}>No employees loaded.</td></tr>
                : filteredEmps.map((e,i)=>(
                  <tr key={e.employee_id} onClick={()=>selectEmployee(e)} style={{cursor:'pointer',background:selectedEmp?.employee_id===e.employee_id?'#d0e8ff':i%2===0?'#fff':'#f9f9f9'}}>
                    <td style={td}>{i+1}</td><td style={td}>{e.company||'—'}</td><td style={td}>{e.department||'—'}</td>
                    <td style={td}>{e.last_name}</td><td style={td}>{e.first_name}</td><td style={td}>{e.emp_code}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
          {!selectedEmp && <p style={{margin:'8px 0 0',fontSize:13,color:'#666'}}>Click an employee row to load their payroll details.</p>}
        </div>

        {selectedEmp && (
          <>
            <div className="tab-buttons">
              {TABS.map(t=>(
                <button key={t.id} style={{fontWeight: activeTab===t.id ? '800' : '700'}} className={`tab-btn${activeTab===t.id?' active':''}`} type="button" onClick={()=>setActiveTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Payroll Tab */}
            {activeTab==='payroll' && (
                <div className="summary-input payroll-entry-surface">
                  <div className="payslip-grid payroll-entry-grid">
                    <div className="panel gross-panel payroll-entry-card">
                      <h4>Gross Earnings</h4>
                      <table className="payroll-entry-table gross-table">
                        <thead>
                          <tr><th>Description</th><th>Time</th><th>Amount</th></tr>
                        </thead>
                        <tbody>
                          <tr><td>Basic Salary</td><td></td><td><Ni dis={!isEditing} v={payroll.basic_salary} set={v=>upPayroll('basic_salary',v)} /></td></tr>
                          <tr>
                            <td colSpan={3}>
                              <div className="hris-attendance-banner">
                                <span className="hris-attendance-title">HRIS Attendance</span>
                                {hrisData ? (
                                  <>
                                    <span>{hrisData.period_range}</span>
                                    <span className="hris-separator">|</span>
                                    <span>
                                      {hrisData.attendance?.source==='computed_from_attendance'
                                        ? 'Source: Time Records'
                                        : hrisData.attendance?.source==='payroll_adjustment'
                                          ? 'Source: Manual Adj.'
                                          : 'Source: HRIS'}
                                    </span>
                                    <span className="hris-separator">|</span>
                                    <span>Absent: <strong>{hrisData.absences?.total_days ?? 0}</strong> day(s){toNum(hrisData.absences?.computed_deduction) > 0 && <span className="hris-negative">(-&#8369;{fmt(hrisData.absences.computed_deduction)})</span>}</span>
                                    <span>Late: <strong>{hrisData.attendance?.late_minutes ?? 0}</strong> min{toNum(hrisData.attendance?.late_deduction) > 0 && <span className="hris-negative">(-&#8369;{fmt(hrisData.attendance.late_deduction)})</span>}</span>
                                    <span>Undertime: <strong>{hrisData.attendance?.undertime_minutes ?? 0}</strong> min{toNum(hrisData.attendance?.undertime_deduction) > 0 && <span className="hris-negative">(-&#8369;{fmt(hrisData.attendance.undertime_deduction)})</span>}</span>
                                    <span>OT: <strong>{hrisData.ot?.total_hours ?? 0}</strong> hr(s){toNum(hrisData.ot?.computed_amount) > 0 && <span className="hris-positive">(+&#8369;{fmt(hrisData.ot.computed_amount)})</span>}</span>
                                  </>
                                ) : (
                                  <span className="hris-empty">No HRIS data loaded</span>
                                )}
                                {isEditing && (
                                  <button type="button" disabled={hrisLoading} onClick={syncFromHris} className="hris-sync-btn">
                                    {hrisLoading ? 'Syncing...' : 'Sync from HRIS'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          <tr><td>Absences (-)</td><td><Ti dis={!isEditing} v={payroll.absence_time} set={v=>upPayroll('absence_time',v)} /></td><td><Ni dis={!isEditing} v={payroll.absence_deduction} set={v=>upPayroll('absence_deduction',v)} /></td></tr>
                          <tr><td>Late (-)</td><td><Ti dis={!isEditing} v={payroll.late_time} set={v=>upPayroll('late_time',v)} /></td><td><Ni dis={!isEditing} v={payroll.late_deduction} set={v=>upPayroll('late_deduction',v)} /></td></tr>
                          <tr><td>Undertime (-)</td><td><Ti dis={!isEditing} v={payroll.undertime} set={v=>upPayroll('undertime',v)} /></td><td><Ni dis={!isEditing} v={payroll.undertime_deduction} set={v=>upPayroll('undertime_deduction',v)} /></td></tr>
                          <tr><td>Total Overtime (+)</td><td></td><td><Ni dis={!isEditing} v={payroll.overtime} set={v=>upPayroll('overtime',v)} /></td></tr>
                          <tr><td>Holiday Pay (+)</td><td></td><td><Ni dis={!isEditing} v={payroll.holiday_pay} set={v=>upPayroll('holiday_pay',v)} /></td></tr>
                          <tr><td>Taxable Allowances (+)</td><td></td><td><Ni dis={!isEditing} v={payroll.taxable_allowances} set={v=>upPayroll('taxable_allowances',v)} /></td></tr>
                          <tr><td>Non-Taxable Allow. (+)</td><td></td><td><Ni dis={!isEditing} v={payroll.non_taxable_allowances} set={v=>upPayroll('non_taxable_allowances',v)} /></td></tr>
                          <tr><td>Adj. Compensation (+)</td><td></td><td><Ni dis={!isEditing} v={payroll.adj_comp} set={v=>upPayroll('adj_comp',v)} /></td></tr>
                          <tr><td>Adj. Non-Comp. (+)</td><td></td><td><Ni dis={!isEditing} v={payroll.adj_non_comp} set={v=>upPayroll('adj_non_comp',v)} /></td></tr>
                          <tr><td>Total Leaves Used (+)</td><td></td><td><Ni dis={!isEditing} v={payroll.total_leaves_used} set={v=>upPayroll('total_leaves_used',v)} /></td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="panel deduction-panel payroll-entry-card">
                      <h4>Deductions</h4>
                      <table className="payroll-entry-table deduction-table">
                        <thead>
                          <tr><th></th><th>Employee</th><th>Employer</th><th>ECC</th></tr>
                        </thead>
                        <tbody>
                          <tr><td>GSIS</td><td><Ni dis={!isEditing} v={payroll.gsis_employee} set={v=>upPayroll('gsis_employee',v)} /></td><td><Ni dis={!isEditing} v={payroll.gsis_employer} set={v=>upPayroll('gsis_employer',v)} /></td><td><Ni dis={!isEditing} v={payroll.gsis_ecc} set={v=>upPayroll('gsis_ecc',v)} /></td></tr>
                          <tr><td>SSS</td><td><Ni dis={!isEditing} v={payroll.sss_employee} set={v=>upPayroll('sss_employee',v)} /></td><td><Ni dis={!isEditing} v={payroll.sss_employer} set={v=>upPayroll('sss_employer',v)} /></td><td><Ni dis={!isEditing} v={payroll.sss_ecc} set={v=>upPayroll('sss_ecc',v)} /></td></tr>
                          <tr><td>Pag-ibig</td><td><Ni dis={!isEditing} v={payroll.pagibig_employee} set={v=>upPayroll('pagibig_employee',v)} /></td><td><Ni dis={!isEditing} v={payroll.pagibig_employer} set={v=>upPayroll('pagibig_employer',v)} /></td><td><Ni dis={!isEditing} v={payroll.pagibig_ecc} set={v=>upPayroll('pagibig_ecc',v)} /></td></tr>
                          <tr><td>Philhealth</td><td><Ni dis={!isEditing} v={payroll.philhealth_employee} set={v=>upPayroll('philhealth_employee',v)} /></td><td><Ni dis={!isEditing} v={payroll.philhealth_employer} set={v=>upPayroll('philhealth_employer',v)} /></td><td><Ni dis={!isEditing} v={payroll.philhealth_ecc} set={v=>upPayroll('philhealth_ecc',v)} /></td></tr>
                          <tr><td>Tax Withheld</td><td><Ni dis={!isEditing} v={payroll.tax_withheld} set={v=>upPayroll('tax_withheld',v)} /></td><td colSpan={2}></td></tr>
                          <tr><td>Total Deductions</td><td><Ni dis={!isEditing} v={payroll.total_deductions} set={v=>upPayroll('total_deductions',v)} /></td><td colSpan={2}></td></tr>
                          <tr><td>Loans</td><td><Ni dis={!isEditing} v={payroll.loans} set={v=>upPayroll('loans',v)} /></td><td colSpan={2}></td></tr>
                          <tr><td>Other Deductions</td><td><Ni dis={!isEditing} v={payroll.other_deductions} set={v=>upPayroll('other_deductions',v)} /></td><td>Premium Adj.</td><td><Ni dis={!isEditing} v={payroll.premium_adj} set={v=>upPayroll('premium_adj',v)} /></td></tr>
                        </tbody>
                      </table>
                      <div className="payroll-ytd-title">Year-to-Date (YTD)</div>
                      <table className="payroll-entry-table ytd payroll-ytd-table">
                        <tbody>
                          <tr><td>YTD SSS</td><td><Ni dis={!isEditing} v={payroll.ytd_sss} set={v=>upPayroll('ytd_sss',v)} /></td><td>YTD Wtax</td><td><Ni dis={!isEditing} v={payroll.ytd_wtax} set={v=>upPayroll('ytd_wtax',v)} /></td></tr>
                          <tr><td>YTD Philhealth</td><td><Ni dis={!isEditing} v={payroll.ytd_philhealth} set={v=>upPayroll('ytd_philhealth',v)} /></td><td>YTD GSIS</td><td><Ni dis={!isEditing} v={payroll.ytd_gsis} set={v=>upPayroll('ytd_gsis',v)} /></td></tr>
                          <tr><td>YTD Pag-ibig</td><td><Ni dis={!isEditing} v={payroll.ytd_pagibig} set={v=>upPayroll('ytd_pagibig',v)} /></td><td>YTD Gross</td><td><Ni dis={!isEditing} v={payroll.ytd_gross} set={v=>upPayroll('ytd_gross',v)} /></td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
            )}
            {activeTab==='ot-nd' && (
              <div className="summary-input">
                <div className="ot-nd-payroll-grid">
                  <div className="form-box">
                    <h4>Overtime</h4>
                    <table className="ot-nd-table">
                      <thead><tr><th>Type</th><th style={{width:120}}>Rate</th><th style={{width:120}}>Hours</th><th style={{width:120}}>Amount</th></tr></thead>
                      <tbody>
                        {OT_ADJ_ROWS.map(({key,label,rate})=>(
                          <tr key={key}>
                            <td>{label}</td>
                            <td><span className="readonly-rate">{rate}</span></td>
                            <td><TimeInput dis={!isEditing} v={otNd[`${key}_time`]} set={v=>upOtNd(`${key}_time`,v)} /></td>
                            <td><Ni dis={!isEditing} v={otNd[key]} set={v=>upOtNd(key,v)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="form-box">
                    <h4>Night Differential</h4>
                    <table className="ot-nd-table">
                      <thead><tr><th>Type</th><th style={{width:120}}>Rate</th><th style={{width:120}}>Hours</th><th style={{width:120}}>Amount</th></tr></thead>
                      <tbody>
                        {ND_ADJ_ROWS.map(({key,label,baseRate})=>(
                          <tr key={key}>
                            <td>{label}</td>
                            <td><span className="readonly-rate">0.10% of {baseRate}</span></td>
                            <td><TimeInput dis={!isEditing} v={otNd[`${key}_nd_time`]} set={v=>upOtNd(`${key}_nd_time`,v)} /></td>
                            <td><Ni dis={!isEditing} v={otNd[`${key}_nd`]} set={v=>upOtNd(`${key}_nd`,v)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab==='allowances' && (
              <div className="summary-input">
                <div className="allowance-format-grid">
                  {[{taxable:true,title:'Taxable Allowances'},{taxable:false,title:'Non-Taxable Allowances'}].map(({taxable,title})=>{
                    const rows = allowances.filter(a=>taxable?Number(a.is_taxable)===1:Number(a.is_taxable)!==1);
                    const options = getAllowanceTypeOptions(taxable);
                    const displayRows = Array.from({ length: Math.max(7, rows.length) }, (_, index) => rows[index] || {});
                    return (
                      <div key={title} className="allowance-format-panel">
                        <table className="allowance-format-table">
                          <thead>
                            <tr>
                              <th className="allowance-row-num"></th>
                              <th>{title}</th>
                              <th className="allowance-amount-col">Amount</th>
                              <th className="allowance-days-col">Input Days</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayRows.map((a,i)=>(
                              <tr key={`${title}-${i}`}>
                                <td className="allowance-row-num">{i+1}.</td>
                                <td>
                                  <select
                                    disabled={!isEditing}
                                    value={a.allowance_type_id || ''}
                                    onChange={e => updateAllowanceSlot(taxable, i, 'allowance_type_id', e.target.value)}
                                  >
                                    <option value=""></option>
                                    {options.map(option => (
                                      <option key={option.id} value={option.id}>{option.name}</option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <Ni
                                    dis={!isEditing || !a.allowance_type_id}
                                    v={a.allowance_type_id ? a.amount : '0.00'}
                                    set={v=>updateAllowanceSlot(taxable, i, 'amount', v)}
                                  />
                                </td>
                                <td>
                                  <AllowanceTimeInput
                                    dis={!isEditing || !a.allowance_type_id}
                                    v={a.input_days || '00:00:00'}
                                    set={v=>updateAllowanceSlot(taxable, i, 'input_days', v)}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab==='deductions' && (
              <div className="summary-input">
                <div className="deduction-format-wrap">
                  <table className="deduction-format-table">
                    <thead>
                      <tr>
                        <th className="deduction-row-num"></th>
                        <th>Deductions Type</th>
                        <th className="deduction-amount-col">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: Math.max(7, deductions.length) }, (_, index) => deductions[index] || {}).map((d, i) => (
                        <tr key={`deduction-${i}`}>
                          <td className="deduction-row-num">{i+1}.</td>
                          <td>
                            <select
                              disabled={!isEditing}
                              value={d.deduction_type_id || ''}
                              onChange={e => updateDeductionSlot(i, 'deduction_type_id', e.target.value)}
                            >
                              <option value=""></option>
                              {deductionTypes.map(option => (
                                <option key={option.id} value={option.id}>{option.name}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <Ni
                              dis={!isEditing || !d.deduction_type_id}
                              v={d.deduction_type_id ? d.amount : '0.00'}
                              set={v=>updateDeductionSlot(i, 'amount', v)}
                            />
                          </td>
                        </tr>
                      ))}
                      <tr className="deduction-format-total-row">
                        <td></td>
                        <td></td>
                        <td><strong>{fmt(deductionRowsTotal)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab==='loans' && (
              <div className="summary-input">
                <div className="form-box">
                  {loansLoading ? (
                    <p style={{color:'#888',padding:8}}>Loading loans…</p>
                  ) : (
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                      <thead>
                        <tr style={{background:'#f0f0f0'}}>
                          <th style={{padding:'6px 10px',border:'1px solid #ccc'}}>Description</th>
                          <th style={{padding:'6px 10px',border:'1px solid #ccc',width:110,textAlign:'right'}}>Loan Amount</th>
                          <th style={{padding:'6px 10px',border:'1px solid #ccc',width:110,textAlign:'right'}}>Amortization</th>
                          <th style={{padding:'6px 10px',border:'1px solid #ccc',width:110}}>Date Start</th>
                          <th style={{padding:'6px 10px',border:'1px solid #ccc',width:110}}>Date End</th>
                          <th style={{padding:'6px 10px',border:'1px solid #ccc',width:110,textAlign:'right'}}>Balance</th>
                          <th style={{padding:'6px 10px',border:'1px solid #ccc',width:48,textAlign:'center'}}>Skip</th>
                          <th style={{padding:'6px 10px',border:'1px solid #ccc',width:110,textAlign:'right'}}>Payment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loanRows.length === 0
                          ? <tr><td colSpan={8} style={{padding:'10px 8px',border:'1px solid #ccc',color:'#aaa',textAlign:'center'}}>No loans. Click "Add Loan" to add a row.</td></tr>
                          : loanRows.map((row, i) => (
                            <tr key={i} onClick={()=>setSelectedLoanRow(i)}
                              style={{background:selectedLoanRow===i?'#d0e8ff':i%2===0?'#fff':'#f9f9f9',cursor:'pointer'}}>
                              <td style={{padding:'3px 6px',border:'1px solid #ccc'}}>
                                <input type="text" disabled={!isEditing} value={row.description}
                                  onChange={e=>upLoanRow(i,'description',e.target.value)}
                                  style={{width:'100%',border:'none',background:'transparent',fontSize:13}} />
                              </td>
                              <td style={{padding:'3px 6px',border:'1px solid #ccc'}}>
                                <input type="number" step="0.01" disabled={!isEditing} value={row.loan_amount}
                                  onChange={e=>upLoanRow(i,'loan_amount',e.target.value)}
                                  style={{width:'100%',border:'none',background:'transparent',textAlign:'right',fontSize:13}} />
                              </td>
                              <td style={{padding:'3px 6px',border:'1px solid #ccc'}}>
                                <input type="number" step="0.01" disabled={!isEditing} value={row.amortization}
                                  onChange={e=>upLoanRow(i,'amortization',e.target.value)}
                                  style={{width:'100%',border:'none',background:'transparent',textAlign:'right',fontSize:13}} />
                              </td>
                              <td style={{padding:'3px 6px',border:'1px solid #ccc'}}>
                                <input type="date" disabled={!isEditing} value={row.date_start}
                                  onChange={e=>upLoanRow(i,'date_start',e.target.value)}
                                  style={{width:'100%',border:'none',background:'transparent',fontSize:12}} />
                              </td>
                              <td style={{padding:'3px 6px',border:'1px solid #ccc'}}>
                                <input type="date" disabled={!isEditing} value={row.date_end}
                                  onChange={e=>upLoanRow(i,'date_end',e.target.value)}
                                  style={{width:'100%',border:'none',background:'transparent',fontSize:12}} />
                              </td>
                              <td style={{padding:'3px 6px',border:'1px solid #ccc'}}>
                                <input type="number" step="0.01" disabled={!isEditing} value={row.balance}
                                  onChange={e=>upLoanRow(i,'balance',e.target.value)}
                                  style={{width:'100%',border:'none',background:'transparent',textAlign:'right',fontSize:13}} />
                              </td>
                              <td style={{padding:'3px 6px',border:'1px solid #ccc',textAlign:'center'}}>
                                <input type="checkbox" disabled={!isEditing} checked={!!row.skip}
                                  onChange={e=>upLoanRow(i,'skip',e.target.checked)} />
                              </td>
                              <td style={{padding:'3px 6px',border:'1px solid #ccc'}}>
                                <input type="number" step="0.01" disabled={!isEditing} value={row.payment}
                                  onChange={e=>upLoanRow(i,'payment',e.target.value)}
                                  style={{width:'100%',border:'none',background:'transparent',textAlign:'right',fontSize:13}} />
                              </td>
                            </tr>
                          ))
                        }
                      </tbody>
                    </table>
                  )}
                  <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:8}}>
                    {isEditing && <button type="button" className="btn" style={{fontSize:13}} onClick={addLoanRow}>Add Loan</button>}
                    {isEditing && <button type="button" className="btn delete-btn" style={{fontSize:13}} disabled={selectedLoanRow===null} onClick={deleteLoanRow}>Delete Loan</button>}
                  </div>
                </div>
              </div>
            )}

            {activeTab==='attendanceAdj' && (
              <div className="summary-input">
                <div className="attendance-adj-grid">
                  <div className="form-box attendance-box">
                    <h4>Attendance Adjustments</h4>
                    <table className="ot-nd-table">
                      <thead><tr><th>Type</th><th style={{width:120}}>Time</th><th style={{width:120}}>Amount</th></tr></thead>
                      <tbody>
                        {ATT_ROWS.map(({key,label,hasTime})=>(
                          <tr key={key}>
                            <td>{label}</td>
                            <td>{hasTime?<Ti dis={!isEditing} v={attAdj[`${key}_time`]} set={v=>upAttAdj(`${key}_time`,v)} />:null}</td>
                            <td><Ni dis={!isEditing} v={attAdj[`${key}_amt`]} set={v=>upAttAdj(`${key}_amt`,v)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="form-box premium-box">
                    <h4>Premium Adjustments</h4>
                    <table className="ot-nd-table">
                      <thead><tr><th>Type</th><th style={{width:120}}>Employee Share</th><th style={{width:120}}>Employer Share</th><th style={{width:120}}>ECC</th></tr></thead>
                      <tbody>
                        {PREM_ROWS.map(({key,label})=>(
                          <tr key={key}>
                            <td>{label}</td>
                            <td><Ni dis={!isEditing} v={attAdj[`${key}_emp`]} set={v=>upAttAdj(`${key}_emp`,v)} /></td>
                            <td><Ni dis={!isEditing} v={attAdj[`${key}_employer`]} set={v=>upAttAdj(`${key}_employer`,v)} /></td>
                            <td><Ni dis={!isEditing} v={attAdj[`${key}_ecc`]} set={v=>upAttAdj(`${key}_ecc`,v)} /></td>
                          </tr>
                        ))}
                        <tr><td>Tax Withheld</td><td><Ni dis={!isEditing} v={attAdj.tax_withheld} set={v=>upAttAdj('tax_withheld',v)} /></td><td colSpan="2"></td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab==='otherDeductions' && (
              <div className="summary-input">
                <div className="form-box">
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                    <thead>
                      <tr style={{background:'#f0f0f0'}}>
                        <th style={{padding:'6px 10px',border:'1px solid #ccc'}}>Deduction(s)</th>
                        <th style={{padding:'6px 10px',border:'1px solid #ccc',width:130,textAlign:'right'}}>Employee Share</th>
                        <th style={{padding:'6px 10px',border:'1px solid #ccc',width:130,textAlign:'right'}}>Employer Share</th>
                        <th style={{padding:'6px 10px',border:'1px solid #ccc',width:110}}>Date Start</th>
                        <th style={{padding:'6px 10px',border:'1px solid #ccc',width:110}}>Date End</th>
                        <th style={{padding:'6px 10px',border:'1px solid #ccc',width:48,textAlign:'center'}}>Skip</th>
                      </tr>
                    </thead>
                    <tbody>
                      {otherDedRows.length === 0
                        ? <tr><td colSpan={6} style={{padding:'10px 8px',border:'1px solid #ccc',color:'#aaa',textAlign:'center'}}>No deductions. Click "Add Deduction" to add a row.</td></tr>
                        : otherDedRows.map((row, i) => (
                          <tr key={i} onClick={()=>setSelectedDedRow(i)}
                            style={{background:selectedDedRow===i?'#d0e8ff':i%2===0?'#fff':'#f9f9f9',cursor:'pointer'}}>
                            <td style={{padding:'3px 6px',border:'1px solid #ccc'}}>
                              <input type="text" disabled={!isEditing} value={row.description}
                                onChange={e=>upDedRow(i,'description',e.target.value)}
                                style={{width:'100%',border:'none',background:'transparent',fontSize:13}} />
                            </td>
                            <td style={{padding:'3px 6px',border:'1px solid #ccc'}}>
                              <input type="number" step="0.01" disabled={!isEditing} value={row.employee_share}
                                onChange={e=>upDedRow(i,'employee_share',e.target.value)}
                                style={{width:'100%',border:'none',background:'transparent',textAlign:'right',fontSize:13}} />
                            </td>
                            <td style={{padding:'3px 6px',border:'1px solid #ccc'}}>
                              <input type="number" step="0.01" disabled={!isEditing} value={row.employer_share}
                                onChange={e=>upDedRow(i,'employer_share',e.target.value)}
                                style={{width:'100%',border:'none',background:'transparent',textAlign:'right',fontSize:13}} />
                            </td>
                            <td style={{padding:'3px 6px',border:'1px solid #ccc'}}>
                              <input type="date" disabled={!isEditing} value={row.date_start}
                                onChange={e=>upDedRow(i,'date_start',e.target.value)}
                                style={{width:'100%',border:'none',background:'transparent',fontSize:12}} />
                            </td>
                            <td style={{padding:'3px 6px',border:'1px solid #ccc'}}>
                              <input type="date" disabled={!isEditing} value={row.date_end}
                                onChange={e=>upDedRow(i,'date_end',e.target.value)}
                                style={{width:'100%',border:'none',background:'transparent',fontSize:12}} />
                            </td>
                            <td style={{padding:'3px 6px',border:'1px solid #ccc',textAlign:'center'}}>
                              <input type="checkbox" disabled={!isEditing} checked={!!row.skip}
                                onChange={e=>upDedRow(i,'skip',e.target.checked)} />
                            </td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                  <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:8}}>
                    {isEditing && <button type="button" className="btn" style={{fontSize:13}} onClick={addDedRow}>Add Deduction</button>}
                    {isEditing && selectedDedRow !== null && <button type="button" className="btn delete-btn" style={{fontSize:13}} onClick={deleteDedRow}>Delete</button>}
                  </div>
                </div>
              </div>
            )}
            {activeTab==='leaves' && (
              <div className="summary-input">
                {leavesLoading ? (
                  <p style={{color:'#888',padding:8}}>Loading leave data…</p>
                ) : (
                  <div className="form-box">
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                      <thead>
                        <tr style={{background:'#f0f0f0'}}>
                          <th style={{padding:'6px 10px',border:'1px solid #ccc',width:32}}></th>
                          <th style={{padding:'6px 10px',border:'1px solid #ccc'}}>Leaves</th>
                          <th style={{padding:'6px 10px',border:'1px solid #ccc',width:80,textAlign:'right'}}>Left</th>
                          <th style={{padding:'6px 10px',border:'1px solid #ccc',width:110,textAlign:'right'}}>Used</th>
                          <th style={{padding:'6px 10px',border:'1px solid #ccc',width:110,textAlign:'right'}}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaveRows.map((row, i) => {
                          const bal = empLeaveData.leaveBalances.find(b => String(b.leave_type_id) === String(row.leave_type_id));
                          const left = bal ? bal.remaining_days : 0;
                          return (
                            <tr key={i}>
                              <td style={{padding:'4px 8px',border:'1px solid #ccc',textAlign:'center',color:'#555'}}>{i+1}.</td>
                              <td style={{padding:'3px 6px',border:'1px solid #ccc'}}>
                                <select
                                  disabled={!isEditing}
                                  value={row.leave_type_id}
                                  onChange={e => upLeaveRow(i, 'leave_type_id', e.target.value)}
                                  style={{width:'100%',border:'none',background:'transparent',fontSize:13}}
                                >
                                  <option value=""></option>
                                  {empLeaveData.leaveBalances.map(b => (
                                    <option key={b.leave_type_id} value={String(b.leave_type_id)}>{b.leave_name}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{padding:'4px 8px',border:'1px solid #ccc',textAlign:'right'}}>{fmt(left)}</td>
                              <td style={{padding:'3px 6px',border:'1px solid #ccc'}}>
                                <input type="number" step="0.01" min="0" disabled={!isEditing}
                                  value={row.used}
                                  onChange={e => upLeaveRow(i, 'used', e.target.value)}
                                  style={{width:'100%',border:'none',background:'transparent',textAlign:'right',fontSize:13}}
                                />
                              </td>
                              <td style={{padding:'3px 6px',border:'1px solid #ccc'}}>
                                <input type="number" step="0.01" min="0" disabled={!isEditing}
                                  value={row.amount}
                                  onChange={e => upLeaveRow(i, 'amount', e.target.value)}
                                  style={{width:'100%',border:'none',background:'transparent',textAlign:'right',fontSize:13}}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{background:'#f0f0f0',fontWeight:600}}>
                          <td colSpan={4} style={{padding:'6px 10px',border:'1px solid #ccc',textAlign:'right'}}>Total Amount</td>
                          <td style={{padding:'6px 10px',border:'1px solid #ccc',textAlign:'right'}}>
                            {fmt(leaveRows.reduce((s,r) => s + toNum(r.amount), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="summary-bar">
              <label>
                <input type="checkbox" disabled={!isEditing}
                  checked={payroll.payroll_status==='Hold'}
                  onChange={e=>upPayroll('payroll_status',e.target.checked?'Hold':'Active')}
                /> Hold
              </label>
              <div><strong>Gross Pay:</strong> ₱{fmt(totals.gross)}</div>
              <div><strong>Grand Total Ded.:</strong> ₱{fmt(totals.ded)}</div>
              <div><strong>Net Pay:</strong> ₱{fmt(totals.net)}</div>
            </div>
          </>
        )}

        <div className="payroll-buttons">
          <button type="button" className="add-employee-btn" onClick={openEmpModal}>+ Add New Employee</button>
          <div className="right-buttons">
            <button type="button" className="btn" onClick={()=>isEditing?setShowBackModal(true):goBackToSetup()}>← Back to Filters</button>
            <button type="button" className="btn save-payroll-btn" disabled={loading} onClick={handleSavePayrollClick}>&#128190; Save Payroll</button>
          </div>
        </div>
      </section>

      {renderIncompleteModal()}

      {showEmpModal && (
        <div className="payroll-modal">
          <div className="modal-content large-modal">
            <h3>Add Employees to Payroll Run</h3>
            <p>Choose the employees you want to include in this payroll run.</p>
            <div className="helper-tools" style={{margin:'10px 0'}}>
              <label><input type="radio" name="ms2" checked={modalSelectMode==='select_all'} onChange={selectAllModalEmps} /> Select All</label>
              <label style={{marginLeft:5}}><input type="radio" name="ms2" checked={modalSelectMode==='clear_all'} onChange={clearAllModalEmps} /> Clear All</label>
              <label style={{marginLeft:10}}>Quick Search:</label>
              <select value={modalSearchBy} onChange={e=>setModalSearchBy(e.target.value)}>
                <option value="employee_id">Employee ID</option>
                <option value="last_name">Last Name</option>
                <option value="first_name">First Name</option>
              </select>
              <input type="text" value={modalSearch} onChange={e=>setModalSearch(e.target.value)} placeholder="Type to search..." style={{marginLeft:5}} />
            </div>
            <div className="employee-select-container">
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr>
                    <th style={{padding:8,borderBottom:'1px solid #ddd'}}>Select</th>
                    <th style={{padding:8,borderBottom:'1px solid #ddd'}}>Employee ID</th>
                    <th style={{padding:8,borderBottom:'1px solid #ddd'}}>Last Name</th>
                    <th style={{padding:8,borderBottom:'1px solid #ddd'}}>First Name</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModalEmps.length===0
                    ? <tr><td colSpan="4" style={{padding:8}}>No employees found.</td></tr>
                    : filteredModalEmps.map(e=>(
                      <tr key={e.employee_id} style={{cursor:'pointer'}} onClick={()=>toggleModal(e.employee_id)}>
                        <td style={{padding:'8px',borderBottom:'1px solid #ddd'}}><input type="checkbox" readOnly checked={selectedForModal.has(e.employee_id)} /></td>
                        <td style={{padding:'8px',borderBottom:'1px solid #ddd'}}>{e.emp_code}</td>
                        <td style={{padding:'8px',borderBottom:'1px solid #ddd'}}>{e.last_name}</td>
                        <td style={{padding:'8px',borderBottom:'1px solid #ddd'}}>{e.first_name}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
            <div className="modal-buttons">
              <button className="btn proceed" disabled={loading} onClick={confirmAddEmployees}>{loading?'Adding...':'Proceed'}</button>
              <button className="btn cancel-select" onClick={()=>setShowEmpModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <PConfirm open={showSaveModal} title="Save All Payroll" msg={`Save payroll for all ${filteredEmps.length} employee(s) in this run?`}
        onOk={doSaveAll} onCancel={()=>setShowSaveModal(false)} okLabel={loading?'Saving...':'Yes, Save All'} okCls="btn proceed" />
      <PConfirm open={showDeleteModal} title="Confirm Delete" msg="Are you sure you want to delete the Payroll record of this employee?"
        onOk={doDelete} onCancel={()=>setShowDeleteModal(false)} okLabel="Yes, Delete" okCls="btn confirm-delete" />
      <PConfirm open={showCancelModal} title="Confirm Cancel" msg="Discard unsaved changes?"
        onOk={handleCancelEdit} onCancel={()=>setShowCancelModal(false)} okLabel="OK" okCls="btn confirm-delete" />
      <PConfirm open={showBackModal} title="Unsaved Changes" msg="You haven't saved this payroll yet. Going back will discard your changes."
        onOk={goBackToSetup} onCancel={()=>setShowBackModal(false)} okLabel="Yes, Go Back" okCls="btn confirm-delete" />

      {toast && <div className={toastType==='success'?'toastSuccess':'toastWarning'}>{toast}</div>}
    </main>
  );
}

const th = {padding:'8px 10px',border:'1px solid #ddd',textAlign:'left',fontWeight:600};
const td = {padding:'7px 10px',border:'1px solid #ddd'};

function Ni({ v, set, dis=false }) {
  return <input placeholder="0.00" type="number" step="0.01" disabled={dis} value={v??''} onChange={e=>set&&set(e.target.value)} />;
}

function Ti({ v, set, dis=false }) {
  return <input type="text" disabled={dis} value={v??''} onChange={e=>set&&set(e.target.value)} style={{width:80}} />;
}

function TimeInput({ v, set, dis=false }) {
  const [text, setText] = useState(formatMinutesToTime(v));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(formatMinutesToTime(v));
  }, [v, focused]);
  return (
    <input
      type="text"
      disabled={dis}
      value={text}
      placeholder="000:00"
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        setText(e.target.value);
        set?.(e.target.value);
      }}
      onBlur={() => {
        const minutes = parseTimeToMinutes(text);
        set?.(minutes);
        setText(formatMinutesToTime(minutes));
        setFocused(false);
      }}
      style={{ width:80 }}
    />
  );
}

function AllowanceTimeInput({ v, set, dis=false }) {
  const [text, setText] = useState(String(v || '00:00:00'));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(v || '00:00:00'));
  }, [v, focused]);
  return (
    <input
      type="text"
      disabled={dis}
      value={text}
      placeholder="00:00:00"
      onFocus={() => setFocused(true)}
      onChange={e => {
        setText(e.target.value);
        set?.(e.target.value);
      }}
      onBlur={() => {
        const raw = String(text || '').trim();
        const normalized = raw && /^\d{1,3}:\d{2}(:\d{2})?$/.test(raw)
          ? (raw.split(':').length === 2 ? `${raw}:00` : raw)
          : '00:00:00';
        set?.(normalized);
        setText(normalized);
        setFocused(false);
      }}
    />
  );
}

function PConfirm({ open, title, msg, onOk, onCancel, okLabel='Confirm', okCls='btn' }) {
  if (!open) return null;
  return (
    <div className="payroll-modal">
      <div className="modal-content">
        <h3>{title}</h3>
        <p>{msg}</p>
        <div className="modal-buttons">
          <button className={okCls} type="button" onClick={onOk}>{okLabel}</button>
          <button className="btn cancel-delete" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}