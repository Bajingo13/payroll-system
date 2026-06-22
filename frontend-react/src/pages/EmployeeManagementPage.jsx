import { useEffect, useMemo, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import PasswordToggleIcon from '../components/PasswordToggleIcon.jsx';

const SORT_OPTIONS = ['ID', 'Name', 'Company', 'Department', 'Position', 'Status'];
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];
const PAYROLL_RATE_OPTIONS = ['Piece Rate', 'Hourly Rate', 'Daily Rate', 'Weekly Rate', 'Monthly Rate'];
const OT_RATE_OPTIONS = ['STANDARD OT RATE'];
const ENTRY_PERIOD_OPTIONS = ['1st Week', '2nd Week', '3rd Week', '4th Week', 'Monthly', 'First Half', 'Second Half', 'Both'];
const CONTRIBUTION_COLUMNS = [
  { id: 1, label: 'SSS', defaultComputation: 'Gross' },
  { id: 2, label: 'Pag-ibig', defaultComputation: 'Fix' },
  { id: 3, label: 'Philhealth', defaultComputation: 'Basic' },
  { id: 4, label: 'WTax', defaultComputation: 'Gross Taxable' }
];
const CONTRIBUTION_PERIOD_OPTIONS = ['Both', 'First', 'Second', 'First Half', 'Second Half', 'Monthly', 'Weekly'];
const CONTRIBUTION_TYPE_OPTIONS = ['Computed', 'Inputed'];
const CONTRIBUTION_COMPUTATION_OPTIONS_BY_TYPE = {
  1: ['Gross', 'Basic', 'Fix'],
  2: ['Fix', 'EE (2% of MC) max 100 & ER (2% of MC) max 100', 'EE (2% of MC) & ER (Fix 100)', 'EE (2% of MC + ER - 100) & ER (Fix 100)', 'EE & ER (2% of MC)'],
  3: ['Basic', 'Basic - Lost Hours', 'Gross', 'Fix'],
  4: ['Gross Taxable', 'Gross Pay', 'Fix', 'EWT']
};

function contributionComputationOptionsFor(typeId) {
  return CONTRIBUTION_COMPUTATION_OPTIONS_BY_TYPE[typeId] || [];
}

function contributionPeriodOptionsFor(payrollPeriod) {
  const value = String(payrollPeriod || '').toLowerCase();
  if (!value) return "Please select a payroll period first";
  if (value.includes('week')) return ['1st Week', '2nd Week', '3rd Week', '4th Week'];
  if (value.includes('semi') || value.includes('half')) return ['First Half', 'Second Half', 'Both'];
  if (value.includes('month')) return ['Monthly'];
  return CONTRIBUTION_PERIOD_OPTIONS;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// Pag-IBIG formulas encode their own rate/cap in the label, so they can be
// previewed instantly from the employee's Amount Rate (MC) on the client.
// Mirrors the server-side formula in payroll_computation.js.
function pagibigFormulaPreview(formula, mc) {
  const f = String(formula || '').trim().toLowerCase();
  const MC = Number(mc) || 0;

  if (f === 'fix') {
    return { ee_share: 100, er_share: 100 };
  }

  if (f === 'ee (2% of mc) max 100 & er (2% of mc) max 100') {
    const val = Math.min(round2(MC * 0.02), 100);
    return { ee_share: val, er_share: val };
  }

  if (f === 'ee (2% of mc) & er (fix 100)') {
    return { ee_share: round2(MC * 0.02), er_share: 100 };
  }

  if (f === 'ee (2% of mc + er - 100) & er (fix 100)') {
    return { ee_share: round2(MC * 0.02), er_share: 100 };
  }

  if (f === 'ee & er (2% of mc)') {
    const val = round2(MC * 0.02);
    return { ee_share: val, er_share: val };
  }

  return null;
}

// Determines what to show/allow for a contribution row's EE/ER/ECC fields.
// "Computed" rows whose formula has no deterministic client-side calculation
// (SSS Gross/Basic, PhilHealth Gross/Basic/Basic - Lost Hours, WTax Gross
// Taxable/Gross Pay/EWT) are resolved by the payroll engine's bracket tables
// at payroll-run time, so they're shown locked with an "Auto" placeholder
// instead of a stale manually-typed number.
function formatInputValue(columnId, value) {
  if (columnId === 2) {
    // Pag-IBIG (formula-based) → do not override
    return value;
  }

  if (value === '' || value === null || value === undefined) {
    return '0.00';
  }

  return value;
}

function getContributionPreview(column, row, mc) {
  const isComputed =
    String(row.type_option || '').toLowerCase() === 'computed';

  const computed = pagibigFormulaPreview(row.computation, mc);

  // fallback to computed values
  const baseEE = computed?.ee_share ?? '';
  const baseER = computed?.er_share ?? '';

  // INPUT MODE → editable but still uses formula as default
  if (!isComputed) {
    const isPagibig = column.id === 2;

    const computed = isPagibig
      ? pagibigFormulaPreview(row.computation, mc)
      : null;

    const baseEE = computed?.ee_share ?? '';
    const baseER = computed?.er_share ?? '';

    const eeValue =
      row.ee_share === '' || row.ee_share === null || row.ee_share === undefined
        ? baseEE
        : row.ee_share;

    const erValue =
      row.er_share === '' || row.er_share === null || row.er_share === undefined
        ? baseER
        : row.er_share;

    return {
      ee: isPagibig ? eeValue : formatInputValue(column.id, row.ee_share),
      er: isPagibig ? erValue : formatInputValue(column.id, row.er_share),
      ecc: isPagibig
        ? (row.ecc === '' || row.ecc == null ? '' : row.ecc)
        : formatInputValue(column.id, row.ecc),
      locked: false,
      auto: false
    };
  }

  // COMPUTED MODE → forced formula
  if (computed) {
    return {
      ee: baseEE === 0 ? '' : baseEE,
      er: baseER === 0 ? '' : baseER,
      ecc: '',
      locked: true,
      auto: true
    };
  }

  return {
    ee: '',
    er: '',
    ecc: '',
    locked: true,
    auto: true
  };
}

const ADD_EMPLOYEE_TABS = [
  { id: 'basic', label: 'Basic Information' },
  { id: 'systemAccount', label: 'Create Account Setting' },
  { id: 'payrollInfo', label: 'Payroll Information' },
  { id: 'payrollComputation', label: 'Payroll Computation' },
  { id: 'allowances', label: 'Allowance Payroll Entry' },
  { id: 'deductions', label: 'Deduction Payroll Entry' },
  { id: 'evaluations', label: 'Growth Evaluation' }
];

const SYSTEM_ACCOUNT_ROLES = ['Employee', 'HR', 'Admin'];
const EVALUATION_SCORE_FIELDS = [
  { key: 'productivity_score', label: 'Productivity' },
  { key: 'quality_score', label: 'Quality' },
  { key: 'teamwork_score', label: 'Teamwork' },
  { key: 'attendance_score', label: 'Attendance' },
  { key: 'initiative_score', label: 'Initiative' }
];

function createBlankEvaluationForm() {
  return {
    review_period: '',
    review_date: new Date().toISOString().slice(0, 10),
    evaluator_name: '',
    productivity_score: 80,
    quality_score: 80,
    teamwork_score: 80,
    attendance_score: 80,
    initiative_score: 80,
    strengths: '',
    improvement_areas: '',
    goals: '',
    action_plan: ''
  };
}

function todayDateInputValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDefaultContributionEntry(typeId) {
  const column = CONTRIBUTION_COLUMNS.find((item) => item.id === typeId);
  return {
    contribution_type_id: typeId,
    enabled: true,
    start_date: todayDateInputValue(),
    period: typeId === 4 ? 'Both' : 'Second Half',
    type_option: 'Computed',
    computation: column?.defaultComputation || '',
    ee_share: '',
    er_share: '',
    ecc: '',
    annualize: false
  };
}

function createBlankEmployeeForm() {
  const today = todayDateInputValue();

  return {
    emp_code: '',
    first_name: '',
    last_name: '',
    middle_name: '',
    nickname: '',
    gender: '',
    civil_status: '',
    birth_date: '',
    street: '',
    city: '',
    country: 'Philippines',
    zip_code: '',
    status: 'Active',
    tel_no: '',
    mobile_no: '',
    fax_no: '',
    email: '',
    website: '',
    company: '',
    location: '',
    branch: '',
    division: '',
    department: '',
    class: '',
    position: '',
    employee_type: '',
    training_date: today,
    date_hired: today,
    date_regular: today,
    date_resigned: '',
    date_terminated: '',
    end_of_contract: '',
    rehired_date: '',
    rehired: false,
    machine_id: '',
    sss_no: '',
    gsis_no: '',
    pagibig_no: '',
    philhealth_no: '',
    tin_no: '',
    branch_code: '',
    atm_no: '',
    bank_name: '',
    bank_branch: '',
    projects: '',
    salary_type: '',
    taxInsurance: {
      tax_status: '',
      tax_exemption: '',
      insurance: '',
      regional_minimum_wage_rate_id: ''
    },
    payrollComputation: {
      payroll_period: '',
      payroll_rate: '',
      ot_rate: '',
      days_in_year: '',
      days_in_week: '',
      hours_in_day: '',
      week_in_year: '',
      days_in_year_ot: '',
      rate_basis_ot: '',
      main_computation: '',
      basis_absences: '',
      basis_overtime: '',
      strict_no_overtime: false
    },
    systemAccount: {
      user_id: '',
      username: '',
      password: '',
      confirmPassword: '',
      role: 'Employee',
      account_status: ''
    },
    contributions: [],
    allowances: [],
    deductions: [],
    evaluations: [],
    evaluationSummary: {
      count: 0,
      averageScore: 0,
      latestScore: 0,
      latestRating: 'No Evaluation',
      growthDelta: 0
    },
    evaluationForm: createBlankEvaluationForm(),
    dependents: Array.from({ length: 4 }, () => ({ name: '', birthday: '' }))
  };
}

function canManageSystemAccounts(role) {
  const value = String(role || '').trim().toLowerCase();
  return value === 'admin' || value === 'system administrator' || value.includes('admin') || value === 'hr' || value.includes('human resource');
}

function escapeCsv(value) {
  const text = String(value ?? '');
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function statusClass(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'active') return 'present';
  if (value === 'terminated') return 'terminated';
  if (value === 'deleted' || value === 'deactivated') return 'terminated';
  if (value === 'end of contract' || value === 'resigned') return 'rest';
  return 'rest';
}

function evaluationRating(score) {
  const value = Number(score || 0);
  if (value >= 90) return 'Outstanding';
  if (value >= 80) return 'Exceeds Expectations';
  if (value >= 70) return 'Meets Expectations';
  if (value >= 60) return 'Developing';
  return 'Needs Support';
}

function evaluationOverall(form) {
  const total = EVALUATION_SCORE_FIELDS.reduce((sum, field) => {
    const score = Number(form?.[field.key] || 0);
    return sum + (Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0);
  }, 0);
  return Number((total / EVALUATION_SCORE_FIELDS.length).toFixed(2));
}

function evaluationTrendClass(delta) {
  const value = Number(delta || 0);
  if (value > 0) return 'present';
  if (value < 0) return 'terminated';
  return 'rest';
}

export default function EmployeeManagementPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState({
    totalEmployees: 0,
    activeEmployees: 0,
    inactiveEmployees: 0,
    newHires: 0
  });
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [entries, setEntries] = useState(10);
  const [sortBy, setSortBy] = useState('ID');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [selectedEmpCode, setSelectedEmpCode] = useState('');
  const [detailForm, setDetailForm] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addActiveTab, setAddActiveTab] = useState('basic');
  const [addForm, setAddForm] = useState(createBlankEmployeeForm);
  const [createdEmpCode, setCreatedEmpCode] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [allowanceOptions, setAllowanceOptions] = useState([]);
  const [deductionOptions, setDeductionOptions] = useState([]);
  const [saveNotice, setSaveNotice] = useState('');
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [showAccountConfirmPassword, setShowAccountConfirmPassword] = useState(false);

  const isEmployeeDetailsOpen = addModalOpen || detailModalOpen;
  const canCreateAccounts = canManageSystemAccounts(user?.role);

  async function loadSummary() {
    const { data } = await api.get('/employee_summary');
    setSummary({
      totalEmployees: Number(data.totalEmployees || 0),
      activeEmployees: Number(data.activeEmployees || 0),
      inactiveEmployees: Number(data.inactiveEmployees || 0),
      newHires: Number(data.newHires || 0)
    });
  }

  async function loadEmployeeList() {
    setLoading(true);
    setMessage('');

    try {
      const { data } = await api.get('/employee_list', {
        params: {
          limit: entries,
          page,
          sortBy
        }
      });

      if (!data.success) {
        throw new Error(data.message || 'Unable to load employee list.');
      }

      setEmployees(Array.isArray(data.employees) ? data.employees : []);
      setTotalEmployees(Number(data.totalEmployees || 0));
      setTotalPages(Math.max(1, Number(data.totalPages || 1)));
    } catch (err) {
      setEmployees([]);
      setMessage(getApiMessage(err, 'Unable to load employee list.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary().catch((err) => setMessage(getApiMessage(err, 'Unable to load employee summary.')));
  }, []);

  useEffect(() => {
    loadEmployeeList().catch((err) => setMessage(getApiMessage(err, 'Unable to load employee list.')));
  }, [entries, page, sortBy]);

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return employees;

    return employees.filter((employee) => {
      const text = [
        employee.emp_code,
        employee.full_name,
        employee.company,
        employee.department,
        employee.position,
        employee.email,
        employee.mobile_no,
        employee.status
      ].join(' ').toLowerCase();
      return text.includes(term);
    });
  }, [employees, search]);

  const showingStart = totalEmployees === 0 ? 0 : (page - 1) * entries + 1;
  const showingEnd = Math.min(page * entries, totalEmployees);

  async function handleDeleteEmployee(empCode) {
    if (!empCode) return;

    const confirmDelete = window.confirm(`Delete employee record ${empCode}? This removes saved employee information and cannot be undone.`);
    if (!confirmDelete) return;

    setMessage('Deleting employee...');

    try {
      const { data } = await api.delete(`/employee/${encodeURIComponent(empCode)}`, {
        data: {
          user_id: user?.user_id,
          admin_name: user?.full_name
        }
      });

      if (!data.success) {
        throw new Error(data.message || 'Unable to delete employee.');
      }

      setMessage(data.message || 'Employee record deleted successfully.');
      setDetailModalOpen(false);
      setSelectedEmpCode('');
      setCreatedEmpCode('');

      const isLastItemOnPage = employees.length <= 1 && page > 1;
      if (isLastItemOnPage) {
        setPage((current) => current - 1);
      } else {
        await Promise.all([loadSummary(), loadEmployeeList()]);
      }
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to delete employee.'));
    }
  }

  async function handleAccountStatusAction(action) {
    const empCode = createdEmpCode || selectedEmpCode;
    const account = addForm.systemAccount || {};
    if (!empCode || !account.user_id) {
      setMessage('No login account is linked to this employee.');
      return;
    }

    const actionText = {
      deactivate: { verb: 'deactivate', progress: 'Deactivating' },
      reactivate: { verb: 'reactivate', progress: 'Reactivating' },
      delete: { verb: 'delete', progress: 'Deleting' }
    };
    const confirmMessage = action === 'delete'
      ? `Delete login access for ${empCode}? The employee information will stay saved.`
      : `${actionText[action].verb[0].toUpperCase()}${actionText[action].verb.slice(1)} login access for ${empCode}? Employee information will stay saved.`;

    if (!window.confirm(confirmMessage)) return;

    setAddSaving(true);
    setMessage(`${actionText[action].progress} account...`);

    try {
      const { data } = await api.post(`/employee/${encodeURIComponent(empCode)}/system-account/status`, {
        action,
        user_id: user?.user_id,
        admin_name: user?.full_name,
        actor_role: user?.role
      });

      if (!data.success) {
        throw new Error(data.message || 'Unable to update account status.');
      }

      setAddForm((current) => ({
        ...current,
        systemAccount: {
          ...(current.systemAccount || {}),
          ...(data.systemAccount || {}),
          password: '',
          confirmPassword: ''
        }
      }));
      setMessage(data.message || 'Account status updated.');
      setSaveNotice(data.message || 'Account status updated.');
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to update account status.'));
      setSaveNotice('');
    } finally {
      setAddSaving(false);
    }
  }

  const [originalContributions, setOriginalContributions] = useState({});

  async function loadEmployeeDetails(empCode) {
    if (!empCode) return;

    setDetailLoading(true);
    setMessage('Loading employee details...');

    try {
      const { data } = await api.get(`/employee/${encodeURIComponent(empCode)}`);
      if (!data.success || !data.employee) {
        throw new Error(data.message || 'Unable to load employee details.');
      }

      const employee = data.employee;
      const dependents = Array.isArray(employee.dependents) ? employee.dependents : [];
      const evaluations = Array.isArray(employee.evaluations) ? employee.evaluations : [];
      const evaluationSummary = employee.evaluationSummary || createBlankEmployeeForm().evaluationSummary;
      const payrollComputation = employee.payrollComputation || {
        payroll_period: employee.payroll_period || '',
        payroll_rate: employee.payroll_rate || '',
        ot_rate: employee.ot_rate || '',
        days_in_year: employee.days_in_year ?? '',
        days_in_week: employee.days_in_week ?? '',
        main_computation: employee.main_computation ?? '',
        basis_absences: employee.basis_absences || '',
        basis_overtime: employee.basis_overtime || '',
        hours_in_day: employee.hours_in_day ?? '',
        week_in_year: employee.week_in_year ?? '',
        strict_no_overtime: !!employee.strict_no_overtime,
        days_in_year_ot: employee.days_in_year_ot ?? '',
        rate_basis_ot: employee.rate_basis_ot ?? ''
      };

      setSelectedEmpCode(empCode);
      setDetailForm(employee);
      setAddForm({
        ...createBlankEmployeeForm(),
        ...employee,
        taxInsurance: employee.taxInsurance || createBlankEmployeeForm().taxInsurance,
        payrollComputation,
        systemAccount: {
          ...createBlankEmployeeForm().systemAccount,
          ...(employee.systemAccount || {}),
          password: '',
          confirmPassword: ''
        },
        allowances: Array.isArray(employee.allowances) ? employee.allowances : [],
        deductions: Array.isArray(employee.deductions) ? employee.deductions : [],
        evaluations,
        evaluationSummary,
        evaluationForm: createBlankEvaluationForm(),
        dependents: [
          ...dependents,
          ...Array.from({ length: Math.max(0, 4 - dependents.length) }, () => ({ name: '', birthday: '' }))
        ].slice(0, Math.max(4, dependents.length))
      });
      setOriginalContributions(
        (employee.contributions || []).reduce((acc, item) => {
          acc[item.contribution_type_id] = { ...item };
          return acc;
        }, {})
      );
      setCreatedEmpCode(empCode);
      setAddActiveTab('basic');
      setDetailModalOpen(true);
      setMessage('Employee details loaded.');

      Promise.all([
        api.get('/allowances').catch(() => ({ data: [] })),
        api.get('/deductions').catch(() => ({ data: [] }))
      ]).then(([allowanceRes, deductionRes]) => {
        setAllowanceOptions(Array.isArray(allowanceRes.data) ? allowanceRes.data : []);
        setDeductionOptions(Array.isArray(deductionRes.data) ? deductionRes.data : []);
      });
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to load employee details.'));
    } finally {
      setDetailLoading(false);
    }
  }

  function updateDetailField(field, value) {
    setDetailForm((current) => ({ ...current, [field]: value }));
  }

  function openAddEmployeeModal() {
    setAddActiveTab('basic');
    setAddForm(createBlankEmployeeForm());
    setCreatedEmpCode('');
    setAddModalOpen(true);
    setDetailModalOpen(false);
    setMessage('');
    setSaveNotice('');

    Promise.all([
      api.get('/allowances').catch(() => ({ data: [] })),
      api.get('/deductions').catch(() => ({ data: [] }))
    ]).then(([allowanceRes, deductionRes]) => {
      setAllowanceOptions(Array.isArray(allowanceRes.data) ? allowanceRes.data : []);
      setDeductionOptions(Array.isArray(deductionRes.data) ? deductionRes.data : []);
    });
  }

  function closeAddEmployeeModal() {
    if (addSaving) return;
    setAddModalOpen(false);
    setCreatedEmpCode('');
    setSaveNotice('');
  }

  function updateAddField(field, value) {
    setAddForm((current) => {
      if (field !== 'emp_code') {
        return { ...current, [field]: value };
      }

      const account = current.systemAccount || {};
      const currentUsername = String(account.username || '');
      const previousEmpCode = String(current.emp_code || '');
      const shouldSyncUsername = !currentUsername || currentUsername === previousEmpCode;

      return {
        ...current,
        emp_code: value,
        systemAccount: {
          ...account,
          username: shouldSyncUsername ? value : account.username
        }
      };
    });
  }

  function updateNestedAddField(group, field, value) {
    setAddForm((current) => ({
      ...current,
      [group]: {
        ...(current[group] || {}),
        [field]: value
      }
    }));
  }

  function getContributionEntry(typeId) {
    const existing = (addForm.contributions || []).find((row) => String(row.contribution_type_id) === String(typeId));
    return existing || createDefaultContributionEntry(typeId);
  }

  function updateContributionEntry(typeId, field, value) {
    setAddForm((current) => {
      const rows = [...(current.contributions || [])];
      const index = rows.findIndex(
        (row) => String(row.contribution_type_id) === String(typeId)
      );

      const base = index >= 0 ? rows[index] : createDefaultContributionEntry(typeId);
      const nextRow = { ...base, [field]: value };

      if (field === 'period') nextRow.period_id = value;
      if (field === 'type_option') nextRow.type_option_id = value;

      if (field === 'computation') {
        nextRow.computation_id = value;

        if (String(typeId) === '2') {
          const preview = pagibigFormulaPreview(value, nextRow.mc); // use your MC field name here

          nextRow.ee_share = preview?.ee_share ?? '';
          nextRow.er_share = preview?.er_share ?? '';
          nextRow.ecc = 0;
        }
      }

      if (index >= 0) rows[index] = nextRow;
      else rows.push(nextRow);

      return { ...current, contributions: rows };
    });
  }

  function updateEntryRow(group, index, field, value) {
    setAddForm((current) => ({
      ...current,
      [group]: (current[group] || []).map((row, rowIndex) => (
        rowIndex === index ? { ...row, [field]: value } : row
      ))
    }));
  }

  function addEntryRow(group) {
    const blankRow = group === 'allowances'
      ? { allowance_type_id: '', period: '', amount: '' }
      : { deduction_type_id: '', period: '', amount: '' };

    setAddForm((current) => ({
      ...current,
      [group]: [...(current[group] || []), blankRow]
    }));
  }

  function removeEntryRow(group, index) {
    setAddForm((current) => ({
      ...current,
      [group]: (current[group] || []).filter((_, rowIndex) => rowIndex !== index)
    }));
  }

  function findAllowanceEntryIndex(rows, taxable, slotIndex) {
    let count = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const option = allowanceOptions.find((item) => String(item.id) === String(rows[index].allowance_type_id));
      const rowIsTaxable = Number(option?.taxable) === 1;
      if (taxable ? rowIsTaxable : !rowIsTaxable) {
        if (count === slotIndex) return index;
        count += 1;
      }
    }
    return -1;
  }

  function updateAllowanceEntrySlot(taxable, slotIndex, field, value) {
    setAddForm((current) => {
      const rows = [...(current.allowances || [])];
      const index = findAllowanceEntryIndex(rows, taxable, slotIndex);

      if (field === 'allowance_type_id') {
        if (!value) {
          if (index >= 0) rows.splice(index, 1);
          return { ...current, allowances: rows };
        }

        const option = allowanceOptions.find((item) => String(item.id) === String(value));
        const row = {
          ...(index >= 0 ? rows[index] : {}),
          allowance_type_id: value,
          period: index >= 0 ? rows[index].period : '',
          amount: index >= 0 ? rows[index].amount : (option?.amount ?? '0.00')
        };

        if (index >= 0) rows[index] = row;
        else rows.push(row);
        return { ...current, allowances: rows };
      }

      if (index < 0) return current;
      rows[index] = { ...rows[index], [field]: value };
      return { ...current, allowances: rows };
    });
  }

  function updateDependent(index, field, value) {
    setAddForm((current) => ({
      ...current,
      dependents: (current.dependents || []).map((dependent, rowIndex) => (
        rowIndex === index ? { ...dependent, [field]: value } : dependent
      ))
    }));
  }

  function updateEvaluationField(field, value) {
    setAddForm((current) => ({
      ...current,
      evaluationForm: {
        ...(current.evaluationForm || createBlankEvaluationForm()),
        [field]: value
      }
    }));
  }

  async function saveEvaluationTab() {
    const empCode = createdEmpCode || selectedEmpCode;
    const evaluationForm = addForm.evaluationForm || createBlankEvaluationForm();

    if (!empCode) {
      setMessage('Save Basic Information first before adding an evaluation.');
      setSaveNotice('');
      return;
    }

    if (!String(evaluationForm.review_period || '').trim() || !evaluationForm.review_date) {
      setMessage('Review period and review date are required in Growth Evaluation.');
      setSaveNotice('');
      return;
    }

    setAddSaving(true);
    setMessage('Saving Growth Evaluation...');

    try {
      const payload = {
        ...evaluationForm,
        user_id: user?.user_id,
        admin_name: user?.full_name
      };
      const { data } = await api.post(`/employee/${encodeURIComponent(empCode)}/evaluations`, payload);

      if (!data.success) {
        throw new Error(data.message || 'Unable to save evaluation.');
      }

      setAddForm((current) => ({
        ...current,
        evaluations: Array.isArray(data.evaluations) ? data.evaluations : current.evaluations || [],
        evaluationSummary: data.evaluationSummary || current.evaluationSummary,
        evaluationForm: createBlankEvaluationForm()
      }));
      setMessage(data.message || 'Employee evaluation saved successfully.');
      setSaveNotice(data.message || 'Employee evaluation saved successfully.');
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to save evaluation.'));
      setSaveNotice('');
    } finally {
      setAddSaving(false);
    }
  }

  function buildAddPayload() {
    const taxInsurance = addForm.taxInsurance || {};
    const systemAccount = addForm.systemAccount || {};
    const normalizeEntryRows = (rows, typeField) => (
      (Array.isArray(rows) ? rows : [])
        .map((row) => ({
          ...row,
          [typeField]: row?.[typeField] ? Number(row[typeField]) : null,
          period: ENTRY_PERIOD_OPTIONS.includes(row?.period) ? row.period : '',
          amount: row?.amount === '' || row?.amount === null || row?.amount === undefined ? '' : Number(row.amount)
        }))
        .filter((row) => row[typeField] && row.period && row.amount !== '' && Number.isFinite(Number(row.amount)))
    );
    const contributionRows = CONTRIBUTION_COLUMNS.map((column) => {
      const existing = (addForm.contributions || []).find((row) => String(row.contribution_type_id) === String(column.id));
      const row = { ...createDefaultContributionEntry(column.id), ...(existing || {}) };
      return {
        ...row,
        contribution_type_id: column.id,
        period_id: row.period || '',
        type_option_id: row.type_option || '',
        computation_id: row.computation || ''
      };
    });

    return {
      ...addForm,
      tax_status: taxInsurance.tax_status || '',
      tax_exemption: taxInsurance.tax_exemption || '',
      insurance: taxInsurance.insurance || '',
      regional_minimum_wage_rate_id: taxInsurance.regional_minimum_wage_rate_id || '',
      allowances: normalizeEntryRows(addForm.allowances, 'allowance_type_id'),
      deductions: normalizeEntryRows(addForm.deductions, 'deduction_type_id'),
      contributions: contributionRows,
      dependents: Array.isArray(addForm.dependents)
        ? addForm.dependents.filter((row) => row.name || row.birthday)
        : [],
      systemAccount: {
        user_id: systemAccount.user_id || '',
        username: String(systemAccount.username || '').trim(),
        password: systemAccount.password || '',
        role: systemAccount.role || 'Employee',
        account_status: systemAccount.account_status || ''
      },
      user_id: user?.user_id,
      admin_name: user?.full_name,
      actor_role: user?.role
    };
  }

  function validateAddTab(tabId) {
    if (tabId === 'basic') {
      if (!addForm.emp_code.trim()) return 'Employee ID is required in Basic Information.';
      if (!addForm.last_name.trim()) return 'Last Name is required in Basic Information.';
      if (!addForm.gender) return 'Gender is required in Basic Information.';
      if (!addForm.civil_status) return 'Civil Status is required in Basic Information.';
      if (!addForm.birth_date) return 'Birth Date is required in Basic Information.';
      if (!addForm.email.trim()) return 'Email is required in Basic Information.';
    }

    if (tabId === 'payrollInfo') {
      if (!addForm.training_date) return 'Training Date is required in Payroll Information.';
      if (!addForm.date_hired) return 'Date Hired is required in Payroll Information.';
      if (!addForm.company.trim()) return 'Company is required in Payroll Information.';
      if (!addForm.department.trim()) return 'Department is required in Payroll Information.';
    }

    if (tabId === 'payrollComputation') {
      const comp = addForm.payrollComputation || {};
      const taxInsurance = addForm.taxInsurance || {};
      if (!comp.payroll_period) return 'Payroll Period is required in Payroll Computation.';
      if (!comp.payroll_rate) return 'Payroll Rate is required in Payroll Computation.';
      if (comp.main_computation === '' || comp.main_computation === null || comp.main_computation === undefined) return 'Amount Rate is required in Payroll Computation.';
      if (comp.days_in_year === '' || comp.days_in_year === null || comp.days_in_year === undefined) return 'Days in a Year is required in Payroll Computation.';
      if (comp.days_in_week === '' || comp.days_in_week === null || comp.days_in_week === undefined) return 'Days in a Week is required in Payroll Computation.';
      if (comp.hours_in_day === '' || comp.hours_in_day === null || comp.hours_in_day === undefined) return 'Hours in a Day is required in Payroll Computation.';
      if (comp.week_in_year === '' || comp.week_in_year === null || comp.week_in_year === undefined) return 'Week in a Year is required in Payroll Computation.';
      if (!comp.ot_rate) return 'OT Rate is required in Payroll Computation.';
      if (!taxInsurance.tax_status) return 'Tax Status is required in Payroll Computation.';
      if (taxInsurance.tax_exemption === '' || taxInsurance.tax_exemption === null || taxInsurance.tax_exemption === undefined) return 'Tax Exemption is required in Payroll Computation.';
    }

    if (tabId === 'systemAccount') {
      const account = addForm.systemAccount || {};
      if (!canCreateAccounts) return 'Only Admin and HR users can create employee accounts.';
      if (!account.username.trim()) return 'Username is required in Create Account Setting.';
      if (!account.user_id && !account.password) return 'Password is required in Create Account Setting.';
      if (account.password && account.password.length < 8) return 'Password must be at least 8 characters.';
      if (account.password !== account.confirmPassword) return 'Passwords do not match in Create Account Setting.';
      if (!SYSTEM_ACCOUNT_ROLES.includes(account.role)) return 'Select a valid role in Create Account Setting.';
    }

    return '';
  }

  async function saveAddTab(tabId = addActiveTab) {
    const validationError = validateAddTab(tabId);
    if (validationError) {
      setMessage(validationError);
      setSaveNotice('');
      return;
    }

    if (tabId !== 'basic' && !createdEmpCode) {
      setMessage('Save Basic Information first before saving this tab.');
      setSaveNotice('');
      setAddActiveTab('basic');
      return;
    }

    if (tabId === 'evaluations') {
      await saveEvaluationTab();
      return;
    }

    setAddSaving(true);
    setMessage(`Saving ${ADD_EMPLOYEE_TABS.find((tab) => tab.id === tabId)?.label || 'employee'}...`);

    try {
      const payload = buildAddPayload();

      if (tabId === 'systemAccount') {
        const account = payload.systemAccount || {};
        const fullName = [addForm.first_name, addForm.last_name].filter(Boolean).join(' ').trim();
        const accountRequest = account.user_id
          ? api.put(`/employee/${encodeURIComponent(createdEmpCode)}/system-account`, {
              systemAccount: account,
              user_id: user?.user_id,
              admin_name: user?.full_name,
              actor_role: user?.role
            })
          : api.post('/register', {
              username: account.username,
              password: account.password,
              full_name: fullName,
              role: account.role || 'Employee',
              email: addForm.email
            });

        const { data } = await accountRequest;

        const savedUserId = data.systemAccountUserId || data.user_id || '';
        if (!data.success || !savedUserId) {
          throw new Error(data.message || 'Account was not saved in the database.');
        }

        setAddForm((current) => ({
          ...current,
          systemAccount: {
            ...(current.systemAccount || {}),
            user_id: savedUserId,
            username: data.systemAccount?.username || current.systemAccount?.username || '',
            role: data.systemAccount?.role || current.systemAccount?.role || 'Employee',
            account_status: data.systemAccount?.account_status || 'Active',
            password: '',
            confirmPassword: ''
          }
        }));
        const successMessage = data.message || `Account saved. Username '${account.username}' can now sign in.`;
        setMessage(successMessage);
        setSaveNotice(successMessage);
        return;
      }

      const request = createdEmpCode
        ? api.put(`/employee/update/${encodeURIComponent(createdEmpCode)}`, payload)
        : api.post('/add_employee', payload);

      const { data } = await request;
      if (!data.success) {
        throw new Error(data.message || 'Unable to save employee.');
      }

      const nextEmpCode = data.emp_code || payload.emp_code || createdEmpCode;
      const tabLabel = ADD_EMPLOYEE_TABS.find((tab) => tab.id === tabId)?.label || 'Employee';
      setCreatedEmpCode(nextEmpCode);
      setAddForm((current) => ({
        ...current,
        emp_code: nextEmpCode,
        systemAccount: {
          ...(current.systemAccount || {}),
          user_id: data.systemAccountUserId || current.systemAccount?.user_id || '',
          username: current.systemAccount?.username || nextEmpCode,
          account_status: data.systemAccount?.account_status || current.systemAccount?.account_status || '',
          password: '',
          confirmPassword: ''
        }
      }));
      setMessage(`${tabLabel} saved successfully.`);
      setSaveNotice(`${tabLabel} saved successfully.`);
      void Promise.all([loadSummary(), loadEmployeeList()]).catch(() => {});
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to save employee.'));
      setSaveNotice('');
    } finally {
      setAddSaving(false);
    }
  }

  async function saveEmployeeDetails() {
    if (!selectedEmpCode || !detailForm) {
      setMessage('Select an employee first.');
      return;
    }

    setDetailSaving(true);
    setMessage('Saving employee details...');

    try {
      const payload = {
        ...detailForm,
        dependents: Array.isArray(detailForm.dependents) ? detailForm.dependents : [],
        taxInsurance: detailForm.taxInsurance || {},
        user_id: user?.user_id,
        admin_name: user?.full_name,
        actor_role: user?.role
      };

      const { data } = await api.put(`/employee/update/${encodeURIComponent(selectedEmpCode)}`, payload);
      if (!data.success) {
        throw new Error(data.message || 'Unable to save employee details.');
      }

      const updatedEmpCode = detailForm.emp_code || selectedEmpCode;
      setSelectedEmpCode(updatedEmpCode);
      setMessage(data.message || 'Employee details saved successfully.');
      void Promise.all([loadSummary(), loadEmployeeList()]).catch(() => {});
      setDetailModalOpen(false);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to save employee details.'));
    } finally {
      setDetailSaving(false);
    }
  }

  function closeDetailModal() {
    if (detailSaving) return;
    setDetailModalOpen(false);
    setSelectedEmpCode('');
    setCreatedEmpCode('');
    setSaveNotice('');
  }

  async function exportEmployeeFile() {
    const query = window.prompt('Enter the employee name or employee code to export:');
    if (!query || !query.trim()) return;

    const formatInput = window.prompt('Choose export format: pdf, text, or csv', 'pdf');
    const format = String(formatInput || 'pdf').trim().toLowerCase();
    const exportFormat = format === 'txt' ? 'text' : format;

    if (!['pdf', 'text', 'csv'].includes(exportFormat)) {
      setMessage('Invalid export format. Please choose pdf, text, or csv.');
      return;
    }

    try {
      const response = await api.get('/employee_autocomplete', {
        params: { q: query.trim() }
      });
      const matches = Array.isArray(response.data?.employees) ? response.data.employees : [];
      const normalized = query.trim().toLowerCase();

      const employee = matches.find((item) => {
        return [item.emp_code, item.full_name, item.display]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase() === normalized || String(value).toLowerCase().includes(normalized));
      }) || matches[0];

      if (!employee) {
        setMessage('Employee not found.');
        return;
      }

      const { data, headers } = await api.get(`/employee/${encodeURIComponent(employee.emp_code)}/export`, {
        params: { format: exportFormat, generated_by: user?.full_name || sessionStorage.getItem('admin_name') || 'System User' },
        responseType: 'blob'
      });

      const blob = data instanceof Blob ? data : new Blob([data], { type: headers?.['content-type'] || 'application/octet-stream' });
      const disposition = headers?.['content-disposition'] || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const fallbackExtension = exportFormat === 'text' ? 'txt' : exportFormat;
      const fallbackName = `employee-${String(employee.emp_code || 'file').replace(/[^a-z0-9_-]+/gi, '_').toLowerCase()}.${fallbackExtension}`;
      const fileName = match?.[1] || fallbackName;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(`Employee file exported for ${employee.emp_code || 'employee'} as ${exportFormat.toUpperCase()}.`);
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to export employee file.'));
    }
  }

  function renderFormRow(label, control, options = {}) {
    return (
      <div className={`legacy-form-row${options.required ? ' required' : ''}`}>
        <label>
          {label}
          {options.required ? <span className="required-marker" aria-label="required">*</span> : null}
        </label>
        {control}
      </div>
    );
  }

  function renderBasicAddTab() {
    return (
      <div className="legacy-info-grid">
        <div className="legacy-form-box">
          <p className="required-fields-note">Required: Employee ID, Last Name, Gender, Civil Status, Birth Date, Email, Training Date, Date Hired, Company, Department, Employee Status.</p>
          {renderFormRow('Employee ID:', <input required aria-required="true" value={addForm.emp_code} onChange={(event) => updateAddField('emp_code', event.target.value)} />, { required: true })}
          {renderFormRow('Last Name:', <input required aria-required="true" value={addForm.last_name} onChange={(event) => updateAddField('last_name', event.target.value)} />, { required: true })}
          {renderFormRow('First Name:', <input value={addForm.first_name} onChange={(event) => updateAddField('first_name', event.target.value)} />)}
          {renderFormRow('Middle Name:', <input value={addForm.middle_name} onChange={(event) => updateAddField('middle_name', event.target.value)} />)}
          {renderFormRow('Nickname:', <input value={addForm.nickname} onChange={(event) => updateAddField('nickname', event.target.value)} />)}
          {renderFormRow('Gender:', (
            <select required aria-required="true" value={addForm.gender} onChange={(event) => updateAddField('gender', event.target.value)}>
              <option value="" disabled>-- Select --</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          ), { required: true })}
          {renderFormRow('Civil Status:', (
            <select required aria-required="true" value={addForm.civil_status} onChange={(event) => updateAddField('civil_status', event.target.value)}>
              <option value="" disabled>-- Select --</option>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Widowed">Widowed</option>
              <option value="Separated">Separated</option>
            </select>
          ), { required: true })}
          {renderFormRow('Birth Date:', <input type="date" required aria-required="true" value={addForm.birth_date} onChange={(event) => updateAddField('birth_date', event.target.value)} />, { required: true })}
          {renderFormRow('Street:', <input value={addForm.street} onChange={(event) => updateAddField('street', event.target.value)} />)}
          {renderFormRow('City:', <input value={addForm.city} onChange={(event) => updateAddField('city', event.target.value)} />)}
          {renderFormRow('Country:', <input value={addForm.country} onChange={(event) => updateAddField('country', event.target.value)} />)}
          {renderFormRow('ZIP Code:', <input value={addForm.zip_code} onChange={(event) => updateAddField('zip_code', event.target.value)} />)}
        </div>

        <div className="legacy-info-right">
          <div className="legacy-form-box">
            <h4>Contact Details</h4>
            {renderFormRow('Tel. No.:', <input value={addForm.tel_no} onChange={(event) => updateAddField('tel_no', event.target.value)} />)}
            {renderFormRow('Mobile No.:', <input value={addForm.mobile_no} onChange={(event) => updateAddField('mobile_no', event.target.value)} />)}
            {renderFormRow('Fax No.:', <input value={addForm.fax_no} onChange={(event) => updateAddField('fax_no', event.target.value)} />)}
            {renderFormRow('Email:', <input type="email" required aria-required="true" placeholder="sample@gmail.com" value={addForm.email} onChange={(event) => updateAddField('email', event.target.value)} />, { required: true })}
            {renderFormRow('Website:', <input type="url" placeholder="https://example.com" value={addForm.website} onChange={(event) => updateAddField('website', event.target.value)} />)}
          </div>

          <div className="legacy-form-box">
            <h4>Dependents</h4>
            <table className="dependents-table">
              <thead>
                <tr><th>Name</th><th>Birthday</th></tr>
              </thead>
              <tbody>
                {(addForm.dependents || []).map((dependent, index) => (
                  <tr key={`dependent-${index}`}>
                    <td>{index + 1}.<input value={dependent.name || ''} onChange={(event) => updateDependent(index, 'name', event.target.value)} /></td>
                    <td><input type="date" value={dependent.birthday || ''} onChange={(event) => updateDependent(index, 'birthday', event.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function renderSystemAccountAddTab() {
    const account = addForm.systemAccount || createBlankEmployeeForm().systemAccount;
    const accountStatus = account.account_status || (account.user_id ? 'Active' : 'Not Created');
    const fullName = [addForm.first_name, addForm.middle_name, addForm.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (!canCreateAccounts) {
      return (
        <div className="legacy-form-box">
          <h4>Create Account Setting</h4>
          <p className="muted">Only Admin and HR users can create login accounts for employees.</p>
        </div>
      );
    }

    return (
      <div className="legacy-form-box">
        <div className="legacy-payroll-grid">
          <div>
            <h4>Create Account Setting</h4>
            {renderFormRow('Employee Name:', <input value={fullName || 'Complete Basic Information first'} disabled />)}
            {renderFormRow('Username:', <input value={account.username || ''} onChange={(event) => updateNestedAddField('systemAccount', 'username', event.target.value)} />)}
            {renderFormRow('Role:', (
              <select value={account.role || 'Employee'} onChange={(event) => updateNestedAddField('systemAccount', 'role', event.target.value)}>
                {SYSTEM_ACCOUNT_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            ))}
            {renderFormRow('Account Status:', <span className={`status ${statusClass(accountStatus)}`}>{accountStatus}</span>)}
            {account.user_id ? (
              <div className="account-control-panel">
                <p className="muted">Deactivate or delete login access without deleting the employee file, payroll settings, contacts, or saved HR information.</p>
                <div className="toolbar account-actions">
                  {accountStatus === 'Active' ? (
                    <button type="button" className="btn secondary" onClick={() => handleAccountStatusAction('deactivate')} disabled={addSaving}>
                      Deactivate Account
                    </button>
                  ) : (
                    <button type="button" className="btn secondary" onClick={() => handleAccountStatusAction('reactivate')} disabled={addSaving}>
                      Reactivate Account
                    </button>
                  )}
                  <button type="button" className="btn danger" onClick={() => handleAccountStatusAction('delete')} disabled={addSaving || accountStatus === 'Deleted'}>
                    Delete Account
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div>
            <h4>Password</h4>
            {renderFormRow(account.user_id ? 'New Password:' : 'Password:', (
              <div className="password-field compact">
                <input
                  type={showAccountPassword ? 'text' : 'password'}
                  value={account.password || ''}
                  onChange={(event) => updateNestedAddField('systemAccount', 'password', event.target.value)}
                  placeholder={account.user_id ? 'Leave blank to keep current password' : ''}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowAccountPassword((current) => !current)}
                  aria-label={showAccountPassword ? 'Hide password' : 'Show password'}
                  title={showAccountPassword ? 'Hide password' : 'Show password'}
                >
                  <PasswordToggleIcon visible={showAccountPassword} />
                </button>
              </div>
            ))}
            {renderFormRow('Confirm Password:', (
              <div className="password-field compact">
                <input
                  type={showAccountConfirmPassword ? 'text' : 'password'}
                  value={account.confirmPassword || ''}
                  onChange={(event) => updateNestedAddField('systemAccount', 'confirmPassword', event.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowAccountConfirmPassword((current) => !current)}
                  aria-label={showAccountConfirmPassword ? 'Hide password' : 'Show password'}
                  title={showAccountConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  <PasswordToggleIcon visible={showAccountConfirmPassword} />
                </button>
              </div>
            ))}
            {account.user_id ? <p className="muted">Existing account found. Enter a new password only when changing it.</p> : null}
          </div>
        </div>
      </div>
    );
  }

  function renderPayrollInfoAddTab() {
    return (
      <div className="legacy-form-box">
        <h4>Payroll Information</h4>
        <div className="legacy-payroll-grid">
          <div>
            {renderFormRow('Training Date:', <input type="date" required aria-required="true" value={addForm.training_date} onChange={(event) => updateAddField('training_date', event.target.value)} />, { required: true })}
            {renderFormRow('Date Hired:', <input type="date" required aria-required="true" value={addForm.date_hired} onChange={(event) => updateAddField('date_hired', event.target.value)} />, { required: true })}
            {renderFormRow('Date Regular:', <input type="date" value={addForm.date_regular} onChange={(event) => updateAddField('date_regular', event.target.value)} />)}
            {renderFormRow('Date Resigned:', <input type="date" value={addForm.date_resigned} onChange={(event) => updateAddField('date_resigned', event.target.value)} />)}
            {renderFormRow('Date Terminated:', <input type="date" value={addForm.date_terminated} onChange={(event) => updateAddField('date_terminated', event.target.value)} />)}
            {renderFormRow('End of Contract:', <input type="date" value={addForm.end_of_contract} onChange={(event) => updateAddField('end_of_contract', event.target.value)} />)}
            <div className="legacy-checkbox-row">
              <input type="checkbox" checked={addForm.rehired} onChange={(event) => updateAddField('rehired', event.target.checked)} />
              <label>Rehired</label>
            </div>
            {renderFormRow('Rehired Date:', <input type="date" value={addForm.rehired_date} onChange={(event) => updateAddField('rehired_date', event.target.value)} disabled={!addForm.rehired} />)}
            <hr className="divider" />
            {renderFormRow('Machine ID:', <input value={addForm.machine_id} onChange={(event) => updateAddField('machine_id', event.target.value)} />)}
            {renderFormRow('SSS:', <input value={addForm.sss_no} onChange={(event) => updateAddField('sss_no', event.target.value)} />)}
            {renderFormRow('GSIS:', <input value={addForm.gsis_no} onChange={(event) => updateAddField('gsis_no', event.target.value)} />)}
            {renderFormRow('Pag-IBIG:', <input value={addForm.pagibig_no} onChange={(event) => updateAddField('pagibig_no', event.target.value)} />)}
            {renderFormRow('PhilHealth:', <input value={addForm.philhealth_no} onChange={(event) => updateAddField('philhealth_no', event.target.value)} />)}
            {renderFormRow('TIN:', <input value={addForm.tin_no} onChange={(event) => updateAddField('tin_no', event.target.value)} />)}
            {renderFormRow('Branch Code:', <input value={addForm.branch_code} onChange={(event) => updateAddField('branch_code', event.target.value)} />)}
          </div>
          <div>
            {renderFormRow('Company:', <select required aria-required="true" value={addForm.company || ''} onChange={(event) => updateAddField('company', event.target.value)}>
              <option value="" disabled>-- Select --</option>
              {companies.map((item, index) => (<option key={index} value={item.value}>{item.value}</option>))}
              </select>
            , { required: true })}
            {renderFormRow('Location:', <select value={addForm.location || ''} onChange={(event) => updateAddField('location', event.target.value)}>
              <option value="" disabled>-- Select --</option>
              {locations.map((item, index) => (<option key={index} value={item.value}>{item.value}</option>))}
              </select>
            )}
            {renderFormRow('Branch:', <select value={addForm.branch || ''} onChange={(event) => updateAddField('branch', event.target.value)}>
              <option value="" disabled>-- Select --</option>
              {branches.map((item, index) => (<option key={index} value={item.value}>{item.value}</option>))}
              </select>
            )}
            {renderFormRow('Division:', <select value={addForm.division || ''} onChange={(event) => updateAddField('division', event.target.value)}>
              <option value="" disabled>-- Select --</option>
              {divisions.map((item, index) => (<option key={index} value={item.value}>{item.value}</option>))}
              </select>
            )}
            {renderFormRow('Department:', <select required aria-required="true" value={addForm.department || ''} onChange={(event) => updateAddField('department', event.target.value)}>
              <option value="" disabled>-- Select --</option>
              {departments.map((item, index) => (<option key={index} value={item.value}>{item.value}</option>))}
              </select>
            , { required: true })}
            {renderFormRow('Class:', <select value={addForm.class || ''} onChange={(event) => updateAddField('class', event.target.value)}>
              <option value="" disabled>-- Select --</option>
              {classes.map((item, index) => (<option key={index} value={item.value}>{item.value}</option>))}
              </select>
            )}
            {renderFormRow('Position:', <select value={addForm.position || ''} onChange={(event) => updateAddField('position', event.target.value)}>
              <option value="" disabled>-- Select --</option>
              {positions.map((item, index) => (<option key={index} value={item.value}>{item.value}</option>))}
              </select>
            )}
            {renderFormRow('Employee Type:', <select value={addForm.employee_type || ''} onChange={(event) => updateAddField('employee_type', event.target.value)}>
              <option value="" disabled>-- Select --</option>
              {employeeTypes.map((item, index) => (<option key={index} value={item.value}>{item.value}</option>))}
              </select>
            )}
            {renderFormRow('Employee Status:', <select required aria-required="true" value={addForm.status || ''} onChange={(event) => updateAddField('status', event.target.value)}>
              <option value="" disabled>-- Select --</option>
              {employeeStatuses.map((item, index) => (<option key={index} value={item.value}>{item.value}</option>))}
              </select>
            , { required: true })}
            <hr className="divider" />
            {renderFormRow('ATM:', <input value={addForm.atm_no} onChange={(event) => updateAddField('atm_no', event.target.value)} />)}
            {renderFormRow('Bank:', <select value={addForm.bank || ''} onChange={(event) => updateAddField('bank', event.target.value)}>
              <option value="" disabled>-- Select --</option>
              {banks.map((item, index) => (<option key={index} value={item.value}>{item.value}</option>))}
              </select>
            )}
            {renderFormRow('Bank Branch:', <select value={addForm.bank_branch || ''} onChange={(event) => updateAddField('bank_branch', event.target.value)}>
              <option value="" disabled>-- Select --</option>
              {bankBranches.map((item, index) => (<option key={index} value={item.value}>{item.value}</option>))}
              </select>
            )}
            {renderFormRow('Projects:', <select value={addForm.project || ''} onChange={(event) => updateAddField('project', event.target.value)}>
              <option value="" disabled>-- Select --</option>
              {projects.map((item, index) => (<option key={index} value={item.value}>{item.value}</option>))}
              </select>
            )}
            {renderFormRow('Salary Type:', <select value={addForm.salary_type || ''} onChange={(event) => updateAddField('salary_type', event.target.value)}>
              <option value="" disabled>-- Select --</option>
              {salaryTypes.map((item, index) => (<option key={index} value={item.value}>{item.value}</option>))}
              </select>
            )}
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (!addForm.rehired && addForm.rehired_date) {
      updateAddField('rehired_date', '');
    }
  }, [addForm.rehired]);
  
  const fetchDropdownOptions = async (category) => {
    const res = await fetch(`/api/system_lists?category=${category}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  };

  const [companies, setCompanies] = useState([]);
  const [locations, setLocations] = useState([]);
  const [branches, setBranches] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [positions, setPositions] = useState([]);
  const [employeeTypes, setEmployeeTypes] = useState([]);
  const [employeeStatuses, setEmployeeStatuses] = useState([]);
  const [banks, setBanks] = useState([]);
  const [bankBranches, setBankBranches] = useState([]);
  const [projects, setProjects] = useState([]);
  const [salaryTypes, setSalaryTypes] = useState([]);
  const [payrollPeriods, setPayrollPeriods] = useState([]);
  const [payrollRates, setPayrollRates] = useState([]);

  useEffect(() => {
    const load = async () => {
      const [companies, locations, branches, divisions, departments, classes, positions, employeeTypes, employeeStatuses, banks, bankBranches, projects, salaryTypes, payrollPeriods, payrollRates] = await Promise.all([
        fetchDropdownOptions("company"),
        fetchDropdownOptions("location"),
        fetchDropdownOptions("branch"),
        fetchDropdownOptions("division"),
        fetchDropdownOptions("department"),
        fetchDropdownOptions("class"),
        fetchDropdownOptions("position"),
        fetchDropdownOptions("employee_type"),
        fetchDropdownOptions("status"),
        fetchDropdownOptions("bank"),
        fetchDropdownOptions("bank_branch"),
        fetchDropdownOptions("projects"),
        fetchDropdownOptions("salary_type"),
        fetchDropdownOptions("payroll_period"),
        fetchDropdownOptions("payroll_rate"),
      ]);

      setCompanies(companies);
      setLocations(locations);
      setBranches(branches);
      setDivisions(divisions);
      setDepartments(departments);
      setClasses(classes);
      setPositions(positions);
      setEmployeeTypes(employeeTypes);
      setEmployeeStatuses(employeeStatuses);
      setBanks(banks);
      setBankBranches(bankBranches);
      setProjects(projects);
      setSalaryTypes(salaryTypes);
      setPayrollPeriods(payrollPeriods);
      setPayrollRates(payrollRates);
    };

    load();
  }, []);

  useEffect(() => {
    const allowedPeriods = contributionPeriodOptionsFor(addForm.payrollComputation?.payroll_period);
    setAddForm((current) => {
      const rows = current.contributions || [];
      let changed = false;
      const nextRows = rows.map((row) => {
        if (row.period && !allowedPeriods.includes(row.period)) {
          changed = true;
          return { ...row, period: '', period_id: '' };
        }
        return row;
      });
      return changed ? { ...current, contributions: nextRows } : current;
    });
  }, [addForm.payrollComputation?.payroll_period]);

  const fetchTaxOptions = async () => {
    const res = await fetch('/api/tax_exemptions_lists');
    const data = await res.json();

    if (!data.success || !Array.isArray(data.tax_exemptions)) {
      return [];
    }

    return data.tax_exemptions;
  };

  const fetchRegionalOptions = async () => {
    const res = await fetch('/api/regional_minimum_wage_rates');
    const data = await res.json();

    if (!data.success || !Array.isArray(data.regional_wage_rates)) {
      return [];
    }

    return data.regional_wage_rates;
  };

  const [TAX_STATUS_OPTIONS, setTaxStatusOptions] = useState([]);
  const [REGIONAL_OPTIONS, setRegionalOptions] = useState([]);

  useEffect(() => {
    const load = async () => {
      const [taxStatusOptions] = await Promise.all([
        fetchTaxOptions(),
      ]);
      const [regionalOptions] = await Promise.all([
        fetchRegionalOptions(),
      ]);

      setTaxStatusOptions(taxStatusOptions);
      setRegionalOptions(regionalOptions);
    };

    load();
  }, []);

  function renderPayrollComputationAddTab() {
    const comp = addForm.payrollComputation || {};
    const tax = addForm.taxInsurance || {};

    return (
      <div className="legacy-form-box">
        <div className="legacy-payroll-grid">
          <div>
            <h4>Main Computation</h4>
            {renderFormRow(
              'Payroll Period:',
              <select
                required
                aria-required="true"
                value={comp.payroll_period || ''}
                onChange={(event) =>
                  updateNestedAddField('payrollComputation', 'payroll_period', event.target.value)
                }
              >
                <option value="" disabled>
                  -- Select --
                </option>
                {payrollPeriods.map((item, index) => (
                  <option key={index} value={item.value}>
                    {item.value}
                  </option>
                ))}
              </select>
            , { required: true })}
            {renderFormRow(
              'Payroll Rate:',
              <select
                required
                aria-required="true"
                value={comp.payroll_rate || ''}
                onChange={(event) =>
                  updateNestedAddField('payrollComputation', 'payroll_rate', event.target.value)
                }
              >
                <option value="" disabled>
                  -- Select --
                </option>
                {payrollRates.map((item, index) => (
                  <option key={index} value={item.value}>
                    {item.value}
                  </option>
                ))}
              </select>
            , { required: true })}
            {renderFormRow('Amount Rate:', <input type="number" required aria-required="true" value={comp.main_computation || ''} onChange={(event) => updateNestedAddField('payrollComputation', 'main_computation', event.target.value)} />, { required: true })}
            <hr className="divider" />
            <h4>Basis of Computation for Absences, Late and Undertime</h4>
            {renderFormRow('Days in a Year:', <input type="number" required aria-required="true" value={comp.days_in_year || ''} onChange={(event) => updateNestedAddField('payrollComputation', 'days_in_year', event.target.value)} />, { required: true })}
            {renderFormRow('Days in a Week:', <input type="number" required aria-required="true" min="1" max="7" value={comp.days_in_week || ''} onChange={(event) => updateNestedAddField('payrollComputation', 'days_in_week', event.target.value)} />, { required: true })}
            {renderFormRow('Hours in a Day:', <input type="number" required aria-required="true" min="1" max="24" value={comp.hours_in_day || ''} onChange={(event) => updateNestedAddField('payrollComputation', 'hours_in_day', event.target.value)} />, { required: true })}
            {renderFormRow('Week in a Year:', <input type="number" required aria-required="true" value={comp.week_in_year || ''} onChange={(event) => updateNestedAddField('payrollComputation', 'week_in_year', event.target.value)} />, { required: true })}
          </div>
          <div>
            <h4>Basis of Computation for Overtime</h4>
            <div className="legacy-checkbox-row">
              <input type="checkbox" checked={!!comp.strict_no_overtime} onChange={(event) => {
                const checked = event.target.checked;

                updateNestedAddField(
                  'payrollComputation',
                  'strict_no_overtime',
                  checked
                );

                if (checked) {
                  updateNestedAddField('payrollComputation', 'ot_rate', '');
                  updateNestedAddField('payrollComputation', 'days_in_year_ot', '');
                  updateNestedAddField('payrollComputation', 'rate_basis_ot', '');
                }
              }} />
              <label>STRICTLY NO OVERTIME</label>
            </div>
            {renderFormRow('OT Rate:', (
              <select
                required={!comp.strict_no_overtime}
                disabled={comp.strict_no_overtime}
                value={comp.ot_rate || ''}
                onChange={(event) =>
                  updateNestedAddField(
                    'payrollComputation',
                    'ot_rate',
                    event.target.value
                  )
                }
              >
              <option value="" disabled>-- Select --</option>
              {OT_RATE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              </select>
            ), { required: true })}
            {renderFormRow('Days in a Year (O.T.):', <input
              type="number"
              disabled={comp.strict_no_overtime}
              value={comp.days_in_year_ot || ''}
              onChange={(event) =>
                updateNestedAddField(
                  'payrollComputation',
                  'days_in_year_ot',
                  event.target.value
                )
              }
            />)}
            {renderFormRow('Rate Basis for OT:', <input
              type="number"
              placeholder="0.00"
              disabled={comp.strict_no_overtime}
              value={comp.rate_basis_ot || ''}
              onChange={(event) =>
                updateNestedAddField(
                  'payrollComputation',
                  'rate_basis_ot',
                  event.target.value
                )
              }
            />)}
            <hr className="divider" />
            <div>
              {renderFormRow('Tax Status:', (
                <select required value={tax.tax_status || ''} onChange={(event) => {
                  const selected = TAX_STATUS_OPTIONS.find(
                    item => item.description === event.target.value
                  );

                  updateNestedAddField(
                    'taxInsurance',
                    'tax_status',
                    event.target.value
                  );

                  updateNestedAddField(
                    'taxInsurance',
                    'tax_exemption',
                    selected?.amount || ''
                  );
                }}>
                  <option value="" disabled>
                    -- Select --
                  </option>

                  {TAX_STATUS_OPTIONS.map((option) => (
                    <option
                      key={option.description}
                      value={option.description}
                      data-amount={option.amount}
                    >
                      {option.description}
                    </option>
                  ))}
                </select>
              ), { required: true })}
              {renderFormRow('Tax Exemption:', <input type="number" required aria-required="true" disabled placeholder="0.00" value={tax.tax_exemption || ''} onChange={(event) => updateNestedAddField('taxInsurance', 'tax_exemption', event.target.value)} />, { required: true })}
              {renderFormRow('Premium paid on Health and/or Hospital Insurance:', <input type="number" placeholder="0.00" value={tax.insurance || ''} onChange={(event) => updateNestedAddField('taxInsurance', 'insurance', event.target.value)} />)}
              {renderFormRow('Regional Min. Wage Rate:', (
                <select
                  value={tax.regional_minimum_wage_rate_id || ''}
                  onChange={(event) => {
                    updateNestedAddField(
                      'taxInsurance',
                      'regional_minimum_wage_rate_id',
                      event.target.value
                    );
                  }}
                >
                  <option value="" disabled>
                    -- Select --
                  </option>

                  {REGIONAL_OPTIONS.map((option) => (
                    <option
                      key={option.regional_minimum_wage_rate_id}
                      value={option.regional_minimum_wage_rate_id}
                    >
                      {option.region_code}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          </div>
        </div>
        <div className="em-payroll-contribution-layout">
          <fieldset className="em-contribution-fieldset">
            <legend>Contributions</legend>
            <div className="em-contribution-scroll">
              <table className="em-contribution-table">
                <thead>
                  <tr>
                    <th className="em-contribution-label-col" />
                    {CONTRIBUTION_COLUMNS.map((column) => {
                      const row = getContributionEntry(column.id);
                      return (
                        <th key={column.id}>
                          <span>{column.label}</span>
                          <input
                            type="checkbox"
                            checked={!!row.enabled}
                            onChange={(event) => {
                              const enabled = event.target.checked;

                              if (enabled) {
                                const original = originalContributions[column.id];

                                if (original) {
                                  Object.entries(original).forEach(([field, value]) => {
                                    updateContributionEntry(column.id, field, value);
                                  });
                                } else {
                                  const defaults = createDefaultContributionEntry(column.id);

                                  Object.entries(defaults).forEach(([field, value]) => {
                                    updateContributionEntry(column.id, field, value);
                                  });
                                }
                              } else {
                                updateContributionEntry(column.id, 'enabled', false);
                                updateContributionEntry(column.id, 'start_date', '');
                                updateContributionEntry(column.id, 'period', '');
                                updateContributionEntry(column.id, 'type_option', '');
                                updateContributionEntry(column.id, 'computation', '');
                                updateContributionEntry(column.id, 'ee_share', '');
                                updateContributionEntry(column.id, 'er_share', '');
                                updateContributionEntry(column.id, 'ecc', '');
                              }
                            }}
                          />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Start Date</td>
                    {CONTRIBUTION_COLUMNS.map((column) => {
                      const row = getContributionEntry(column.id);
                      return (
                        <td key={column.id}>
                          <input
                            type="date"
                            value={row.start_date || ''}
                            disabled={!row.enabled}
                            onChange={(event) => updateContributionEntry(column.id, 'start_date', event.target.value)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td>Period</td>
                    {CONTRIBUTION_COLUMNS.map((column) => {
                      const row = getContributionEntry(column.id);
                      const hasPayrollPeriod = !!comp.payroll_period;

                      const periodOptions = hasPayrollPeriod
                        ? contributionPeriodOptionsFor(comp.payroll_period)
                        : [];

                      return (
                        <td key={column.id}>
                          <select
                            value={row.period || ''}
                            disabled={!row.enabled}
                            onChange={(event) =>
                              updateContributionEntry(column.id, 'period', event.target.value)
                            }
                          >
                            <option value="">
                              {comp.payroll_period
                                ? '-- Select --'
                                : '-- Please select a payroll period first --'}
                            </option>

                            {comp.payroll_period &&
                              contributionPeriodOptionsFor(comp.payroll_period).map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td>Type</td>
                    {CONTRIBUTION_COLUMNS.map((column) => {
                      const row = getContributionEntry(column.id);
                      return (
                        <td key={column.id}>
                          <select
                            value={row.type_option || ''}
                            disabled={!row.enabled}
                            onChange={(event) => updateContributionEntry(column.id, 'type_option', event.target.value)}
                          >
                            <option value="" disabled>-- Select --</option>
                            {CONTRIBUTION_TYPE_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td>Computation</td>
                    {CONTRIBUTION_COLUMNS.map((column) => {
                      const row = getContributionEntry(column.id);
                      return (
                        <td key={column.id}>
                          <select
                            value={row.computation || ''}
                            disabled={!row.enabled}
                            onChange={(event) => updateContributionEntry(column.id, 'computation', event.target.value)}
                          >
                            <option value="" disabled>-- Select --</option>
                            {contributionComputationOptionsFor(column.id).map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td>EE Share</td>
                    {CONTRIBUTION_COLUMNS.map((column) => {
                      const row = getContributionEntry(column.id);
                      const preview = getContributionPreview(column, row, comp.main_computation);
                      return (
                        <td key={column.id}>
                          <input
                            type="number"
                            value={preview.ee ?? ''}
                            placeholder={preview.auto ? 'Auto' : undefined}
                            disabled={!row.enabled || preview.locked}
                            onChange={(event) => updateContributionEntry(column.id, 'ee_share', event.target.value)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td>ER Share</td>
                    {CONTRIBUTION_COLUMNS.map((column) => {
                      const row = getContributionEntry(column.id);
                      const preview = getContributionPreview(column, row, comp.main_computation);
                      return (
                        <td key={column.id}>
                          <input
                            type="number"
                            value={preview.er ?? ''}
                            placeholder={preview.auto ? 'Auto' : undefined}
                            disabled={!row.enabled || preview.locked}
                            onChange={(event) => updateContributionEntry(column.id, 'er_share', event.target.value)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td>ECC</td>
                    {CONTRIBUTION_COLUMNS.map((column) => {
                      const row = getContributionEntry(column.id);
                      const preview = getContributionPreview(column, row, comp.main_computation);
                      return (
                        <td key={column.id}>
                          <input
                            type="number"
                            value={preview.ecc ?? ''}
                            placeholder={preview.auto ? 'Auto' : undefined}
                            disabled={!row.enabled || preview.locked}
                            onChange={(event) => updateContributionEntry(column.id, 'ecc', event.target.value)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </fieldset>
        </div>
      </div>
    );
  }

  function renderEntryRows(group, options, typeField) {
    const rows = addForm[group] || [];
    return (
      <div className="table-scroll compact">
        <table className={group === 'allowances' ? 'allowance-table' : 'deduction-table'}>
          <thead>
            <tr>
              <th>Type</th>
              <th>Period</th>
              <th>Amount</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan="4">No entries yet.</td></tr> : null}
            {rows.map((row, index) => (
              <tr key={`${group}-${index}`}>
                <td>
                  <select value={row[typeField] || ''} onChange={(event) => updateEntryRow(group, index, typeField, event.target.value)}>
                    <option value="">Select type</option>
                    {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                </td>
                <td>
                  <select value={row.period || ''} onChange={(event) => updateEntryRow(group, index, 'period', event.target.value)}>
                    <option value="">Select period</option>
                    {ENTRY_PERIOD_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </td>
                <td><input type="number" value={row.amount || ''} onChange={(event) => updateEntryRow(group, index, 'amount', event.target.value)} /></td>
                <td><button type="button" className="btn danger" onClick={() => removeEntryRow(group, index)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderAllowancePayrollEntry() {
    const rows = addForm.allowances || [];
    const renderSide = (taxable, title) => {
      const options = allowanceOptions.filter((option) => taxable ? Number(option.taxable) === 1 : Number(option.taxable) !== 1);
      const sideRows = rows.filter((row) => {
        const option = allowanceOptions.find((item) => String(item.id) === String(row.allowance_type_id));
        const rowIsTaxable = Number(option?.taxable) === 1;
        return taxable ? rowIsTaxable : !rowIsTaxable;
      });
      const displayRows = Array.from({ length: Math.max(7, sideRows.length) }, (_, index) => sideRows[index] || {});

      return (
        <div className="em-allowance-entry-panel">
          <table className="em-allowance-entry-table">
            <thead>
              <tr>
                <th className="em-entry-row-num"></th>
                <th>{title}</th>
                <th className="em-entry-period-col">Period</th>
                <th className="em-entry-amount-col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  <td className="em-entry-row-num">{index + 1}.</td>
                  <td>
                    <select
                      value={row.allowance_type_id || ''}
                      onChange={(event) => updateAllowanceEntrySlot(taxable, index, 'allowance_type_id', event.target.value)}
                    >
                      <option value=""></option>
                      {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select
                      value={row.period || ''}
                      disabled={!row.allowance_type_id}
                      onChange={(event) => updateAllowanceEntrySlot(taxable, index, 'period', event.target.value)}
                    >
                      <option value=""></option>
                      {ENTRY_PERIOD_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={row.allowance_type_id ? row.amount || '' : '0.00'}
                      disabled={!row.allowance_type_id}
                      onChange={(event) => updateAllowanceEntrySlot(taxable, index, 'amount', event.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    return (
      <div className="em-allowance-entry-grid">
        {renderSide(true, 'Taxable Allowances')}
        {renderSide(false, 'Non-Taxable Allowances')}
      </div>
    );
  }

  function updateDeductionEntrySlot(slotIndex, field, value) {
    setAddForm((current) => {
      const rows = [...(current.deductions || [])];
      const index = slotIndex < rows.length ? slotIndex : -1;

      if (field === 'deduction_type_id') {
        if (!value) {
          if (index >= 0) rows.splice(index, 1);
          return { ...current, deductions: rows };
        }

        const option = deductionOptions.find((item) => String(item.id) === String(value));
        const row = {
          ...(index >= 0 ? rows[index] : {}),
          deduction_type_id: value,
          period: index >= 0 ? rows[index].period : '',
          amount: index >= 0 ? rows[index].amount : (option?.amount ?? '0.00')
        };

        if (index >= 0) rows[index] = row;
        else rows.push(row);
        return { ...current, deductions: rows };
      }

      if (index < 0) return current;
      rows[index] = { ...rows[index], [field]: value };
      return { ...current, deductions: rows };
    });
  }

  function renderDeductionPayrollEntry() {
    const rows = addForm.deductions || [];
    const displayRows = Array.from({ length: Math.max(7, rows.length) }, (_, index) => rows[index] || {});

    return (
      <div className="em-deduction-entry-wrap">
        <table className="em-deduction-entry-table">
          <thead>
            <tr>
              <th className="em-entry-row-num"></th>
              <th>Deductions</th>
              <th className="em-entry-period-col">Period</th>
              <th className="em-entry-amount-col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, index) => (
              <tr key={`deduction-entry-${index}`}>
                <td className="em-entry-row-num">{index + 1}.</td>
                <td>
                  <select
                    value={row.deduction_type_id || ''}
                    onChange={(event) => updateDeductionEntrySlot(index, 'deduction_type_id', event.target.value)}
                  >
                    <option value=""></option>
                    {deductionOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                </td>
                <td>
                  <select
                    value={row.period || ''}
                    disabled={!row.deduction_type_id}
                    onChange={(event) => updateDeductionEntrySlot(index, 'period', event.target.value)}
                  >
                    <option value=""></option>
                    {ENTRY_PERIOD_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={row.deduction_type_id ? row.amount || '' : '0.00'}
                    disabled={!row.deduction_type_id}
                    onChange={(event) => updateDeductionEntrySlot(index, 'amount', event.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderEvaluationTab() {
    const evaluationForm = addForm.evaluationForm || createBlankEvaluationForm();
    const evaluations = Array.isArray(addForm.evaluations) ? addForm.evaluations : [];
    const summaryData = addForm.evaluationSummary || {};
    const currentScore = evaluationOverall(evaluationForm);
    const currentRating = evaluationRating(currentScore);
    const growthDelta = Number(summaryData.growthDelta || 0);

    return (
      <div className="legacy-form-box employee-evaluation-panel">
        <div className="evaluation-summary-grid">
          <div className="evaluation-metric">
            <span>Latest Score</span>
            <strong>{Number(summaryData.latestScore || 0).toFixed(1)}</strong>
            <small>{summaryData.latestRating || 'No Evaluation'}</small>
          </div>
          <div className="evaluation-metric">
            <span>Average Score</span>
            <strong>{Number(summaryData.averageScore || 0).toFixed(1)}</strong>
            <small>{Number(summaryData.count || 0)} review(s)</small>
          </div>
          <div className="evaluation-metric">
            <span>Growth Delta</span>
            <strong className={`status ${evaluationTrendClass(growthDelta)}`}>{growthDelta > 0 ? '+' : ''}{growthDelta.toFixed(1)}</strong>
            <small>Latest vs oldest</small>
          </div>
          <div className="evaluation-metric">
            <span>Draft Rating</span>
            <strong>{currentScore.toFixed(1)}</strong>
            <small>{currentRating}</small>
          </div>
        </div>

        <div className="legacy-payroll-grid">
          <div>
            <h4>Evaluation Scorecard</h4>
            {renderFormRow('Review Period:', <input value={evaluationForm.review_period || ''} onChange={(event) => updateEvaluationField('review_period', event.target.value)} placeholder="Q2 2026" />)}
            {renderFormRow('Review Date:', <input type="date" value={evaluationForm.review_date || ''} onChange={(event) => updateEvaluationField('review_date', event.target.value)} />)}
            {renderFormRow('Evaluator:', <input value={evaluationForm.evaluator_name || ''} onChange={(event) => updateEvaluationField('evaluator_name', event.target.value)} placeholder={user?.full_name || 'Evaluator name'} />)}
            <div className="evaluation-score-list">
              {EVALUATION_SCORE_FIELDS.map((field) => (
                <label key={field.key}>
                  <span>{field.label}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={evaluationForm[field.key] ?? 0}
                    onChange={(event) => updateEvaluationField(field.key, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
          <div>
            <h4>Growth Plan</h4>
            {renderFormRow('Strengths:', <textarea value={evaluationForm.strengths || ''} onChange={(event) => updateEvaluationField('strengths', event.target.value)} />)}
            {renderFormRow('Improvement Areas:', <textarea value={evaluationForm.improvement_areas || ''} onChange={(event) => updateEvaluationField('improvement_areas', event.target.value)} />)}
            {renderFormRow('Growth Goals:', <textarea value={evaluationForm.goals || ''} onChange={(event) => updateEvaluationField('goals', event.target.value)} />)}
            {renderFormRow('Action Plan:', <textarea value={evaluationForm.action_plan || ''} onChange={(event) => updateEvaluationField('action_plan', event.target.value)} />)}
          </div>
        </div>

        <div className="toolbar employee-tab-toolbar">
          <button type="button" className="btn" onClick={saveEvaluationTab} disabled={addSaving}>
            {addSaving ? 'Saving...' : 'Save Evaluation'}
          </button>
        </div>

        <div className="table-scroll compact evaluation-history-table">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Date</th>
                <th>Evaluator</th>
                <th>Overall</th>
                <th>Rating</th>
                <th>Growth Goals</th>
                <th>Action Plan</th>
              </tr>
            </thead>
            <tbody>
              {evaluations.length === 0 ? <tr><td colSpan="7">No evaluation records yet.</td></tr> : null}
              {evaluations.map((evaluation) => (
                <tr key={evaluation.evaluation_id || `${evaluation.review_period}-${evaluation.review_date}`}>
                  <td>{evaluation.review_period}</td>
                  <td>{evaluation.review_date}</td>
                  <td>{evaluation.evaluator_name || 'N/A'}</td>
                  <td>{Number(evaluation.overall_score || 0).toFixed(1)}</td>
                  <td><span className={`status ${statusClass(Number(evaluation.overall_score || 0) >= 70 ? 'Active' : 'Terminated')}`}>{evaluation.rating}</span></td>
                  <td>{evaluation.goals || 'N/A'}</td>
                  <td>{evaluation.action_plan || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderAddTabContent() {
    if (addActiveTab === 'basic') return renderBasicAddTab();
    if (addActiveTab === 'systemAccount') return renderSystemAccountAddTab();
    if (addActiveTab === 'payrollInfo') return renderPayrollInfoAddTab();
    if (addActiveTab === 'payrollComputation') return renderPayrollComputationAddTab();
    if (addActiveTab === 'evaluations') return renderEvaluationTab();
    if (addActiveTab === 'allowances') {
      return (
        <div className="legacy-form-box">
          {renderAllowancePayrollEntry()}
        </div>
      );
    }
    return (
      <div className="legacy-form-box">
        {renderDeductionPayrollEntry()}
      </div>
    );
  }

  function renderEmployeeProfileHeader() {
    const displayName = [addForm.first_name, addForm.middle_name, addForm.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || (addModalOpen ? 'New Employee' : 'Employee Details');

    return (
      <section className="legacy-profile-header">
        <div className="legacy-profile-photo">No Image</div>
        <div className="legacy-profile-info">
          <h2>{displayName}</h2>
          <p><strong>Employee ID:</strong> {addForm.emp_code || 'N/A'}</p>
          <p><strong>Department:</strong> {addForm.department || 'N/A'}</p>
          <p><strong>Position:</strong> {addForm.position || 'N/A'}</p>
          <p><strong>Status:</strong> {addForm.status || 'N/A'}</p>
        </div>
        <div className="legacy-profile-actions">
          <button
            type="button"
            className="btn"
            onClick={() => saveAddTab(addActiveTab)}
            disabled={addSaving}
          >
            {addSaving ? 'Saving...' : 'Save'}
          </button>
          {detailModalOpen ? (
            <button
              type="button"
              className="btn danger"
              onClick={() => handleDeleteEmployee(createdEmpCode || selectedEmpCode)}
              disabled={addSaving}
            >
              Delete Employee Record
            </button>
          ) : null}
          <button type="button" className="btn secondary" onClick={detailModalOpen ? closeDetailModal : closeAddEmployeeModal} disabled={addSaving}>
            Back
          </button>
        </div>
      </section>
    );
  }

  function renderInlineEmployeeDetails() {
    return (
      <section className="employee-details-inline">
        {renderEmployeeProfileHeader()}

        <div className="module-tabs employee-add-tabs">
          {ADD_EMPLOYEE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={addActiveTab === tab.id ? 'active' : ''}
              onClick={() => setAddActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {createdEmpCode && addModalOpen ? (
          <p className="muted">Created employee record: <strong>{createdEmpCode}</strong></p>
        ) : null}

        {renderAddTabContent()}

        <p className="message">{message}</p>

        <div className="legacy-add-footer">
          <button
            type="button"
            className="btn"
            onClick={() => saveAddTab(addActiveTab)}
            disabled={addSaving}
          >
            {addSaving ? 'Saving...' : `Save ${ADD_EMPLOYEE_TABS.find((tab) => tab.id === addActiveTab)?.label || 'Tab'}`}
          </button>
          <button type="button" className="btn secondary" onClick={detailModalOpen ? closeDetailModal : closeAddEmployeeModal} disabled={addSaving}>
            Back to Employee List
          </button>
        </div>

        {saveNotice ? (
          <div className="save-success-popup" role="status" aria-live="polite">
            <div>
              <h3>Successfully Saved</h3>
              <p>{saveNotice}</p>
            </div>
            <button type="button" className="btn" onClick={() => setSaveNotice('')}>OK</button>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <>
      <header className="header">
        <h2>Employee Management</h2>
        <p>View and manage employee records and details.</p>
      </header>

      {isEmployeeDetailsOpen ? renderInlineEmployeeDetails() : (
        <>
      <section className="summary">
        <div className="card"><span>Total Employees</span><strong>{summary.totalEmployees}</strong></div>
        <div className="card"><span>Active Employees</span><strong>{summary.activeEmployees}</strong></div>
        <div className="card"><span>Inactive Employees</span><strong>{summary.inactiveEmployees}</strong></div>
        <div className="card"><span>New Hires</span><strong>{summary.newHires}</strong></div>
      </section>

      <div className="legacy-employee-actions">
        <button type="button" className="btn secondary" onClick={openAddEmployeeModal}>+ Add New Employee</button>
        <button type="button" className="btn secondary" onClick={exportEmployeeFile}>Export Employee File</button>
      </div>

      <section className="table-section">
        <div className="table-header employee-mgmt-header">
          <div>
            <h3>Employee List</h3>
          </div>
        </div>

        <div className="employee-table-controls">
          <label>
            Show
            <select value={entries} onChange={(event) => { setPage(1); setEntries(Number(event.target.value)); }}>
              {PAGE_SIZE_OPTIONS.map((value) => (
                <option value={value} key={value}>{value}</option>
              ))}
            </select>
            entries
          </label>

          <div className="row-actions">
            <label>
              Quick Search
              <select value={sortBy} onChange={(event) => { setPage(1); setSortBy(event.target.value); }}>
                {SORT_OPTIONS.map((option) => (
                  <option value={option} key={option}>{option}</option>
                ))}
              </select>
            </label>

            <label>
              Search:
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Type to search..."
              />
            </label>
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Company</th>
                <th>Department</th>
                <th>Position</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9">Loading employee records...</td></tr>
              ) : filteredEmployees.length === 0 ? (
                <tr><td colSpan="9">No employees found.</td></tr>
              ) : filteredEmployees.map((employee) => (
                <tr key={employee.emp_code}>
                  <td>{employee.emp_code}</td>
                  <td>{employee.full_name}</td>
                  <td>{employee.company}</td>
                  <td>{employee.department}</td>
                  <td>{employee.position}</td>
                  <td>{employee.email}</td>
                  <td>{employee.mobile_no}</td>
                  <td><span className={`status ${statusClass(employee.status)}`}>{employee.status || 'N/A'}</span></td>
                  <td>
                    <div className="row-actions centered-actions">
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => loadEmployeeDetails(employee.emp_code)}
                      >
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="employee-table-footer">
          <div className="muted">
            Showing {showingStart} to {showingEnd} of {totalEmployees} entries
          </div>
          <div className="pagination-react">
            <button type="button" className="btn secondary" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
            <span className="page-chip">{page}</span>
            <button type="button" className="btn secondary" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button>
          </div>
        </div>

        <p className="message">{message}</p>
      </section>
        </>
      )}
    </>
  );
}
