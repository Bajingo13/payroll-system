function featureMoney(value) {
  return Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function featureTax(taxableIncome) {
  if (taxableIncome <= 20833) return 0;
  if (taxableIncome <= 33332) return (taxableIncome - 20833) * 0.15;
  if (taxableIncome <= 66666) return 1875 + (taxableIncome - 33333) * 0.2;
  if (taxableIncome <= 166666) return 8541.8 + (taxableIncome - 66667) * 0.25;
  if (taxableIncome <= 666666) return 33541.8 + (taxableIncome - 166667) * 0.3;
  return 183541.8 + (taxableIncome - 666667) * 0.35;
}

async function featureJson(response, fallbackMessage) {
  const raw = await response.text();
  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    const text = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    throw new Error(text || fallbackMessage || "Server returned an invalid response. Please restart the server and try again.");
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.message || fallbackMessage || "Request failed.");
  }

  return data;
}

async function fetchFeatureJson(url, options, fallbackMessage) {
  const response = await fetch(url, options);
  return featureJson(response, fallbackMessage);
}

function setupDocumentPage() {
  const tbody = document.getElementById("featureDocumentRows");
  const addButton = document.getElementById("featureAddDocument");
  if (!tbody || !addButton) return;

  let rows = [];

  function setMessage(message) {
    const node = document.getElementById("featureDocumentMessage");
    if (node) node.textContent = message || "";
  }

  function render() {
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6">No employee documents uploaded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.employee_id)}</td>
        <td>${escapeHtml(row.document_name)}</td>
        <td>${escapeHtml(row.document_type)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.expiry_date || "-")}</td>
        <td>${row.file_url ? `<a href="${row.file_url}" target="_blank" rel="noopener">${escapeHtml(row.file_name)}</a>` : escapeHtml(row.file_name || "-")}</td>
      </tr>
    `).join("");
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to read selected file."));
      reader.readAsDataURL(file);
    });
  }

  async function loadDocuments() {
    try {
      const response = await fetch("/api/employee_documents");
      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Unable to load documents.");
      rows = data.documents || [];
      render();
    } catch (err) {
      setMessage(err.message || "Unable to load documents.");
      render();
    }
  }

  addButton.addEventListener("click", async () => {
    const employee = document.getElementById("featureDocEmployee").value.trim();
    const documentName = document.getElementById("featureDocName").value.trim();
    const file = document.getElementById("featureDocFile").files[0];

    if (!employee || !documentName || !file) {
      setMessage("Employee ID, document name, and file are required.");
      return;
    }

    addButton.disabled = true;
    setMessage("Uploading document...");

    try {
      const fileData = await readFileAsDataUrl(file);
      const response = await fetch("/api/employee_documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employee,
          document_name: documentName,
          document_type: document.getElementById("featureDocType").value,
          status: document.getElementById("featureDocStatus").value,
          expiry_date: document.getElementById("featureDocExpiry").value || "",
          file_name: file.name,
          file_data: fileData
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to upload document.");
      }

      document.getElementById("featureDocEmployee").value = "";
      document.getElementById("featureDocName").value = "";
      document.getElementById("featureDocExpiry").value = "";
      document.getElementById("featureDocFile").value = "";
      setMessage("Document uploaded successfully.");
      await loadDocuments();
    } catch (err) {
      setMessage(err.message || "Unable to upload document.");
    } finally {
      addButton.disabled = false;
    }
  });

  loadDocuments();
}

function setupYearEndPayrollPage() {
  const fields = ["monthlyBasic", "monthsWorked", "absenceAdjustment", "loanBalance", "loanTerms", "nightHours", "hourlyRate", "premiumRate", "holidayHours", "holidayType", "taxableIncome", "taxWithheld"];
  if (!document.getElementById("thirteenthMonthResult")) return;

  function value(id) {
    return Number(document.getElementById(id)?.value || 0);
  }

  function calculate() {
    const thirteenthMonth = Math.max(0, (value("monthlyBasic") * value("monthsWorked")) / 12 - value("absenceAdjustment"));
    const amortization = value("loanTerms") > 0 ? value("loanBalance") / value("loanTerms") : 0;
    const nightDiff = value("nightHours") * value("hourlyRate") * (value("premiumRate") / 100);
    const holidayType = document.getElementById("holidayType")?.value || "regular";
    const holidayMultipliers = { regular: 2, special: 1.3, restday: 1.3 };
    const holidayPremium = value("holidayHours") * value("hourlyRate") * (holidayMultipliers[holidayType] || 1);
    const taxDelta = featureTax(value("taxableIncome")) - value("taxWithheld");

    document.getElementById("thirteenthMonthResult").textContent = `PHP ${featureMoney(thirteenthMonth)}`;
    document.getElementById("loanAmortizationResult").textContent = `PHP ${featureMoney(amortization)}`;
    document.getElementById("nightDiffResult").textContent = `PHP ${featureMoney(nightDiff)}`;
    document.getElementById("holidayPremiumResult").textContent = `PHP ${featureMoney(holidayPremium)}`;
    document.getElementById("taxAnnualizationResult").textContent = `PHP ${featureMoney(Math.abs(taxDelta))}`;
  }

  fields.forEach((id) => document.getElementById(id)?.addEventListener("input", calculate));
  fields.forEach((id) => document.getElementById(id)?.addEventListener("change", calculate));
  calculate();
}

function setupThirteenthMonthReport() {
  const rowsBody = document.getElementById("thirteenthMonthRows");
  const generateButton = document.getElementById("generateThirteenthReport");
  const exportButton = document.getElementById("exportThirteenthReport");
  const yearInput = document.getElementById("thirteenthReportYear");
  const messageNode = document.getElementById("thirteenthReportMessage");

  if (!rowsBody || !generateButton || !yearInput) return;

  let reportRows = [];
  let reportYear = new Date().getFullYear();

  function setMessage(message) {
    if (messageNode) messageNode.textContent = message || "";
  }

  function money(value) {
    return `PHP ${featureMoney(value)}`;
  }

  function updateSummary(totals = {}) {
    const employeeCount = document.getElementById("thirteenthEmployeeCount");
    const annualBasic = document.getElementById("thirteenthAnnualBasicTotal");
    const absenceTotal = document.getElementById("thirteenthAbsenceTotal");
    const payTotal = document.getElementById("thirteenthPayTotal");

    if (employeeCount) employeeCount.textContent = String(totals.employees || 0);
    if (annualBasic) annualBasic.textContent = money(totals.annual_basic || 0);
    if (absenceTotal) absenceTotal.textContent = money(totals.absence_deductions || 0);
    if (payTotal) payTotal.textContent = money(totals.thirteenth_month_pay || 0);
  }

  function renderRows() {
    if (!reportRows.length) {
      rowsBody.innerHTML = '<tr><td colspan="8">No active employees or payroll records found for this year.</td></tr>';
      return;
    }

    rowsBody.innerHTML = reportRows.map((row) => `
      <tr>
        <td>
          <strong>${escapeHtml(row.employee_name || "Employee")}</strong>
          <small>${escapeHtml(row.emp_code || "")}</small>
        </td>
        <td>${escapeHtml(row.department || "-")}</td>
        <td>${escapeHtml(row.position || "-")}</td>
        <td>${Number(row.payroll_records || 0)}</td>
        <td>${money(row.annual_basic)}</td>
        <td>${money(row.absence_deductions)}</td>
        <td>${money(row.net_basic)}</td>
        <td><strong>${money(row.thirteenth_month_pay)}</strong></td>
      </tr>
    `).join("");
  }

  async function loadReport() {
    const selectedYear = Number(yearInput.value) || new Date().getFullYear();
    generateButton.disabled = true;
    setMessage("Generating 13th month report...");

    try {
      const response = await fetch(`/api/thirteenth_month_report?year=${encodeURIComponent(selectedYear)}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to generate 13th month report.");
      }

      reportYear = data.year || selectedYear;
      reportRows = data.rows || [];
      updateSummary(data.totals || {});
      renderRows();
      setMessage(`13th month report generated for ${reportYear}.`);
    } catch (err) {
      reportRows = [];
      updateSummary();
      rowsBody.innerHTML = '<tr><td colspan="8">Unable to load 13th month report.</td></tr>';
      setMessage(err.message || "Unable to generate 13th month report.");
    } finally {
      generateButton.disabled = false;
    }
  }

  yearInput.value = String(new Date().getFullYear());
  generateButton.addEventListener("click", loadReport);
  exportButton?.addEventListener("click", () => {
    if (!reportRows.length) {
      setMessage("Generate a report before exporting.");
      return;
    }

    exportFeatureCsv(`13th-month-pay-${reportYear}.csv`, [
      ["Employee ID", "Employee Code", "Employee Name", "Department", "Position", "Payroll Records", "Annual Basic", "Absence Deduction", "Net Basic", "13th Month Pay"],
      ...reportRows.map((row) => [
        row.employee_id,
        row.emp_code || "",
        row.employee_name || "",
        row.department || "",
        row.position || "",
        row.payroll_records || 0,
        Number(row.annual_basic || 0).toFixed(2),
        Number(row.absence_deductions || 0).toFixed(2),
        Number(row.net_basic || 0).toFixed(2),
        Number(row.thirteenth_month_pay || 0).toFixed(2)
      ])
    ]);
    setMessage(`13th month CSV exported for ${reportYear}.`);
  });

  loadReport();
}

function setupOrganizationPage() {
  const tbody = document.getElementById("orgSetupRows");
  const saveButton = document.getElementById("saveOrgSetup");
  if (!tbody || !saveButton) return;

  const storageKey = "payroll_org_setups";
  let rows = [];

  function setMessage(message) {
    const node = document.getElementById("orgSetupMessage");
    if (node) node.textContent = message || "";
  }

  function money(value) {
    return `PHP ${featureMoney(value)}`;
  }

  function getRowsFromStorage() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(stored) && stored.length) return stored;
    } catch {
      // Keep defaults below.
    }

    return [
      {
        department: "Administration",
        parentDepartment: "Executive Office",
        manager: "HR Manager",
        designation: "Human Resources Officer",
        jobDescription: "Maintains employee records, supports HR operations, and coordinates workforce documentation.",
        level: "Staff",
        salaryGrade: "SG-08",
        basePay: 32000,
        allowances: "Meal, Transportation",
        benefits: "HMO, Government Benefits",
        status: "Active"
      },
      {
        department: "Finance",
        parentDepartment: "Operations",
        manager: "Payroll Manager",
        designation: "Payroll Specialist",
        jobDescription: "Processes payroll, validates statutory deductions, and prepares payroll reports.",
        level: "Staff",
        salaryGrade: "SG-10",
        basePay: 42000,
        allowances: "Meal, Transportation, Communication",
        benefits: "HMO, Insurance, Government Benefits",
        status: "Active"
      }
    ];
  }

  function saveRows() {
    localStorage.setItem(storageKey, JSON.stringify(rows));
  }

  function uniqueCount(field) {
    return new Set(rows.map((row) => String(row[field] || "").trim()).filter(Boolean)).size;
  }

  function updateSummary() {
    const departmentCount = document.getElementById("orgDepartmentCount");
    const designationCount = document.getElementById("orgDesignationCount");
    const salaryGradeCount = document.getElementById("orgSalaryGradeCount");
    const activeCount = document.getElementById("orgActiveCount");

    if (departmentCount) departmentCount.textContent = uniqueCount("department");
    if (designationCount) designationCount.textContent = uniqueCount("designation");
    if (salaryGradeCount) salaryGradeCount.textContent = uniqueCount("salaryGrade");
    if (activeCount) activeCount.textContent = rows.filter((row) => row.status === "Active").length;
  }

  function render() {
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="12">No organization setup records yet.</td></tr>';
      updateSummary();
      return;
    }

    tbody.innerHTML = rows.map((row, index) => `
      <tr>
        <td>${escapeHtml(row.department)}</td>
        <td>${escapeHtml(row.parentDepartment || "-")}</td>
        <td>${escapeHtml(row.manager || "-")}</td>
        <td>${escapeHtml(row.designation)}</td>
        <td class="left-cell">${escapeHtml(row.jobDescription || "-")}</td>
        <td>${escapeHtml(row.level || "-")}</td>
        <td>${escapeHtml(row.salaryGrade)}</td>
        <td>${money(row.basePay)}</td>
        <td>${escapeHtml(row.allowances || "-")}</td>
        <td>${escapeHtml(row.benefits || "-")}</td>
        <td><span class="status ${String(row.status).toLowerCase()}">${escapeHtml(row.status)}</span></td>
        <td>
          <div class="org-row-actions">
            <button type="button" class="btn org-edit-btn" data-index="${index}">Edit</button>
            <button type="button" class="btn danger org-delete-btn" data-index="${index}">Delete</button>
          </div>
        </td>
      </tr>
    `).join("");
    updateSummary();
  }

  function readForm() {
    return {
      department: document.getElementById("orgDepartment").value.trim(),
      parentDepartment: document.getElementById("orgParentDepartment").value.trim(),
      manager: document.getElementById("orgManager").value.trim(),
      designation: document.getElementById("orgDesignation").value.trim(),
      jobDescription: document.getElementById("orgJobDescription").value.trim(),
      level: document.getElementById("orgLevel").value,
      salaryGrade: document.getElementById("orgSalaryGrade").value.trim(),
      basePay: Number(document.getElementById("orgBasePay").value || 0),
      allowances: document.getElementById("orgAllowances").value.trim(),
      benefits: document.getElementById("orgBenefits").value.trim(),
      status: document.getElementById("orgStatus").value
    };
  }

  function fillForm(row, index = "") {
    document.getElementById("orgEditIndex").value = index;
    document.getElementById("orgDepartment").value = row?.department || "";
    document.getElementById("orgParentDepartment").value = row?.parentDepartment || "";
    document.getElementById("orgManager").value = row?.manager || "";
    document.getElementById("orgDesignation").value = row?.designation || "";
    document.getElementById("orgJobDescription").value = row?.jobDescription || "";
    document.getElementById("orgLevel").value = row?.level || "Staff";
    document.getElementById("orgSalaryGrade").value = row?.salaryGrade || "";
    document.getElementById("orgBasePay").value = row?.basePay || "";
    document.getElementById("orgAllowances").value = row?.allowances || "";
    document.getElementById("orgBenefits").value = row?.benefits || "";
    document.getElementById("orgStatus").value = row?.status || "Active";
  }

  saveButton.addEventListener("click", () => {
    const payload = readForm();
    if (!payload.department || !payload.designation || !payload.salaryGrade) {
      setMessage("Department, designation, and salary grade are required.");
      return;
    }

    const editIndex = document.getElementById("orgEditIndex").value;
    if (editIndex !== "") {
      rows[Number(editIndex)] = payload;
      setMessage("Organization setup updated.");
    } else {
      rows.push(payload);
      setMessage("Organization setup added.");
    }

    saveRows();
    render();
    fillForm(null);
  });

  document.getElementById("resetOrgSetup")?.addEventListener("click", () => {
    fillForm(null);
    setMessage("");
  });

  tbody.addEventListener("click", (event) => {
    const editButton = event.target.closest(".org-edit-btn");
    const deleteButton = event.target.closest(".org-delete-btn");

    if (editButton) {
      const index = Number(editButton.dataset.index);
      fillForm(rows[index], index);
      setMessage("Editing selected setup.");
      return;
    }

    if (deleteButton) {
      const index = Number(deleteButton.dataset.index);
      rows.splice(index, 1);
      saveRows();
      render();
      fillForm(null);
      setMessage("Organization setup deleted.");
    }
  });

  rows = getRowsFromStorage();
  render();
}

async function setupLeaveCalendarPage() {
  const calendar = document.getElementById("featureLeaveCalendar");
  if (!calendar) return;

  const userId = sessionStorage.getItem("user_id");
  const monthInput = document.getElementById("leaveCalendarMonth");
  const departmentFilter = document.getElementById("leaveCalendarDepartment");
  const rowsBody = document.getElementById("leaveCalendarRows");
  const messageNode = document.getElementById("leaveCalendarMessage");
  const pendingCount = document.getElementById("calendarPendingCount");
  const approvedCount = document.getElementById("calendarApprovedCount");
  const visibleCount = document.getElementById("calendarVisibleCount");

  let requests = [];

  function setMessage(message) {
    if (messageNode) messageNode.textContent = message || "";
  }

  function toDateOnly(value) {
    return String(value || "").slice(0, 10);
  }

  function selectedMonthParts() {
    const value = monthInput?.value || new Date().toISOString().slice(0, 7);
    const [year, month] = value.split("-").map(Number);
    return { value, year, month };
  }

  function dateInRange(dayDate, startDate, endDate) {
    return dayDate >= startDate && dayDate <= endDate;
  }

  function requestTouchesMonth(request, year, month) {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    const start = new Date(`${toDateOnly(request.start_date)}T00:00:00`);
    const end = new Date(`${toDateOnly(request.end_date)}T00:00:00`);
    return start <= monthEnd && end >= monthStart;
  }

  function visibleRequests() {
    const { year, month } = selectedMonthParts();
    const department = departmentFilter?.value || "";
    return requests.filter((request) => {
      const status = String(request.status || "");
      const allowedStatus = status === "Pending" || status === "Approved";
      const allowedDepartment = !department || String(request.department || "") === department;
      return allowedStatus && allowedDepartment && requestTouchesMonth(request, year, month);
    });
  }

  function populateDepartments() {
    if (!departmentFilter) return;
    const current = departmentFilter.value;
    const departments = [...new Set(requests.map((request) => String(request.department || "").trim()).filter(Boolean))].sort();
    departmentFilter.innerHTML = '<option value="">All Departments</option>' +
      departments.map((department) => `<option value="${escapeHtml(department)}">${escapeHtml(department)}</option>`).join("");
    departmentFilter.value = departments.includes(current) ? current : "";
  }

  function renderRows(list) {
    if (!rowsBody) return;
    if (!list.length) {
      rowsBody.innerHTML = '<tr><td colspan="7">No pending or approved leave requests for the selected month.</td></tr>';
      return;
    }

    rowsBody.innerHTML = list.map((request) => `
      <tr>
        <td>
          <strong>${escapeHtml(request.employee_name || request.emp_code || "Employee")}</strong>
          <small>${escapeHtml(request.emp_code || "")}</small>
        </td>
        <td>${escapeHtml(request.department || "-")}</td>
        <td>${escapeHtml(request.leave_name || "-")}</td>
        <td>${escapeHtml(toDateOnly(request.start_date))} to ${escapeHtml(toDateOnly(request.end_date))}</td>
        <td>${Number(request.total_days || 0).toFixed(2)}</td>
        <td><span class="status ${String(request.status || "").toLowerCase()}">${escapeHtml(request.status || "-")}</span></td>
        <td class="leave-reason-cell">${escapeHtml(request.reason || "-")}</td>
      </tr>
    `).join("");
  }

  function renderCalendar() {
    const { year, month } = selectedMonthParts();
    const list = visibleRequests();
    const days = new Date(year, month, 0).getDate();

    const pendingTotal = list.filter((request) => request.status === "Pending").length;
    const approvedTotal = list.filter((request) => request.status === "Approved").length;
    if (pendingCount) pendingCount.textContent = String(pendingTotal);
    if (approvedCount) approvedCount.textContent = String(approvedTotal);
    if (visibleCount) visibleCount.textContent = String(list.length);

    calendar.innerHTML = Array.from({ length: days }, (_, index) => {
      const day = index + 1;
      const currentDate = new Date(year, month - 1, day);
      const dayRequests = list.filter((request) => {
        const start = new Date(`${toDateOnly(request.start_date)}T00:00:00`);
        const end = new Date(`${toDateOnly(request.end_date)}T00:00:00`);
        return dateInRange(currentDate, start, end);
      });

      const hasApproved = dayRequests.some((request) => request.status === "Approved");
      const hasPending = dayRequests.some((request) => request.status === "Pending");
      const className = hasApproved ? "has-leave" : hasPending ? "pending-leave" : "";
      const labels = dayRequests.slice(0, 3).map((request) => `
        <span title="${escapeHtml(request.employee_name || request.emp_code || "")}">
          ${escapeHtml(request.status)}: ${escapeHtml(request.emp_code || request.employee_name || "Emp")}
        </span>
      `).join("");

      return `
        <div class="${className}">
          <strong>${day}</strong>
          <section>${labels || "<span>Open</span>"}</section>
        </div>
      `;
    }).join("");

    renderRows(list);
  }

  async function loadRequests() {
    if (!userId) {
      setMessage("Please log in again to load the leave calendar.");
      calendar.innerHTML = '<div><strong>-</strong><span>No session</span></div>';
      return;
    }

    try {
      setMessage("Loading leave calendar...");
      const params = new URLSearchParams({ user_id: userId });
      const response = await fetch(`/api/admin/leave-requests?${params.toString()}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load leave requests.");
      }

      requests = data.requests || [];
      populateDepartments();
      renderCalendar();
      setMessage("");
    } catch (err) {
      console.error("Leave calendar load error:", err);
      setMessage(err.message || "Unable to load leave calendar.");
      calendar.innerHTML = '<div><strong>-</strong><span>Error</span></div>';
      if (rowsBody) rowsBody.innerHTML = '<tr><td colspan="7">Unable to load leave requests.</td></tr>';
    }
  }

  if (monthInput && !monthInput.value) {
    monthInput.value = new Date().toISOString().slice(0, 7);
  }

  monthInput?.addEventListener("change", renderCalendar);
  departmentFilter?.addEventListener("change", renderCalendar);
  await loadRequests();
}

async function setupLeaveBalanceRulesPage() {
  const rowsBody = document.getElementById("leaveRuleRows");
  const saveButton = document.getElementById("saveLeaveRule");
  const resetButton = document.getElementById("resetLeaveRule");
  const typeSelect = document.getElementById("leaveRuleType");
  if (!rowsBody || !saveButton || !typeSelect) return;

  const userId = sessionStorage.getItem("user_id");
  let rules = [];
  let leaveTypes = [];

  const fields = {
    id: document.getElementById("leaveRuleId"),
    name: document.getElementById("leaveRuleName"),
    type: typeSelect,
    accrual: document.getElementById("leaveRuleAccrual"),
    frequency: document.getElementById("leaveRuleFrequency"),
    carryOver: document.getElementById("leaveRuleCarryOver"),
    adjustment: document.getElementById("leaveRuleAdjustment"),
    resetMonth: document.getElementById("leaveRuleResetMonth"),
    resetDay: document.getElementById("leaveRuleResetDay"),
    active: document.getElementById("leaveRuleActive"),
    message: document.getElementById("leaveRuleMessage"),
    activeCount: document.getElementById("leaveRuleActiveCount")
  };

  function setMessage(message) {
    if (fields.message) fields.message.textContent = message || "";
  }

  function formatDays(value) {
    return `${Number(value || 0).toFixed(2)} day(s)`;
  }

  function populateLeaveTypes() {
    fields.type.innerHTML = '<option value="">Select leave type</option>' +
      leaveTypes.map((type) => `<option value="${type.leave_type_id}">${escapeHtml(type.leave_name)}</option>`).join("");
  }

  function resetForm() {
    fields.id.value = "";
    fields.name.value = "";
    fields.type.value = "";
    fields.accrual.value = "1.25";
    fields.frequency.value = "Monthly";
    fields.carryOver.value = "5";
    fields.adjustment.value = "0";
    fields.resetMonth.value = "12";
    fields.resetDay.value = "31";
    fields.active.value = "1";
    setMessage("");
  }

  function renderRules() {
    if (fields.activeCount) {
      fields.activeCount.textContent = String(rules.filter((rule) => Number(rule.is_active) === 1).length);
    }

    if (!rules.length) {
      rowsBody.innerHTML = '<tr><td colspan="8">No leave balance rules configured yet.</td></tr>';
      return;
    }

    rowsBody.innerHTML = rules.map((rule) => `
      <tr>
        <td><strong>${escapeHtml(rule.rule_name)}</strong></td>
        <td>${escapeHtml(rule.leave_name)}</td>
        <td>${formatDays(rule.accrual_days)} / ${escapeHtml(rule.accrual_frequency)}</td>
        <td>${formatDays(rule.carry_over_limit)}</td>
        <td>${formatDays(rule.adjustment_days)}</td>
        <td>${String(rule.reset_month).padStart(2, "0")}/${String(rule.reset_day).padStart(2, "0")}</td>
        <td><span class="status ${Number(rule.is_active) === 1 ? "approved" : "cancelled"}">${Number(rule.is_active) === 1 ? "Active" : "Inactive"}</span></td>
        <td><button type="button" class="btn small-btn leave-rule-edit" data-rule-id="${rule.rule_id}">Edit</button></td>
      </tr>
    `).join("");
  }

  function fillForm(rule) {
    fields.id.value = rule.rule_id || "";
    fields.name.value = rule.rule_name || "";
    fields.type.value = rule.leave_type_id || "";
    fields.accrual.value = Number(rule.accrual_days || 0);
    fields.frequency.value = rule.accrual_frequency || "Monthly";
    fields.carryOver.value = Number(rule.carry_over_limit || 0);
    fields.adjustment.value = Number(rule.adjustment_days || 0);
    fields.resetMonth.value = Number(rule.reset_month || 12);
    fields.resetDay.value = Number(rule.reset_day || 31);
    fields.active.value = Number(rule.is_active) === 1 ? "1" : "0";
    setMessage("Editing selected leave balance rule.");
  }

  async function loadRules() {
    if (!userId) {
      setMessage("Please log in again to manage leave balance rules.");
      return;
    }

    try {
      const data = await fetchFeatureJson(
        `/api/admin/leave-balance-rules?user_id=${encodeURIComponent(userId)}`,
        undefined,
        "Unable to load leave balance rules. Restart the server if this route was just added."
      );

      leaveTypes = data.leaveTypes || [];
      rules = data.rules || [];
      populateLeaveTypes();
      renderRules();
    } catch (err) {
      console.error("Leave rule load error:", err);
      rowsBody.innerHTML = '<tr><td colspan="8">Unable to load leave balance rules.</td></tr>';
      setMessage(err.message || "Unable to load leave balance rules.");
    }
  }

  async function saveRule() {
    if (!userId) {
      setMessage("Please log in again to save leave balance rules.");
      return;
    }

    const payload = {
      user_id: userId,
      rule_id: fields.id.value || undefined,
      rule_name: fields.name.value.trim(),
      leave_type_id: fields.type.value,
      accrual_days: fields.accrual.value,
      accrual_frequency: fields.frequency.value,
      carry_over_limit: fields.carryOver.value,
      adjustment_days: fields.adjustment.value,
      reset_month: fields.resetMonth.value,
      reset_day: fields.resetDay.value,
      is_active: fields.active.value
    };

    if (!payload.rule_name || !payload.leave_type_id) {
      setMessage("Rule name and leave type are required.");
      return;
    }

    try {
      saveButton.disabled = true;
      setMessage("Saving leave balance rule...");
      const data = await fetchFeatureJson(
        "/api/admin/leave-balance-rules",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        },
        "Unable to save leave balance rule. Restart the server if this route was just added."
      );

      resetForm();
      await loadRules();
      setMessage(data.message || "Leave balance rule saved.");
    } catch (err) {
      setMessage(err.message || "Unable to save leave balance rule.");
    } finally {
      saveButton.disabled = false;
    }
  }

  rowsBody.addEventListener("click", (event) => {
    const button = event.target.closest(".leave-rule-edit");
    if (!button) return;
    const rule = rules.find((item) => Number(item.rule_id) === Number(button.dataset.ruleId));
    if (rule) fillForm(rule);
  });

  saveButton.addEventListener("click", saveRule);
  resetButton?.addEventListener("click", resetForm);
  await loadRules();
function exportFeatureCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });

  if (window.navigator && window.navigator.msSaveOrOpenBlob) {
    window.navigator.msSaveOrOpenBlob(blob, filename);
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

document.addEventListener("DOMContentLoaded", () => {
  setupDocumentPage();
  setupOrganizationPage();
  setupYearEndPayrollPage();
  setupThirteenthMonthReport();
  setupLeaveCalendarPage();
  setupLeaveBalanceRulesPage();

  document.querySelectorAll("[data-export-feature]").forEach((button) => {
    button.addEventListener("click", () => {
      const type = button.dataset.exportFeature;
      const rows = {
        government: [["Report", "Purpose"], ["BIR 1601-C", "Monthly withholding tax"], ["BIR 2316", "Employee tax certificate"], ["SSS R3/R5", "SSS contributions"], ["PhilHealth RF-1", "Premium remittance"], ["Pag-IBIG MCRF", "HDMF contributions"]],
        bank: [["Employee", "Bank", "Account", "Amount"], ["EMP-001", "BDO", "****1234", "30000"], ["EMP-002", "BPI", "****5678", "28500"]],
        backup: [["Backup", "Status"], ["Daily database backup", "Ready"], ["Restore log", "Ready"]],
        analytics: [["Metric", "Signal"], ["Attrition Risk", "Tenure, attendance, performance"], ["Payroll Forecast", "Headcount, gross pay, overtime"]]
      };
      exportFeatureCsv(`${type}-export.csv`, rows[type] || [["Feature", "Value"]]);
    });
  });
});
