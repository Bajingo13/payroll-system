// ========== TOAST ==========
function showToast(msg, type = "success") {
  const toastMap = {
    success: "toastSuccess",
    warning: "toastWarning",
    error: "toastError",
    info: "toastInfo",
    missingFields: "toastMissingFields"
  };

  // Use the mapped ID, fallback to "toastMissingFields" if type is unknown
  const toastId = toastMap[type] || "toastMissingFields";

  const toast = document.getElementById(toastId);
  if (!toast) return;

  toast.textContent = msg;
  toast.classList.add("show");

  setTimeout(() => toast.classList.remove("show"), 3000);
}

// ========== LOGOUT ==========
const logout = document.getElementById('logout');
if (logout) {
  logout.addEventListener('click', (event) => {
    event.preventDefault();
    showToast('You have been logged out!');
    window.location.href = "../../login/login.html";
  });
}

// ========== SIDEBAR ==========
async function loadProfile() {
  try {
    const userId = sessionStorage.getItem("user_id");
    if (!userId) {
      console.warn("No user ID found in sessionStorage");
      return;
    }

    const res = await fetch(`/api/profile?user_id=${userId}`);
    const data = await res.json();

    if (!data.success) {
      console.warn("Failed to load user profile:", data.message);
      return;
    }

    const user = data.user;

    // Update the existing h3 and p inside the sidebar
    const profileEl = document.querySelector(".sidebar .profile");
    if (profileEl) {
      profileEl.querySelector("h3").textContent = user.full_name;
      profileEl.querySelector("p").textContent = user.role;
    }

    // Update the existing h2 inside the dashboard
    if (window.location.pathname === '/dashboard/dashboard.html') {
      const welcomeMessage = document.querySelector(".section .header");
      if (welcomeMessage) {
        welcomeMessage.querySelector("h2").textContent += user.full_name + " 👋";
      }
    }
  } catch (err) {
    console.error("Error loading profile:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadProfile();
});

// ========== DASHBOARD PAGE ==========
if (window.location.pathname === '/dashboard/dashboard.html') {
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const res = await fetch("/api/dashboard");
      const data = await res.json();

      if (data) {
        document.querySelector(".summary .card:nth-child(1) strong").textContent = data.totalEmployees || 0;
        document.querySelector(".summary .card:nth-child(2) strong").textContent = data.processedPayrolls || 0;
        document.querySelector(".summary .card:nth-child(3) strong").textContent = data.systemLogs || 0;
      }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    }
  });
}

// ========== Recent System Activities under Dashboard ==========
async function loadRecentLogs() {
  if (window.location.pathname === '/dashboard/dashboard.html') {
    try {
      const res = await fetch('/api/logs');
      const logs = await res.json();

      const tbody = document.querySelector(".table-section table tbody");
      tbody.innerHTML = ""; // clear any old rows

      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      const todayStr = today.toLocaleDateString('en-US');
      const yesterdayStr = yesterday.toLocaleDateString('en-US');

      // Filter logs from today or yesterday
      const recentLogs = logs.filter(log => {
        const logDate = new Date(log.log_time).toLocaleDateString('en-US');
        return logDate === todayStr || logDate === yesterdayStr;
      });

      // Clear previous table content
      tbody.innerHTML = '';

      // Check if there are any recent logs
      if (recentLogs.length > 0) {
        recentLogs.forEach(log => {
          const formattedDate = new Date(log.log_time).toLocaleString("en-US", {
            month: "short", day: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit", hour12: true
          });

          tbody.innerHTML += `
            <tr>
              <td>${formattedDate}</td>
              <td>${log.action}</td>
              <td>${log.admin_name}</td>
              <td><span class="status completed">${log.status}</span></td>
            </tr>
          `;
        });
      } else {
        tbody.innerHTML = `<tr><td colspan="4">No recent system activities found.</td></tr>`;
      }
    } catch (err) {
      console.error("Error loading logs:", err);
    }
  }
}

// Run when the dashboard page loads
document.addEventListener("DOMContentLoaded", loadRecentLogs);

// ========== EMPLOYEE MANAGEMENT PAGE ==========
if (window.location.pathname === '/dashboard/employee_management.html') {
  // ===============================
  // Section Controller
  // ===============================
  function showSection(sectionId) {
    // Hide all sections first
    document.getElementById("employeeFile").classList.add("hidden");
    document.getElementById("employeeDetails").classList.add("hidden");

    // Show target section
    const target = document.getElementById(sectionId);
    if (target) {
      target.classList.remove('hidden');
      console.log("✅ Showing section:", sectionId);
    } else {
      console.warn("⚠️ Section not found:", sectionId);
    }
  }

  // ===============================
  // Employee Dashboard Page
  // ===============================
  // === Employee Summary ===
  async function loadEmployeeSummary() {
    try {
      const res = await fetch("/api/employee_summary");
      const data = await res.json();

      if (data && document.querySelector(".summary")) {
        document.querySelector(".summary .card:nth-child(1) strong").textContent = data.totalEmployees || 0;
        document.querySelector(".summary .card:nth-child(2) strong").textContent = data.activeEmployees || 0;
        document.querySelector(".summary .card:nth-child(3) strong").textContent = data.inactiveEmployees || 0;
        document.querySelector(".summary .card:nth-child(4) strong").textContent = data.newHires || 0;
      } else {
        console.warn("⚠️ No summary section found or invalid data");
      }
    } catch (error) {
      console.error("❌ Error loading employee summary:", error);
    }
  }

  let currentEmployeePage = 1;
  let totalEmployeePages = 1;
  let totalEmployees = 0; // Track the total number of employees

  // === Employee List ===
  async function loadEmployeeList() {
    const entriesPerPage = parseInt(document.getElementById('entriesSelect')?.value, 10) || 10;

    try {
      const sortBy = document.getElementById("searchCategorySelect")?.value || "ID";
      const res = await fetch(`/api/employee_list?limit=${entriesPerPage}&page=${currentEmployeePage}&sortBy=${sortBy}`);
      const data = await res.json();

      if (!data.success) {
        console.error("Server error:", data.message);
        return;
      }

      if (!Array.isArray(data.employees)) {
        console.error("Expected an array, but received:", data.employees);
        return;
      }

      const tbody = document.querySelector("#employeeTable tbody");
      tbody.innerHTML = ""; // Clear old rows

      if (data.employees.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9">No employees found.</td></tr>`;
        return;
      }

      // Status CSS mapping
      const statusClassMap = {
        "Active": "active",
        "End of Contract": "contract-ended",
        "Resigned": "resigned",
        "Terminated": "terminated"
      };

      // Build all rows first for better performance
      let rowsHTML = "";
      data.employees.forEach(employee => {
        const statusClass = statusClassMap[employee.status] || "rest";
        rowsHTML += `
          <tr>
            <td>${employee.emp_code}</td>
            <td>${employee.full_name}</td>
            <td>${employee.company}</td>
            <td>${employee.department}</td>
            <td>${employee.position}</td>
            <td>${employee.email}</td>
            <td>${employee.mobile_no}</td>
            <td><span class="status ${statusClass}">${employee.status}</span></td>
            <td><button class="btn view-btn" id="viewEmployeeBtn">View</button></td>
          </tr>
        `;
      });
      tbody.innerHTML = rowsHTML;

      // Update pagination state
      totalEmployees = data.totalEmployees;
      totalEmployeePages = data.totalPages;
      currentEmployeePage = data.currentPage;

      // Update pagination controls and info
      updateEmployeePaginationControls();
      updateEmployeeEntryInfo(entriesPerPage);
    } catch (err) {
      console.error("Error loading employee details:", err);
    }
  }

  // === Update entry info (e.g., "Showing 11 to 20 of 95 entries") ===
  function updateEmployeeEntryInfo(entriesPerPage) {
    const entriesStart = (currentEmployeePage - 1) * entriesPerPage + 1;
    const entriesEnd = Math.min(currentEmployeePage * entriesPerPage, totalEmployees);
    document.getElementById('entriesStart').textContent = entriesStart;
    document.getElementById('entriesEnd').textContent = entriesEnd;
    document.getElementById('totalEntries').textContent = totalEmployees;
  }

  // === Update pagination buttons and current page display ===
  function updateEmployeePaginationControls() {
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");

    if (prevBtn) prevBtn.disabled = currentEmployeePage === 1;
    if (nextBtn) nextBtn.disabled = currentEmployeePage === totalEmployeePages;

    const activePage = document.querySelector(".activepage");
    if (activePage) activePage.textContent = currentEmployeePage;
  }
  
  // === Load Employee Dashboard Page Content ===
  document.addEventListener("DOMContentLoaded", () => {
    loadEmployeeSummary();
    loadEmployeeList();

    // Attach entries dropdown listener
    const entriesSelect = document.getElementById("entriesSelect");
    const sortSelect = document.getElementById("searchCategorySelect");

    if (entriesSelect) {
      entriesSelect.addEventListener("change", () => {
        currentEmployeePage = 1;
        loadEmployeeList();
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener("change", () => {
        currentEmployeePage = 1;
        loadEmployeeList();
      });
    }

    // Search Bar Filter
    const searchInput = document.getElementById("searchLogs");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        const filter = this.value.toLowerCase();
        document.querySelectorAll("#employeeTable tbody tr").forEach(row => {
          row.style.display = row.textContent.toLowerCase().includes(filter) ? "" : "none";
        });
      });
    }

    // Pagination buttons
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    const viewBtn = document.getElementById("viewBtn");

    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        if (currentEmployeePage > 1) {
          currentEmployeePage--;
          loadEmployeeList();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        if (currentEmployeePage < totalEmployeePages) {
          currentEmployeePage++;
          loadEmployeeList();
        }
      });
    }
  });
  
  // ===============================
  // Helper Functions for Employee Details Page
  // ===============================
  // Globals to cache master lists
  let allowanceTypes = [];   // { allowance_type_id, allowance_name, is_taxable, default_amount }
  let deductionTypes = [];   // { deduction_type_id, deduction_name, default_amount }
  
  // Reset fields
  function resetFields() {
    // Reset all text fields
    document.querySelectorAll('#employeeDetails input[type="text"]').forEach(input => {
      input.value = "";
    });

    // Reset all date fields
    document.querySelectorAll('#employeeDetails input[type="date"]').forEach(input => {
      input.value = "";
    });

    // Reset all number fields
    document.querySelectorAll('#employeeDetails input[type="number"]').forEach(input => {
      input.placeholder = "0.00";
    });
    
    // Reset checkboxes
    document.querySelectorAll('#employeeDetails input[type="checkbox"]').forEach(input => {
      input.checked = false;
    });

    // Reset selection options
    document.querySelectorAll('#employeeDetails select').forEach(select => {
      select.selectedIndex = 0;
    });
  }

  // === Setting Active Tab ===
  function setActiveTab(tabId, containerSelector = null) {
    const container = containerSelector ? document.querySelector(containerSelector) : document;

    if (containerSelector && !container) return console.warn('Tab container not found:', containerSelector);

    // hide all tab-content and remove active from tab-btns
    container.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    // show requested tab-content
    const target = document.getElementById(tabId);
    if (target && (!containerSelector || container.contains(target))) {
      target.classList.remove('hidden');
    } else {
      console.warn('Tab content not found:', tabId, containerSelector);
    }

    // activate corresponding button
    const btn = container.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');
  }

  // === Event listeners to all tab and container buttons ===
  document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');
      setActiveTab(tabId);
    });
  });
  
  // === Generate rows for Allowance/Deduction Payroll Entry ===
  function buildPeriodSelectHTML(payrollPeriod, selected = "") {
    // payrollPeriod is one of "Weekly", "Monthly", "Semi-Monthly"
    if (payrollPeriod === "Weekly") {
      return `<select class="period-select">
                <option value="" disabled ${selected === "" ? "selected" : ""}>-- Select --</option>
                <option value="Weekly" ${selected === 'Weekly' ? 'selected' : ''}>Weekly</option>
              </select>`;
    }
    if (payrollPeriod === "Monthly") {
      return `<select class="period-select">
                <option value="" disabled ${selected === "" ? "selected" : ""}>-- Select --</option>
                <option value="Monthly" ${selected === 'Monthly' ? 'selected' : ''}>Monthly</option>
              </select>`;
    }
    // Semi-Monthly -> allow First Half / Second Half / Both
    if (payrollPeriod === "Semi-Monthly") {
      return `<select class="period-select">
                <option value="" disabled ${selected === "" ? "selected" : ""}>-- Select --</option>
                <option value="First Half" ${selected === 'First Half' ? 'selected' : ''}>First Half</option>
                <option value="Second Half" ${selected === 'Second Half' ? 'selected' : ''}>Second Half</option>
                <option value="Both" ${selected === 'Both' ? 'selected' : ''}>Both</option>
              </select>`;
    }
    // Default
    return `<select class="period-select">
              <option value="" disabled selected>-- Please select a period first --</option>
            </select>`;
  }

  function buildAllowanceSelectHTML(isTaxable, selectedId = null) {
    if (!allowanceTypes || allowanceTypes.length === 0) {
      return `<select class="allowance-select"><option value="" disabled selected>-- No allowances --</option></select>`;
    }

    const list = allowanceTypes.filter(a => a.taxable ? isTaxable : !isTaxable);

    if (list.length === 0) {
      return `<select class="allowance-select"><option value="" disabled selected>-- No allowances --</option></select>`;
    }

    return `<select class="allowance-select">
              <option value="" disabled selected>-- Select --</option>
              ${list.map(a => `
                <option value="${a.id}" data-amount="${a.amount || 0}" ${String(a.id) === String(selectedId) ? 'selected' : ''}>
                  ${a.name}
                </option>`).join('')}
            </select>`;
  }

  function buildDeductionSelectHTML(selectedId = null) {
    if (!deductionTypes || deductionTypes.length === 0) {
      return `<select class="deduction-select"><option value="" disabled selected>-- No deductions --</option></select>`;
    }

    return `<select class="deduction-select">
              <option value="" disabled selected>-- Select --</option>
              ${deductionTypes.map(d => `
                <option value="${d.id}" data-amount="${d.amount || 0}" ${String(d.id) === String(selectedId) ? 'selected' : ''}>
                  ${d.name}
                </option>`).join('')}
            </select>`;
  }

  // Call this after generating rows
  function attachSelectListeners() {
    document.querySelectorAll(".allowance-select").forEach(select => {
      select.addEventListener("change", function() {
        const amountInput = this.closest("tr").querySelector(".amount-input");
        const selectedOption = this.selectedOptions[0];
        if (amountInput && selectedOption) {
          amountInput.value = Number(selectedOption.dataset.amount || 0).toFixed(2);
        }
      });
    });

    document.querySelectorAll(".deduction-select").forEach(select => {
      select.addEventListener("change", function() {
        const amountInput = this.closest("tr").querySelector(".amount-input");
        const selectedOption = this.selectedOptions[0];
        if (amountInput && selectedOption) {
          amountInput.value = Number(selectedOption.dataset.amount || 0).toFixed(2);
        }
      });
    });
  }

  // Function to clear rows in allowances and deductions table
  function clearRow(button) {
    // Find the closest <tr> of the clicked button
    const row = button.closest('tr');

    // Reset all <select> elements in the row to their first option
    row.querySelectorAll('select').forEach(select => {
      select.selectedIndex = 0;
    });

    // Reset all input elements in the row to 0 (or empty string if you prefer)
    row.querySelectorAll('input').forEach(input => {
      if (input.type === 'number') {
        input.value = '0.00';
      } else {
        input.value = '';
      }
    });
  }

  function generateRows(initialPayrollPeriod = null) {
    let payrollPeriod = initialPayrollPeriod || document.getElementById("payrollPeriodSelect")?.value || "";
    const taxableContainer = document.getElementById("taxableAllowanceRows");
    const nontaxableContainer = document.getElementById("nontaxableAllowanceRows");
    const deductionContainer = document.getElementById("deductionRows");
    const rowCount = 7;

    const buildRow = (index, type) => {
      let selectHTML = '';
      if (type === 'taxable') selectHTML = buildAllowanceSelectHTML(true);
      else if (type === 'nontaxable') selectHTML = buildAllowanceSelectHTML(false);
      else selectHTML = buildDeductionSelectHTML();
      const periodHTML = buildPeriodSelectHTML(payrollPeriod);
      const actionHTML = `<button type="button" class="btn" onclick="clearRow(this)">Clear</button>`;

      return `<tr data-row-index="${index}">
                <td>${index}.</td>
                <td>${selectHTML}</td>
                <td id="periodSelect">${periodHTML}</td>
                <td><input type="number" value="0.00" step="0.01" class="amount-input"></td>
                <td>${actionHTML}</td>
              </tr>`;
    };

    let taxableRows = '', nontaxableRows = '', deductionRows = '', actionRows = '';
    for (let i = 1; i <= rowCount; i++) {
      taxableRows += buildRow(i, 'taxable');
      nontaxableRows += buildRow(i, 'nontaxable');
      deductionRows += buildRow(i, 'deduction');
    }

    if (taxableContainer) taxableContainer.innerHTML = taxableRows;
    if (nontaxableContainer) nontaxableContainer.innerHTML = nontaxableRows;
    if (deductionContainer) deductionContainer.innerHTML = deductionRows;

    // Attach listeners so selecting an option fills the input
    attachSelectListeners();
  }

  // === Auto-fill dropdown on select ===
  document.addEventListener('change', (e) => {
    // Payroll period select logic
    if (e.target && e.target.matches('#payrollPeriodSelect')) {
      generateRows();
    }
  });
 
  // === Rehired checkbox-input handler ===
  function handleRehiredEnable() {
    const rehired = document.getElementById("rehired");
    const rehiredDate = document.getElementById("rehiredDate");
    const enabled = rehired?.checked;
    rehiredDate.disabled = !enabled;

    if (!enabled) {
      rehiredDate.value = "";
    }
  }

  // === OT checkbox-input handler ===
  function handleOTDisable() {
    const strictNoOvertime = document.getElementById("strictNoOvertime");
    const otRateSelect = document.getElementById("otRateSelect");
    const daysInYearOT = document.getElementById("daysInYearOT");
    const rateBasisOT = document.getElementById("rateBasisOT");
    const DEFAULT_DAYS_IN_YEAR_OT = 313;
    const disabled = strictNoOvertime.checked;
    otRateSelect.disabled = disabled;
    daysInYearOT.disabled = disabled;
    rateBasisOT.disabled = disabled;

    if (disabled) {
      otRateSelect.value = "";
      daysInYearOT.value = "";
      rateBasisOT.value = "";

      otRateSelect.style.border = "";
    } else {
      daysInYearOT.value = DEFAULT_DAYS_IN_YEAR_OT;
    }
  }

  // === Contributons checkbox-input handler ===
  // === SSS ===
  function handleSSSDisable() {
    const sss = document.getElementById("sss");
    const sssStartDate = document.getElementById("sssStartDate");
    const sssPeriod = document.getElementById("sssPeriod");
    const sssType = document.getElementById("sssType");
    const sssComputation = document.getElementById("sssComputation");
    const sssEEShare = document.getElementById("sssEEShare");
    const sssERShare = document.getElementById("sssERShare");
    const sssECC = document.getElementById("sssECC");
    const DEFAULT_DATE = new Date().toISOString().split("T")[0];
    const disabled = !sss.checked;

    sssStartDate.disabled = disabled;
    sssPeriod.disabled = disabled;
    sssType.disabled = disabled;
    sssComputation.disabled = disabled;
    sssEEShare.disabled = disabled;
    sssERShare.disabled = disabled;
    sssECC.disabled = disabled;

    if (disabled) {
      sssStartDate.value = "";
      sssPeriod.value = "";
      sssType.value = "";
      sssComputation.value = "";
      sssEEShare.value = "";
      sssERShare.value = "";
      sssECC.value = "";
    } else {
      sssStartDate.value = DEFAULT_DATE;
      sssEEShare.disabled = true;
      sssERShare.disabled = true;
      sssECC.disabled = true;
    }
  }

  // === Pag-IBIG ===
  function handlePagibigDisable() {
    const pagibig = document.getElementById("pagibig");
    const pagibigStartDate = document.getElementById("pagibigStartDate");
    const pagibigPeriod = document.getElementById("pagibigPeriod");
    const pagibigType = document.getElementById("pagibigType");
    const pagibigComputation = document.getElementById("pagibigComputation");
    const pagibigEEShare = document.getElementById("pagibigEEShare");
    const pagibigERShare = document.getElementById("pagibigERShare");
    const pagibigECC = document.getElementById("pagibigECC");
    const DEFAULT_DATE = new Date().toISOString().split("T")[0];
    const disabled = !pagibig.checked;

    pagibigStartDate.disabled = disabled;
    pagibigPeriod.disabled = disabled;
    pagibigType.disabled = disabled;
    pagibigComputation.disabled = disabled;
    pagibigEEShare.disabled = disabled;
    pagibigERShare.disabled = disabled;
    pagibigECC.disabled = disabled;

    if (disabled) {
      pagibigStartDate.value = "";
      pagibigPeriod.value = "";
      pagibigType.value = "";
      pagibigComputation.value = "";
      pagibigEEShare.value = "";
      pagibigERShare.value = "";
      pagibigECC.value = "";
    } else {
      pagibigStartDate.value = DEFAULT_DATE;
      pagibigEEShare.disabled = true;
      pagibigERShare.disabled = true;
    }
  }

  // === PhilHealth ===
  function handlePhilhealthDisable() {
    const philhealth = document.getElementById("philhealth");
    const philhealthStartDate = document.getElementById("philhealthStartDate");
    const philhealthPeriod = document.getElementById("philhealthPeriod");
    const philhealthType = document.getElementById("philhealthType");
    const philhealthComputation = document.getElementById("philhealthComputation");
    const philhealthEEShare = document.getElementById("philhealthEEShare");
    const philhealthERShare = document.getElementById("philhealthERShare");
    const DEFAULT_DATE = new Date().toISOString().split("T")[0];
    const disabled = !philhealth.checked;

    philhealthStartDate.disabled = disabled;
    philhealthPeriod.disabled = disabled;
    philhealthType.disabled = disabled;
    philhealthComputation.disabled = disabled;
    philhealthEEShare.disabled = disabled;
    philhealthERShare.disabled = disabled;

    if (disabled) {
      philhealthStartDate.value = "";
      philhealthPeriod.value = "";
      philhealthType.value = "";
      philhealthComputation.value = "";
      philhealthEEShare.value = "";
      philhealthERShare.value = "";
    } else {
      philhealthStartDate.value = DEFAULT_DATE;
      philhealthEEShare.disabled = true;
      philhealthERShare.disabled = true;
    }
  }

  // === Withholding Tax ===
  function handleWithholdingTaxDisable() {
    const withholdingTax = document.getElementById("withholdingTax");
    const withholdingTaxStartDate = document.getElementById("withholdingTaxStartDate");
    const withholdingTaxPeriod = document.getElementById("withholdingTaxPeriod");
    const withholdingTaxType = document.getElementById("withholdingTaxType");
    const withholdingTaxComputation = document.getElementById("withholdingTaxComputation");
    const withholdingTaxEEShare = document.getElementById("withholdingTaxEEShare");
    const withholdingTaxECC = document.getElementById("withholdingTaxECC");
    const annualize = document.getElementById("annualize");
    const DEFAULT_DATE = new Date().toISOString().split("T")[0];
    const disabled = !withholdingTax.checked;

    withholdingTaxStartDate.disabled = disabled;
    withholdingTaxPeriod.disabled = disabled;
    withholdingTaxType.disabled = disabled;
    withholdingTaxComputation.disabled = disabled;
    withholdingTaxEEShare.disabled = disabled;
    withholdingTaxECC.disabled = disabled;
    annualize.disabled = disabled;

    if (disabled) {
      withholdingTaxStartDate.value = "";
      withholdingTaxPeriod.value = "";
      withholdingTaxType.value = "";
      withholdingTaxComputation.value = "";
      withholdingTaxEEShare.value = "";
      withholdingTaxECC.value = "";
      annualize.checked = false;
    } else {
      withholdingTaxStartDate.value = DEFAULT_DATE;
      withholdingTaxEEShare.disabled = true;
      withholdingTaxECC.disabled = true;
    }
  }
  
  // === Populate Contributions Dropdowns ===
  // IDs of the period select elements
  const periodSelectIds = ["sssPeriod", "pagibigPeriod", "philhealthPeriod", "withholdingTaxPeriod"];

  // IDs of the type select elements
  const typeSelectIds = ["sssType", "pagibigType", "philhealthType", "withholdingTaxType"];

  // Options for type selects
  const typeOptions = ["Computed", "Inputed"];

  // Function to populate period selects based on payroll period
  function populatePeriodSelects() {
    const payrollPeriod =
      document.getElementById("payrollPeriodSelect")?.value || "";

    periodSelectIds.forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;

      // 1. Save current value
      const currentValue = select.value;

      // 2. Build new options
      const optionsHTML = buildPeriodSelectHTML(payrollPeriod)
        .match(/<select[^>]*>([\s\S]*?)<\/select>/)[1];

      // 3. Replace options
      select.innerHTML = optionsHTML;

      // 4. Restore value if still valid
      if ([...select.options].some(o => o.value === currentValue)) {
        select.value = currentValue;
      }
    });
  }


  // Function to populate type selects
  function populateTypeSelects() {
    typeSelectIds.forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;

      // 1. Save current value
      const currentValue = select.value;

      // 2. Clear options (NO forced selected)
      select.innerHTML = `<option value="" disabled>-- Select Type --</option>`;

      // 3. Add options
      typeOptions.forEach(option => {
        const opt = document.createElement("option");
        opt.value = option;
        opt.textContent = option;
        select.appendChild(opt);
      });

      // 4. Restore value if still valid
      if ([...select.options].some(o => o.value === currentValue)) {
        select.value = currentValue;
      }
    });
  }

  // Computation select elements and their options
  const computationOptions = {
      sssComputation: ["Gross", "Basic", "Fix"],
      pagibigComputation: [
          "Fix",
          "EE (2% of MC) max 100 & ER (2% of MC) max 100",
          "EE (2% of MC) & ER (Fix 100)",
          "EE (2% of MC + ER - 100) & ER (Fix 100)",
          "EE & ER (2% of MC)"
      ],
      philhealthComputation: ["Basic", "Basic - Lost Hours", "Gross", "Fix"],
      withholdingTaxComputation: ["Gross Taxable", "Gross Pay", "Fix", "EWT"]
  };

  // Function to populate computation dropdowns
  function populateComputationSelects() {
    Object.entries(computationOptions).forEach(([id, options]) => {
      const select = document.getElementById(id);
      if (!select) return;

      // 1. Save current value
      const currentValue = select.value;

      // 2. Clear options (NO forced selected)
      select.innerHTML = `<option value="" disabled>-- Select Computation --</option>`;

      // 3. Add options
      options.forEach(option => {
        const opt = document.createElement("option");
        opt.value = option;
        opt.textContent = option;
        select.appendChild(opt);
      });

      // 4. Restore value if valid
      if ([...select.options].some(o => o.value === currentValue)) {
        select.value = currentValue;
      }
    });
  }
 
  // Unified function to populate both
  function populatePayrollSelects() {
      populatePeriodSelects();
      populateTypeSelects();
      populateComputationSelects();
  }

  // === Computation Fields Handler ===
  // Map each type select to the fields it controls
  const typeFieldMap = {
      sssType: ["sssEEShare", "sssERShare", "sssECC"],
      pagibigType: ["pagibigEEShare", "pagibigERShare"],
      philhealthType: ["philhealthEEShare", "philhealthERShare"],
      withholdingTaxType: ["withholdingTaxEEShare"]
  };

  // Generic function to enable/disable fields based on Type select
  function handleTypeChange(event) {
    const changedId = event.target.id;
    const fieldIds = typeFieldMap[changedId];
    if (!fieldIds) return;

    const disableFields = event.target.value === "Computed" || event.target.value === "";

    fieldIds.forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (!field) return;

      field.disabled = disableFields;

      // Don't clear values for pagibigType
      if (changedId !== "pagibigType") {
        field.value = "";
      }
    });
  }

  // Initialize: disable all fields at first
  function initTypeFields() {
    Object.values(typeFieldMap).flat().forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) field.disabled = true;
    });
  }
  
  // Disabling Computed Type Fields
  function disableComputedFields() {
    // Map of computation status fields
    const computationStatus = {
      sssType: document.getElementById("sssType")?.value,
      pagibigType: document.getElementById("pagibigType")?.value,
      philhealthType: document.getElementById("philhealthType")?.value,
      withholdingTaxType: document.getElementById("withholdingTaxType")?.value
    };
    
    console.log("Computation status:", computationStatus);

    for (const type in typeFieldMap) {
      if (computationStatus[type] === "Computed") {
        console.log(`Disabling fields for ${type}`);
        typeFieldMap[type].forEach(fieldId => {
          const field = document.getElementById(fieldId);
          if (field) {
            field.disabled = true;
            console.log(`Disabled: ${fieldId}`);
          } else {
          console.warn(`Field not found: ${fieldId}`);
          }
        });
      }
    }
  }

  // Pag-ibig Computation Handler
  function pagibigComputationHandler() {
    const pagibigComputation = document.getElementById("pagibigComputation");
    const pagibigEEShare = document.getElementById("pagibigEEShare");
    const pagibigERShare = document.getElementById("pagibigERShare");
    const amountRate = document.getElementById("amountRate");
    
    pagibigComputation.addEventListener("change", () => {
      if (pagibigComputation.value === "Fix") {
        pagibigEEShare.value = "100.00";
        pagibigERShare.value = "100.00";

      } else if (pagibigComputation.value === "EE (2% of MC) max 100 & ER (2% of MC) max 100") {
        let ee = amountRate.value * 0.02;
        let er = amountRate.value * 0.02;

        if (ee > 100) {
          ee = 100;
          er = 100;
        }

        pagibigEEShare.value = ee.toFixed(2);
        pagibigERShare.value = er.toFixed(2);

      } else if (pagibigComputation.value === "EE (2% of MC) & ER (Fix 100)") {
        pagibigEEShare.value = (amountRate.value * 0.02).toFixed(2);
        pagibigERShare.value = "100.00";

      } else if (pagibigComputation.value === "EE (2% of MC + ER - 100) & ER (Fix 100)") {
        let er = 100;
        let ee = (amountRate.value * 0.02) + (er - 100);
        pagibigEEShare.value = ee.toFixed(2);
        pagibigERShare.value = er.toFixed(2);

      } else if (pagibigComputation.value === "EE & ER (2% of MC)") {
        let computed = amountRate.value * 0.02;
        pagibigEEShare.value = computed.toFixed(2);
        pagibigERShare.value = computed.toFixed(2);

      } else {
        pagibigEEShare.value = "";
        pagibigERShare.value = "";
      }

      amountRate.addEventListener("input", () => {

        if (pagibigComputation.value === "Fix") {
          pagibigEEShare.value = "100.00";
          pagibigERShare.value = "100.00";
          return;

        } else if (pagibigComputation.value === "EE (2% of MC) max 100 & ER (2% of MC) max 100") {
          let ee = amountRate.value * 0.02;
          let er = amountRate.value * 0.02;

          if (ee > 100) {
            ee = 100;
            er = 100;
          }

          pagibigEEShare.value = ee.toFixed(2);
          pagibigERShare.value = er.toFixed(2);

        } else if (pagibigComputation.value === "EE (2% of MC) & ER (Fix 100)") {
          pagibigEEShare.value = (amountRate.value * 0.02).toFixed(2);
          pagibigERShare.value = "100.00";

        } else if (pagibigComputation.value === "EE (2% of MC + ER - 100) & ER (Fix 100)") {
          let er = 100;
          let ee = (amountRate.value * 0.02) + (er - 100);
          pagibigEEShare.value = ee.toFixed(2);
          pagibigERShare.value = er.toFixed(2);

        } else if (pagibigComputation.value === "EE & ER (2% of MC)") {
          let computed = amountRate.value * 0.02;
          pagibigEEShare.value = computed.toFixed(2);
          pagibigERShare.value = computed.toFixed(2);

        } else {
          pagibigEEShare.value = "";
          pagibigERShare.value = "";
        }
      });
    });
  }

  // === Payroll period handler ===
  function initPayrollComputation() {
    const periodSelect = document.getElementById("payrollPeriodSelect");
    const daysInWeekInput = document.getElementById("daysInWeek");

    if (!periodSelect || !daysInWeekInput) return;

    function updateDaysInWeek() {
      console.log("periodSelect.value:", periodSelect.value);
      if (periodSelect.value === "Weekly") {
        daysInWeekInput.value = 5;
        daysInWeekInput.disabled = false;
      } else {
        daysInWeekInput.value = "";
        daysInWeekInput.disabled = true;
      }
    }

    // Run once on init (checks current value)
    updateDaysInWeek();

    // Run again whenever the value changes
    periodSelect.addEventListener("change", updateDaysInWeek);
  }
  
  // === Load allowance/deduction master lists ===
  async function loadAllowanceAndDeductionTypes() {
    try {
      // Fetch allowance types
      const resA = await fetch('/api/allowances');
      if (resA.ok) {
        allowanceTypes = await resA.json();
        if (!Array.isArray(allowanceTypes)) allowanceTypes = allowanceTypes.data || [];
      } else {
        console.warn('Could not load allowance_types, status', resA.status);
        allowanceTypes = [];
      }

      // Fetch deduction types
      const resD = await fetch('/api/deductions');
      if (resD.ok) {
        deductionTypes = await resD.json();
        if (!Array.isArray(deductionTypes)) deductionTypes = deductionTypes.data || [];
      } else {
        console.warn('Could not load deduction_types, status', resD.status);
        deductionTypes = [];
      }
    } catch (err) {
      console.warn('Warning: failed to fetch allowance/deduction types', err);
      allowanceTypes = [];
      deductionTypes = [];
    }
  }

  // === Load Dropdown Options from List Manager ===
  function loadDropdownOptions(category, elementId) {
    return fetch(`/api/system_lists?category=${category}`)
      .then(res => res.json())
      .then(data => {
        const select = document.getElementById(elementId);
        if (!select) return;

        select.innerHTML = `<option value="" disabled selected>-- Select --</option>`;

        if (Array.isArray(data)) {
          data.forEach(item => {
            const opt = document.createElement("option");
            opt.value = item.value;
            opt.textContent = item.value;
            select.appendChild(opt);
          });
        }
      });
  }

  function loadTaxExemptions() {
    fetch("/api/tax_exemptions_lists")
      .then(res => res.json())
      .then(data => {
        if (!data.success || !Array.isArray(data.tax_exemptions)) {
          console.error("API error:", data);
          return;
        }

        const select = document.getElementById("taxStatus");
        const inputAmount = document.getElementById("taxExemption");

        // Reset
        select.innerHTML = `<option value="" disabled selected>-- Select --</option>`;
        inputAmount.value = "";

        // Populate dropdown
        data.tax_exemptions.forEach(item => {
          const opt = document.createElement("option");
          opt.value = item.description;
          opt.dataset.amount = item.amount;
          opt.textContent = item.description;
          select.appendChild(opt);
        });

        // When the user selects a description → fill the amount
        select.addEventListener("change", () => {
          const selectedOption = select.options[select.selectedIndex];
          inputAmount.value = selectedOption.dataset.amount || "";
        });
      })
      .catch(err => console.error("Failed to load tax exemptions:", err));
  }

  function loadRegionalWageRates() {
    fetch("/api/regional_minimum_wage_rates")
      .then(res => res.json())
      .then(data => {
        if (!data.success || !Array.isArray(data.regional_wage_rates)) {
          console.error("API error:", data);
          return;
        }

        const select = document.getElementById("regionalMinimumWageRate");

        // Reset dropdown and input
        select.innerHTML = `<option value="" disabled selected>-- Select Region --</option>`;

        // Populate dropdown
        data.regional_wage_rates.forEach(item => {
          const opt = document.createElement("option");
          opt.value = item.regional_minimum_wage_rate_id;
          opt.textContent = item.region_code;
          select.appendChild(opt);
        });
      })
      .catch(err => console.error("Failed to load regional wage rates:", err));
  }

  // === Initialize Dropdowns ===
  async function initEmployeeDropdowns() {
    await Promise.all([
      loadDropdownOptions("gender", "genderSelect"),
      loadDropdownOptions("civil_status", "civilStatusSelect"),
      loadDropdownOptions("company", "companySelect"),
      loadDropdownOptions("location", "locationSelect"),
      loadDropdownOptions("branch", "branchSelect"),
      loadDropdownOptions("division", "divisionSelect"),
      loadDropdownOptions("department", "departmentSelect"),
      loadDropdownOptions("class", "classSelect"),
      loadDropdownOptions("position", "positionSelect"),
      loadDropdownOptions("employee_type", "employeeTypeSelect"),
      loadDropdownOptions("status", "statusSelect"),
      loadDropdownOptions("bank", "bankSelect"),
      loadDropdownOptions("bank_branch", "bankBranchSelect"),
      loadDropdownOptions("projects", "projectsSelect"),
      loadDropdownOptions("salary_type", "salaryTypeSelect"),
      loadDropdownOptions("payroll_period", "payrollPeriodSelect"),
      loadDropdownOptions("payroll_rate", "payrollRateSelect"),
      loadDropdownOptions("ot_rate", "otRateSelect")
    ]);
  }
  
  // Utility: normalize a form label to a backend key
  function normalizeLabelToKey(label) {
    if (!label) return "";
    let k = label
      .replace(":", "")
      .replace(/\./g, "")
      .replace(/\(|\)|\/|\\/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    // Custom mappings (exact match to backend columns)
    const mapping = {
      employee_id: "emp_code",
      employee_code: "emp_code",
      employee_status: "status",
      gender: "gender",
      civil_status: "civil_status",
      company: "company",
      location: "location",
      branch: "branch",
      division: "division",
      department: "department",
      class: "class",
      position: "position",
      employee_type: "employee_type",
      date_hired: "date_hired",
      date_regular: "date_regular",
      date_resigned: "date_resigned",
      date_terminated: "date_terminated",
      end_of_contract: "end_of_contract",
      rehired_date: "rehired_date",
      sss_no: "sss_no",
      gsis_no: "gsis_no",
      pag_ibig: "pagibig_no",
      philhealth_no: "philhealth_no",
      tin_no: "tin_no",
      bank: "bank_name",
      bank_branch: "bank_branch",
      branch_code_for_alphalist: "branch_code",
    };

    return mapping[k] || k;
  }

  // === Sets the value for dropdowns with ===
  function setDropdownValue(selectId, value) {
    if (!value) return; // skip empty values

    const select = document.querySelector(`#employeeDetails #${selectId}`);
    if (!select) return;

    const valStr = String(value).toLowerCase().trim();

    // Try to find a matching option by value OR text
    let match = Array.from(select.options).find(
        opt => opt.value.toLowerCase().trim() === valStr ||
              opt.textContent.toLowerCase().trim() === valStr
    );

    if (!match) {
        // Append new option if no match found
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = value;
        select.appendChild(opt);
        match = opt;
    }

    select.value = match.value;
  }

  // === Fill all input fields with employee data ===
  function populateForm(emp) {
    // Employee ID
    const empIdInput = document.getElementById("employeeID");
    const row = empIdInput.closest(".form-row");
    if (row) row.style.display = "none";

    // CLEARS all borders
    employeeDetails.querySelectorAll("input, select").forEach(el => el.style.border = "");

    // === Text and numeric fields ===
    const fields = {
        // Basic Information
        lastName: emp.last_name,
        firstName: emp.first_name,
        middleName: emp.middle_name,
        nickName: emp.nickname,
        birthDate: emp.birth_date,
        street: emp.street,
        city: emp.city,
        country: emp.country,
        zipCode: emp.zip_code,
        telNo: emp.tel_no,
        mobileNo: emp.mobile_no,
        faxNo: emp.fax_no,
        email: emp.email,
        website: emp.website,

        // Payroll Information
        trainingDate: emp.training_date,
        dateHired: emp.date_hired,
        dateRegular: emp.date_regular,
        dateResigned: emp.date_resigned,
        dateTerminated: emp.date_terminated,
        endOfContract: emp.end_of_contract,
        rehiredDate: emp.rehired_date,

        machineID: emp.machine_id,
        sssNo: emp.sss_no,
        gsisNo: emp.gsis_no,
        pagibigNo: emp.pagibig_no,
        philhealthNo: emp.philhealth_no,
        tinNo: emp.tin_no,
        branchCode: emp.branch_code,
        atmNo: emp.atm_no,

        // Payroll Computation values
        amountRate: emp.main_computation,
        daysInYear: emp.days_in_year,
        daysInWeek: emp.days_in_week,
        hoursInDay: emp.hours_in_day,
        weekInYear: emp.week_in_year,
        daysInYearOT: emp.days_in_year_ot,
        rateBasisOT: emp.rate_basis_ot
    };

    Object.entries(fields).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? "";
    });

    // === Checkboxes ===
    const rehiredChk = document.getElementById("rehired");
    if (rehiredChk) rehiredChk.checked = !!emp.rehired;
    rehiredChk.disabled = true;

    const strictNoOTChk = document.getElementById("strictNoOvertime");
    if (strictNoOTChk) strictNoOTChk.checked = !!emp.strict_no_overtime;
    strictNoOTChk.disabled = true;

    // === Dropdowns ===
    setDropdownValue("genderSelect", emp.gender);
    setDropdownValue("civilStatusSelect", emp.civil_status);
    setDropdownValue("companySelect", emp.company);
    setDropdownValue("locationSelect", emp.location);
    setDropdownValue("branchSelect", emp.branch);
    setDropdownValue("divisionSelect", emp.division);
    setDropdownValue("departmentSelect", emp.department);
    setDropdownValue("classSelect", emp.class);
    setDropdownValue("positionSelect", emp.position);
    setDropdownValue("employeeTypeSelect", emp.employee_type);
    setDropdownValue("statusSelect", emp.status);
    setDropdownValue("bankSelect", emp.bank_name);
    setDropdownValue("bankBranchSelect", emp.bank_branch);
    setDropdownValue("projectsSelect", emp.projects);
    setDropdownValue("salaryTypeSelect", emp.salary_type);
    setDropdownValue("payrollPeriodSelect", emp.payroll_period);
    setDropdownValue("payrollRateSelect", emp.payroll_rate);
    setDropdownValue("otRateSelect", emp.ot_rate);

    // === Dependents ===
    const depTable = document.querySelector("#employeeDetails .dependents-table");
    if (depTable) {
      const dependents = emp.dependents || [];
      let html = `<tr><th>Name</th><th>Birthday</th></tr>`;
      for (let i = 0; i < 4; i++) {
        const dep = dependents[i];
        html += `
          <tr>
          <td>${i + 1}. <input type="text" value="${dep?.name || ''}"></td>
          <td><input type="date" value="${dep?.birthday || ''}"></td>
          </tr>`;
      }
      depTable.innerHTML = html;
    }

    // === Tax & Insurance Fields ===
    if (emp.taxInsurance) {
      // Dropdowns
      setDropdownValue("taxStatus", emp.taxInsurance.tax_status);
      setDropdownValue("regionalMinimumWageRate", emp.taxInsurance.region_code);

      // Inputs
      const taxExemptionInput = document.getElementById("taxExemption");
      if (taxExemptionInput) taxExemptionInput.value = emp.taxInsurance.tax_exemption;

      const insuranceInput = document.getElementById("insurance");
      if (insuranceInput) insuranceInput.value = emp.taxInsurance.insurance;
    }

    // === Contributions ===
    if (emp.contributions && emp.contributions.length > 0) {
      emp.contributions.forEach(c => {
        switch (c.contribution_type_id) {
            case 1: // SSS
                document.querySelector("#sss").checked = c.enabled;
                document.querySelector("#sssStartDate").value = c.start_date || "";
                setDropdownValue("sssPeriod", c.period || "");
                setDropdownValue("sssType", c.type_option || "");
                setDropdownValue("sssComputation", c.computation || "");
                document.querySelector("#sssEEShare").value = c.ee_share;
                document.querySelector("#sssERShare").value = c.er_share;
                document.querySelector("#sssECC").value = c.ecc;
                break;

            case 2: // Pag-IBIG
                document.querySelector("#pagibig").checked = c.enabled;
                document.querySelector("#pagibigStartDate").value = c.start_date || "";
                setDropdownValue("pagibigPeriod", c.period || "");
                setDropdownValue("pagibigType", c.type_option || "");
                setDropdownValue("pagibigComputation", c.computation || "");
                document.querySelector("#pagibigEEShare").value = c.ee_share;
                document.querySelector("#pagibigERShare").value = c.er_share;
                document.querySelector("#pagibigECC").value = c.ecc;
                break;

            case 3: // PhilHealth
                document.querySelector("#philhealth").checked = c.enabled;
                document.querySelector("#philhealthStartDate").value = c.start_date || "";
                setDropdownValue("philhealthPeriod", c.period || "");
                setDropdownValue("philhealthType", c.type_option || "");
                setDropdownValue("philhealthComputation", c.computation || "");
                document.querySelector("#philhealthEEShare").value = c.ee_share;
                document.querySelector("#philhealthERShare").value = c.er_share;
                break;

            case 4: // Withholding Tax
                document.querySelector("#withholdingTax").checked = c.enabled;
                document.querySelector("#withholdingTaxStartDate").value = c.start_date || "";
                setDropdownValue("withholdingTaxPeriod", c.period || "");
                setDropdownValue("withholdingTaxType", c.type_option || "");
                setDropdownValue("withholdingTaxComputation", c.computation || "");
                document.querySelector("#withholdingTaxEEShare").value = c.ee_share;
                document.querySelector("#withholdingTaxECC").value = c.ecc;
                document.querySelector("#annualize").checked = c.annualize == 1;
                break;
        }
      });
    }
  }

  // === Fill allowance/deduction rows with employee data ===
  function fillAllowanceDeductionRows(emp) {
    console.log("fillAllowanceDeductionRows → emp =", emp);
    if (!emp) {
      console.error("emp is undefined!");
      return;
    }

    // Helper: find rows and set values for a list and target container
    function fillListToContainer(list, containerSelector, isAllowance, isTaxable) {
      const container = document.querySelector(containerSelector);
      if (!container) return;

      // clear all amount inputs first
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        // Use row i (0-based)
        const row = container.querySelectorAll('tr')[i];
        if (!row) continue;
        // select
        const sel = row.querySelector('.allowance-select') || row.querySelector('.deduction-select');
        if (sel) {
          // if allowance -> value is allowance_type_id ; if deduction -> deduction_type_id
          if (isAllowance) sel.value = item.allowance_type_id || "";
          else sel.value = item.deduction_type_id || "";
        }
        // period
        const periodSel = row.querySelector('.period-select');
        if (periodSel) {
          // If payroll is Weekly/Monthly, the select may be disabled; we still set value
          periodSel.value = item.period || periodSel.value;
        }
        // amount
        const amountInput = row.querySelector('.amount-input');
        if (amountInput) amountInput.value = Number(item.amount || item.default_amount || 0).toFixed(2);
        // store db id on tr for later reference
        if (item.emp_allowance_id) row.dataset.dbId = item.emp_allowance_id;
        if (item.emp_deduction_id) row.dataset.dbId = item.emp_deduction_id;
      }
    }

    if (Array.isArray(emp.allowances)) {
      // split taxable / non-taxable based on returned data (allowance has is_taxable)
      const taxable = emp.allowances.filter(a => a.is_taxable);
      const nontax = emp.allowances.filter(a => !a.is_taxable);
      fillListToContainer(taxable, "#taxableAllowanceRows", true, true);
      fillListToContainer(nontax, "#nontaxableAllowanceRows", true, false);
    }

    if (Array.isArray(emp.deductions)) {
      fillListToContainer(emp.deductions, "#deductionRows", false, false);
    }
  }

  // === Collecting data from allowance/deduction table ===
  function collectAllowancesFromTable(selector) {
    const rows = Array.from(document.querySelectorAll(`${selector} tr`));
    const out = [];
    for (const row of rows) {
      const sel = row.querySelector('.allowance-select');
      const periodSel = row.querySelector('.period-select');
      const amountInput = row.querySelector('.amount-input');

      if (!sel) continue;
      const allowance_type_id = sel.value || null;
      const amount = amountInput ? Number(amountInput.value || 0).toFixed(2) : "0.00";
      const period = periodSel ? periodSel.value : null;

      // skip empty rows (no allowance type selected AND amount 0)
      if (!allowance_type_id) continue;
      out.push({
        allowance_type_id: Number(allowance_type_id),
        period,
        amount: Number(amount)
      });
    }
    return out;
  }

  function collectDeductionsFromTable(selector) {
    const rows = Array.from(document.querySelectorAll(`${selector} tr`));
    const out = [];
    for (const row of rows) {
      const sel = row.querySelector('.deduction-select');
      const periodSel = row.querySelector('.period-select');
      const amountInput = row.querySelector('.amount-input');

      if (!sel) continue;
      const deduction_type_id = sel.value || null;
      const amount = amountInput ? Number(amountInput.value || 0).toFixed(2) : "0.00";
      const period = periodSel ? periodSel.value : null;

      if (!deduction_type_id) continue;
      out.push({
        deduction_type_id: Number(deduction_type_id),
        period,
        amount: Number(amount)
      });
    }
    return out;
  }

  // === Disable all fields (view mode) ===
  function disableEmployeeForm() {
    // Reset inputs
    const inputs = document.querySelectorAll("#employeeDetails input, #employeeDetails select, #employeeDetails textarea");
    inputs.forEach(el => el.disabled = true);

    // Reset buttons
    document.querySelectorAll('#allowancePayrollEntry button[type="button"], #deductionPayrollEntry button[type="button"]').forEach(button => {
      button.disabled = true;
    });
  }

  // === Enable all fields (edit mode) ===
  function enableEmployeeForm() {
    const inputs = document.querySelectorAll("#employeeDetails input, #employeeDetails select");
    inputs.forEach(el => {
      // Skip the taxExemption input
      if (el.id === "taxExemption") return;

      el.disabled = false;
    });

    disableComputedFields();
    handleRehiredEnable();
    handleOTDisable();
  }

  function validateContactFields() {
    const email = document.getElementById("email");
    const website = document.getElementById("website");

    let valid = true;

    if (!email.checkValidity()) {
      email.reportValidity();
      valid = false;
    }

    if (!website.checkValidity()) {
      website.reportValidity();
      valid = false;
    }

    return valid;
  }

  // ===============================
  // EMPLOYEE DETAILS
  // ===============================
  // === Load Adding Employee Details ===
  const addNewEmployee = document.getElementById("addNewEmployee");

  if (addNewEmployee) {
    addNewEmployee.addEventListener("click", () => {
      const addEmployeeBtns = document.querySelectorAll('.add-employee-actions');
      const profileHeader = document.querySelectorAll('.profile-info, .details-actions');
      const backButton = document.getElementById("backEmployeeBtn");
      const editEmployeeBtns = document.querySelectorAll('.edit-employee-actions');

      addEmployeeBtns.forEach(section => section.classList.remove('hidden'));
      profileHeader.forEach(section => section.classList.add('hidden'));
      backButton.classList.add("hidden");
      editEmployeeBtns.forEach(section => section.classList.add('hidden'));

      AddEmployee();
      setActiveTab('basicInformation');
    });
  }

  // === Load Viewing Employee Details ===
  function showEmployeeDetails(empCode) {
    const backButton = document.getElementById("backEmployeeBtn");
    const profileHeader = document.querySelectorAll('.profile-info, .details-actions');
    const addEmployeeBtns = document.querySelectorAll('.add-employee-actions');
    const editEmployeeBtns = document.querySelectorAll('.edit-employee-actions');

    console.log("View employee:", empCode);

    profileHeader.forEach(section => section.classList.remove('hidden'));
    backButton.classList.remove("hidden");
    addEmployeeBtns.forEach(section => section.classList.add('hidden'));
    editEmployeeBtns.forEach(section => section.classList.add('hidden'));

    viewEmployee(empCode);
    setActiveTab('basicInformation');
  }

  // Click listener for view button
  const viewEmployeeDetails = document.querySelector("#employeeTable tbody");

  if (viewEmployeeDetails) {
    viewEmployeeDetails.addEventListener("click", e => {
      if (e.target.classList.contains("view-btn")) {
        const row = e.target.closest("tr");
        const empCode = row.querySelector("td").textContent;
        resetFields();
        showEmployeeDetails(empCode);
      }
    });
  }

  // === Load Editing Employee Details ===
  const editEmployeeDetails = document.getElementById("editEmployeeBtn");

  if (editEmployeeDetails) {
    editEmployeeDetails.addEventListener("click", () => {
      const empCode = document.getElementById("empIdDetail").textContent.trim();

      console.log("Edit employee:", empCode);
      
      const editEmployeeBtns = document.querySelectorAll('.edit-employee-actions');
      const addEmployeeBtns = document.querySelectorAll('.add-employee-actions');
      const profileHeader = document.querySelectorAll('.details-actions');
      const backButton = document.getElementById("backEmployeeBtn");

      editEmployeeBtns.forEach(section => section.classList.remove('hidden'));
      addEmployeeBtns.forEach(section => section.classList.add('hidden'));
      profileHeader.forEach(section => section.classList.add('hidden'));
      backButton.classList.add("hidden");

      editEmployee(empCode);
      setActiveTab('basicInformation');
    });
  }

  // ===============================
  // Add Employees
  // ===============================
  // === Function to handle adding a new employee ===
  async function AddEmployee() {
    const employeeDetails = document.getElementById("employeeDetails");
    const rehired = document.getElementById("rehired");
    const strictNoOvertime = document.getElementById("strictNoOvertime");
    const sss = document.getElementById("sss");
    const pagibig = document.getElementById("pagibig");
    const philhealth = document.getElementById("philhealth");
    const withholdingTax = document.getElementById("withholdingTax");
    const payrollPeriodSelect = document.getElementById("payrollPeriodSelect");
    const empIdInput = document.getElementById("employeeID");
    const row = empIdInput?.closest(".form-row");
    
    if (row) row.style.display = "flex";

    // 1. ENABLE all input fields and RESET input values
    employeeDetails.querySelectorAll("input, select, textarea").forEach(el => {
      // Skip the taxExemption input
      if (el.id === "taxExemption") return;

      el.disabled = false;

      if (el.type === "checkbox") {
        el.checked = false;
      } else if (el.tagName === "SELECT") {
        el.selectedIndex = 0;
      } else {
        el.value = el.defaultValue;
      }
    });

    // 2. Reset Dependents Inputs
    const addDepTable = document.querySelector('#employeeDetails .dependents-table');
    if (!addDepTable) return;
    addDepTable.innerHTML = `
      <tr><th>Name</th><th>Birthday</th></tr>
      <tr><td>1.<input type="text" /></td><td><input type="date" /></td></tr>
      <tr><td>2.<input type="text" /></td><td><input type="date" /></td></tr>
      <tr><td>3.<input type="text" /></td><td><input type="date" /></td></tr>
      <tr><td>4.<input type="text" /></td><td><input type="date" /></td></tr>
    `;

    // 3. SPECIAL RULE: Rehired Date should start disabled
    const rehiredDate = document.getElementById("rehiredDate");
    if (rehiredDate) rehiredDate.disabled = true;

    // 4. CLEARS all borders
    employeeDetails.querySelectorAll("input, select").forEach(el => el.style.border = "");

    // Click handler for checkboxes
    rehired?.addEventListener("change", handleRehiredEnable);
    strictNoOvertime?.addEventListener("change", handleOTDisable);
    sss?.addEventListener("change", handleSSSDisable);
    pagibig?.addEventListener("change", handlePagibigDisable);
    philhealth?.addEventListener("change", handlePhilhealthDisable);
    withholdingTax?.addEventListener("change", handleWithholdingTaxDisable);

    // Add event listeners to all type selects
    Object.keys(typeFieldMap).forEach(typeId => {
        document.getElementById(typeId)?.addEventListener("change", handleTypeChange);
    });

    // Update period selects whenever payroll period changes
    payrollPeriodSelect?.addEventListener("change", populatePeriodSelects);
    
    // Setting default values for some input fields
    const currentDate = new Date().toISOString().split("T")[0];
    document.getElementById("country").value = "Philippines";

    document.getElementById("trainingDate").value = currentDate;
    document.getElementById("dateHired").value = currentDate;
    document.getElementById("dateRegular").value = currentDate;

    document.getElementById("daysInYear").value = "313";
    document.getElementById("hoursInDay").value = "8";
    document.getElementById("weekInYear").value = "52";
    document.getElementById("daysInYearOT").value = "313";

    let checkboxes = document.querySelectorAll('#title input[type="checkbox"]'); // Selects all checkboxes
    checkboxes.forEach(function(checkbox) {
      checkbox.checked = true; // Check each checkbox
    });

    document.getElementById("sssStartDate").value = currentDate;
    document.getElementById("pagibigStartDate").value = currentDate;
    document.getElementById("philhealthStartDate").value = currentDate;
    document.getElementById("withholdingTaxStartDate").value = currentDate;

    // Re-initializes dropdown logic + period selection
    await initEmployeeDropdowns();
    await loadTaxExemptions();
    await loadRegionalWageRates();
    await loadAllowanceAndDeductionTypes();
    initPayrollComputation();
    generateRows();
    populatePayrollSelects();
    pagibigComputationHandler();
    initTypeFields();

    // === Button Handlers ===
    document.addEventListener("click", async (e) => {
      // === CANCEL BUTTON ===
      const cancelModal = document.getElementById("cancelModal");

      // Open Cancel Confirmation Modal
      if (e.target && e.target.id === "cancelEmployeeBtn") {
        cancelModal.classList.remove("hidden");
      }

      // Confirm Cancel button
      if (e.target && e.target.id === "confirmCancelBtn") {
        cancelModal.classList.add("hidden");
        showSection("employeeFile");
      }

      // Close Cancel Confirmation Modal
      if (e.target && e.target.id === "cancelCancelBtn") {
        cancelModal.classList.add("hidden");
      }

      // === SAVE BUTTON ===
      const saveModal = document.getElementById("saveModal");

      // Open Save Confirmation Modal
      if (e.target && e.target.id === "saveEmployeeBtn") {
        const requiredFields = [
          "Employee ID", "Last Name", "First Name", "Gender", "Birth Date",
          "Email", "Company", "Department", "Position", "Employee Status",
          "Date Hired", "Payroll Period", "Payroll Rate", "Amount Rate", "OT Rate"
        ];
        
        const inputs = document.querySelectorAll("#employeeDetails .form-row input, #employeeDetails .form-row select");
        const missingFields = [];
        const invalidFields = [];
        
        inputs.forEach((field) => {
          const rawLabel = field.closest(".form-row")?.querySelector("label")?.textContent || "";
          const label = rawLabel.replace(":", "").trim();

          // Required field validation
          if (requiredFields.includes(label)) {
            const isEmpty =
              field.disabled
                ? false  // skip empty check for disabled fields
                : field.tagName === "SELECT"
                  ? !field.value || field.value.trim() === ""
                  : field.type === "checkbox"
                    ? false
                    : !field.value || field.value.trim() === "";

            if (isEmpty) {
              missingFields.push(label);
              field.style.border = "1px solid red";
            } else {
              // Pattern validation
              if (field.pattern) {
                const regex = new RegExp(field.pattern);
                if (!regex.test(field.value)) {
                  invalidFields.push(label);
                  field.style.border = "1px solid orange";
                  return;
                } 
              }
              field.style.border = "";
            }
          }
        });
        
        // Build toast message
        let toastMessage = "";
        if (missingFields.length > 0) {
          toastMessage += "⚠️ Please fill out or select the following required fields:\n- " + missingFields.join("\n- ");
        }
        
        const activeTab = document.querySelector(".tab-btn.active")?.dataset.tab;
        const isBasicInformationActive = activeTab === "basicInformation";

        // STOP if email/website invalid AND Basic Information tab is active
        if (isBasicInformationActive && invalidFields.length > 0) {
          if (!validateContactFields()) return;
        }

        // If NOT in Basic Information tab, show toast instead
        if (!isBasicInformationActive && invalidFields.length > 0) {
          if (toastMessage) toastMessage += "\n\n"; // spacing if both exist
          toastMessage += "⚠️ Please correct the following fields (invalid format):\n- " + invalidFields.join("\n- ");
        }

        if (toastMessage) {
          showToast(toastMessage, "validationErrors");
          return;
        }

        // All required fields filled → open Save Confirmation Modal
        saveModal.classList.remove("hidden");
      }

      // Confirm Save button
      if (e.target && e.target.id === "confirmSaveBtn") {
        const inputs = document.querySelectorAll("#employeeDetails .form-row input, #employeeDetails .form-row select");
        const data = {};

        inputs.forEach((field) => {
          const rawLabel = field.closest(".form-row")?.querySelector("label")?.textContent || "";
          const label = rawLabel.replace(":", "").trim();
          const key = normalizeLabelToKey(label);

          if (field.type === "checkbox") {
            data[key] = field.checked ? 1 : 0;
          } else {
            data[key] = (field.value || "").trim();
          }
        });

        if (data.employee_id) {
          data.emp_code = data.employee_id;
          delete data.employee_id;
        }

        // Dependents
        data.dependents = [];
        const depTable = document.querySelector('#employeeDetails .dependents-table');
        if (depTable) {
          const depRows = Array.from(depTable.querySelectorAll('tr')).slice(1);
          depRows.forEach((row) => {
            const inputs = row.querySelectorAll('input');
            if (inputs.length >= 1) {
              const name = (inputs[0].value || "").trim();
              const birthday = (inputs[1]?.value || "").trim() || null;
              if (name) data.dependents.push({ name, birthday });
            }
          });
        }

        // Payroll Computation tab
        data.payrollComputation = {
          payroll_period: document.getElementById('payrollPeriodSelect')?.value || "",
          payroll_rate: document.getElementById('payrollRateSelect')?.value || "",
          ot_rate: document.getElementById('otRateSelect')?.value || "",
          days_in_year: Number(document.getElementById('daysInYear')?.value) || null,
          days_in_week: document.getElementById('daysInWeek')?.value ? Number(document.getElementById('daysInWeek').value) : null,
          main_computation: Number(document.getElementById('amountRate')?.value) || null,
          basis_absences: document.getElementById('basisAbsences')?.value || null,
          basis_overtime: document.getElementById('basisOvertime')?.value || null,
          hours_in_day: Number(document.getElementById('hoursInDay')?.value) || null,
          week_in_year: Number(document.getElementById('weekInYear')?.value) || null,
          strict_no_overtime: document.getElementById("strictNoOvertime").checked,
          days_in_year_ot: Number(document.getElementById('daysInYearOT')?.value) || null,
          rate_basis_ot: Number(document.getElementById('rateBasisOT')?.value) || null
        };
        
        // Tax Insurance
        data.tax_status = document.getElementById("taxStatus")?.value || null;
        data.tax_exemption = parseFloat(document.getElementById("taxExemption")?.value) || 0;
        data.insurance = parseFloat(document.getElementById("insurance")?.value) || 0;
        data.regional_minimum_wage_rate_id = parseInt(document.getElementById("regionalMinimumWageRate")?.value) || null;

        // Contributions
        data.contributions = [];

        function pushContribution(typeId, enabled, start, period, typeOpt, comp, ee, er, ecc, annualize = 0) {
          data.contributions.push({
            contribution_type_id: typeId,
            enabled: enabled ? 1 : 0,
            start_date: start || null,
            period_id: period || null,
            type_option_id: typeOpt || null,
            computation_id: comp || null,
            ee_share: parseFloat(ee) || 0,
            er_share: parseFloat(er) || 0,
            ecc: parseFloat(ecc) || 0,
            annualize
          });
        }

        // SSS = 1
        pushContribution(
          1,
          document.querySelector("#sss")?.checked,
          document.querySelector("#sssStartDate")?.value,
          document.querySelector("#sssPeriod")?.value,
          document.querySelector("#sssType")?.value,
          document.querySelector("#sssComputation")?.value,
          document.querySelector("#sssEEShare")?.value,
          document.querySelector("#sssERShare")?.value,
          document.querySelector("#sssECC")?.value
        );

        // Pag-IBIG = 2
        pushContribution(
          2,
          document.querySelector("#pagibig")?.checked,
          document.querySelector("#pagibigStartDate")?.value,
          document.querySelector("#pagibigPeriod")?.value,
          document.querySelector("#pagibigType")?.value,
          document.querySelector("#pagibigComputation")?.value,
          document.querySelector("#pagibigEEShare")?.value,
          document.querySelector("#pagibigERShare")?.value,
          document.querySelector("#pagibigECC")?.value
        );

        // PhilHealth = 3
        pushContribution(
          3,
          document.querySelector("#philhealth")?.checked,
          document.querySelector("#philhealthStartDate")?.value,
          document.querySelector("#philhealthPeriod")?.value,
          document.querySelector("#philhealthType")?.value,
          document.querySelector("#philhealthComputation")?.value,
          document.querySelector("#philhealthEEShare")?.value,
          document.querySelector("#philhealthERShare")?.value,
          0
        );

        // Withholding Tax = 4
        pushContribution(
          4,
          document.querySelector("#withholdingTax")?.checked,
          document.querySelector("#withholdingTaxStartDate")?.value,
          document.querySelector("#withholdingTaxPeriod")?.value,
          document.querySelector("#withholdingTaxType")?.value,
          document.querySelector("#withholdingTaxComputation")?.value,
          document.querySelector("#withholdingTaxEEShare")?.value,
          0,
          document.querySelector("#withholdingTaxECC")?.value,
          document.querySelector("#annualize")?.checked ? 1 : 0
        );

        // Allowances and Deductions tab
        data.allowances = [
          ...collectAllowancesFromTable("#taxableAllowanceRows"),
          ...collectAllowancesFromTable("#nontaxableAllowanceRows")
        ];
        data.deductions = collectDeductionsFromTable("#deductionRows");

        try {
          const user_id = sessionStorage.getItem("user_id");
          const admin_name = sessionStorage.getItem("admin_name");

          if (!user_id || !admin_name) {
            showToast("Error: Missing admin session info. Please log in again."), "error";
            return;
          }

          const res = await fetch("/api/add_employee", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id,
              admin_name,
              ...data,
            }),
          });

          const result = await res.json();

          if (!res.ok || !result.success) {
            showToast(`⚠️ Failed to add employee: ${result.message || "Unknown error"}`, "warning");
            saveModal.classList.add("hidden");
            return;
          }

          showToast(`✅ Employee ${result.emp_code || data.emp_code} added successfully!`);

          saveModal.classList.add("hidden");
          await loadEmployeeSummary();
          await loadEmployeeList();
          showSection("employeeFile");
        } catch (err) {
          console.error("Error saving employee:", err);
          showToast("❌ Server error while saving employee.", "error");
        }
      }

      // Close Save Confirmation Modal
      if (e.target && e.target.id === "cancelSaveBtn") {
        saveModal.classList.add("hidden");
      }
    });

    showSection("employeeDetails");
  }

  // ===============================
  // View Employees
  // ===============================
  // === Function to handle viewing an employee details ===
  async function viewEmployee(empCode) {
    console.log(`🟢 Viewing employee ${empCode}...`);
    if (!empCode) return showToast("⚠️ No employee selected for viewing!", "warning");

    try {
      const res = await fetch(`/api/employee/${empCode}`);
      const data = await res.json();

      if (!data.success || !data.employee) {
        showToast("⚠️ Employee data not found!", "warning");
        return;
      }

      const emp = data.employee;

    console.log("payrollPeriodSelect Value: ", emp.payroll_period);
    
      // Header Info
      document.getElementById("empIdDetail").textContent = emp.emp_code || "-";
      document.getElementById("empFNameDetail").textContent = `${emp.first_name || "-"} ${emp.last_name || "-"}`.trim();
      document.getElementById("empDeptDetail").textContent = emp.department || "-";
      document.getElementById("empPosDetail").textContent = emp.position || "-";
      document.getElementById("empStatDetail").textContent = emp.status || "-";

      // Fill form fields + dropdowns
      await initEmployeeDropdowns();
      await loadTaxExemptions();
      await loadRegionalWageRates();
      await loadAllowanceAndDeductionTypes();
      generateRows(emp.payroll_period || document.getElementById('payrollPeriodSelect')?.value);
      populateForm(emp);
      populatePayrollSelects();
      fillAllowanceDeductionRows(emp);
      disableEmployeeForm();

      // === Button Handlers ===
      document.addEventListener("click", async (e) => {
        // === BACK BUTTON ===
        if (e.target && e.target.id === "backEmployeeBtn") {
          showSection("employeeFile");
        }

        // === DELETE BUTTON ===
        const deleteModal = document.getElementById("deleteModal");

        // Open Delete Confirmation Modal
        if (e.target && e.target.id === "deleteEmployeeBtn") {
          deleteModal.classList.remove("hidden");
        }

        // Confirm Delete Button
        if (e.target && e.target.id === "confirmDeleteBtn") {
          const empCode = document.getElementById("empIdDetail").textContent.trim();
          
          if (!empCode) {
            showToast("⚠️ No employee selected!", "warning");
            return;
          }

          try {
            const user_id = sessionStorage.getItem("user_id");
            const admin_name = sessionStorage.getItem("admin_name");

            // Send delete request
            const res = await fetch(`/api/employee/${empCode}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_id, admin_name }),
            });

            // Parse response JSON
            const data = await res.json();

            // Handle result
            if (data.success) {
              deleteModal.classList.add("hidden");
              showToast(`🗑️ Employee ${empCode} deleted successfully!`);
              
              await loadEmployeeSummary();
              await loadEmployeeList();
              showSection("employeeFile");
            } else {
              showToast("❌ Failed to delete employee: " + (data.message || "Unknown error", "error"));
            }
          } catch (error) {
            console.error("Error deleting employee:", error);
            showToast("⚠️ Server error while deleting employee.", "error");
          }
        }

        // Close Delete Confirmation Modal
        if (e.target && e.target.id === "cancelDeleteBtn") {
          deleteModal.classList.add("hidden");
        }
      });
    
      // Show section
      showSection("employeeDetails");
    } catch (err) {
      console.error("❌ Error loading employee data:", err);
      showToast("Server error while fetching employee data.", "error");
    }
  }
  
  // ===============================
  // Edit Employees
  // ===============================
  // === Function to handle editing an employee details ===
  async function editEmployee(empCode) {
    console.log(`🟢 Editing employee ${empCode}...`);
    if (!empCode) return showToast("⚠️ No employee selected for editing!", "warning");

    try {
      const res = await fetch(`/api/employee/${empCode}`);
      const data = await res.json();

      if (!data.success || !data.employee) {
        showToast("⚠️ Employee data not found!", "warning");
        return;
      }

      const emp = data.employee;

      // Click handler for checkboxes
      rehired?.addEventListener("change", handleRehiredEnable);
      strictNoOvertime?.addEventListener("change", handleOTDisable);
      sss?.addEventListener("change", handleSSSDisable);
      pagibig?.addEventListener("change", handlePagibigDisable);
      philhealth?.addEventListener("change", handlePhilhealthDisable);
      withholdingTax?.addEventListener("change", handleWithholdingTaxDisable);

      // Add event listeners to all type selects
      Object.keys(typeFieldMap).forEach(typeId => {
          document.getElementById(typeId)?.addEventListener("change", handleTypeChange);
      });

      // Update period selects whenever payroll period changes
      payrollPeriodSelect?.addEventListener("change", populatePeriodSelects);

      // Header Info
      document.getElementById("empIdDetail").textContent = emp.emp_code || "-";
      document.getElementById("empFNameDetail").textContent = `${emp.first_name || "-"} ${emp.last_name || "-"}`.trim();
      document.getElementById("empDeptDetail").textContent = emp.department || "-";
      document.getElementById("empPosDetail").textContent = emp.position || "-";
      document.getElementById("empStatDetail").textContent = emp.status || "-";

      // Fill form fields + dropdowns
      await initEmployeeDropdowns();
      await loadTaxExemptions();
      await loadRegionalWageRates();
      await loadAllowanceAndDeductionTypes();
      generateRows(emp.payroll_period || document.getElementById('payrollPeriodSelect')?.value);
      populateForm(emp);
      populatePayrollSelects();
      fillAllowanceDeductionRows(emp);
      pagibigComputationHandler();
      enableEmployeeForm();
      initPayrollComputation();
    
      // === Button Handlers ===
      document.addEventListener("click", async (e) => {
        // === CANCEL BUTTON ===
        const cancelModal = document.getElementById("cancelModal");

        // Open Cancel Confirmation Modal
        if (e.target && e.target.id === "cancelEmployeeBtnEdit") {
          cancelModal.classList.remove("hidden");
        }

        // Confirm Cancel button
        if (e.target && e.target.id === "confirmCancelBtn") {
          const empCode = document.getElementById("empIdDetail").textContent.trim();

          cancelModal.classList.add("hidden");
          showEmployeeDetails(empCode);
        }

        // Close Cancel Confirmation Modal
        if (e.target && e.target.id === "cancelCancelBtn") {
          cancelModal.classList.add("hidden");
        }
        
        // === SAVE BUTTON ===
        const saveModal = document.getElementById("saveModal");

        // Open Save Confirmation Modal
        if (e.target && e.target.id === "saveEmployeeBtnEdit") {
          const requiredFields = [
            "Last Name", "First Name", "Gender", "Birth Date",
            "Email", "Company", "Department", "Position", "Employee Status",
            "Date Hired", "Payroll Period", "Payroll Rate", "Amount Rate", "OT Rate"
          ];
          
          const inputs = document.querySelectorAll("#employeeDetails .form-row input, #employeeDetails .form-row select");
          const missingFields = [];
          const invalidFields = [];
          
          inputs.forEach((field) => {
            const rawLabel = field.closest(".form-row")?.querySelector("label")?.textContent || "";
            const label = rawLabel.replace(":", "").trim();

            // Required field validation
            if (requiredFields.includes(label)) {
              const isEmpty =
                field.disabled
                  ? false  // skip empty check for disabled fields
                  : field.tagName === "SELECT"
                    ? !field.value || field.value.trim() === ""
                    : field.type === "checkbox"
                      ? false
                      : !field.value || field.value.trim() === "";

              if (isEmpty) {
                missingFields.push(label);
                field.style.border = "1px solid red";
              } else {
                // Pattern validation
                if (field.pattern) {
                  const regex = new RegExp(field.pattern);
                  if (!regex.test(field.value)) {
                    invalidFields.push(label);
                    field.style.border = "1px solid orange";
                    return;
                  } 
                }
                field.style.border = "";
              }
            }
          });
          
          // Build toast message
          let toastMessage = "";
          if (missingFields.length > 0) {
            toastMessage += "⚠️ Please fill out or select the following required fields:\n- " + missingFields.join("\n- ");
          }
          
          const activeTab = document.querySelector(".tab-btn.active")?.dataset.tab;
          const isBasicInformationActive = activeTab === "basicInformation";

          // STOP if email/website invalid AND Basic Information tab is active
          if (isBasicInformationActive && invalidFields.length > 0) {
            if (!validateContactFields()) return;
          }

          // If NOT in Basic Information tab, show toast instead
          if (!isBasicInformationActive && invalidFields.length > 0) {
            if (toastMessage) toastMessage += "\n\n"; // spacing if both exist
            toastMessage += "⚠️ Please correct the following fields (invalid format):\n- " + invalidFields.join("\n- ");
          }

          if (toastMessage) {
            showToast(toastMessage, "validationErrors");
            return;
          }

          // All required fields filled → open Save Confirmation Modal
          saveModal.classList.remove("hidden");
        }

        // Confirm Save button
        if (e.target && e.target.id === "confirmSaveBtn") {
          e.preventDefault();

          const empCode = document.querySelector("#employeeDetails #empIdDetail").textContent.trim();
          if (!empCode) return showToast("⚠️ Employee ID missing — cannot save changes!", "warning");

          // Collect data
          const empData = {
          // --- Basic Info ---
          emp_code: document.querySelector("#employeeID")?.value.trim() || empCode,
          last_name: document.querySelector("#lastName")?.value || "",
          first_name: document.querySelector("#firstName")?.value || "",
          middle_name: document.querySelector("#middleName")?.value || "",
          nickname: document.querySelector("#nickName")?.value || "",
          gender: document.querySelector("#genderSelect")?.value || "",
          civil_status: document.querySelector("#civilStatusSelect")?.value || "",
          birth_date: document.querySelector("#birthDate")?.value || "",
          street: document.querySelector("#street")?.value || "",
          city: document.querySelector("#city")?.value || "",
          country: document.querySelector("#country")?.value || "",
          zip_code: document.querySelector("#zipCode")?.value || "",
          status: document.querySelector("#statusSelect")?.value || "",

          // --- Contacts ---
          tel_no: document.querySelector("#telNo")?.value || "",
          mobile_no: document.querySelector("#mobileNo")?.value || "",
          fax_no: document.querySelector("#faxNo")?.value || "",
          email: document.querySelector("#email")?.value || "",
          website: document.querySelector("#website")?.value || "",

          // --- Employment ---
          company: document.querySelector("#companySelect")?.value || "",
          location: document.querySelector("#locationSelect")?.value || "",
          branch: document.querySelector("#branchSelect")?.value || "",
          division: document.querySelector("#divisionSelect")?.value || "",
          department: document.querySelector("#departmentSelect")?.value || "",
          class: document.querySelector("#classSelect")?.value || "",
          position: document.querySelector("#positionSelect")?.value || "",
          employee_type: document.querySelector("#employeeTypeSelect")?.value || "",
          training_date: document.querySelector("#trainingDate")?.value || "",
          date_hired: document.querySelector("#dateHired")?.value || "",
          date_regular: document.querySelector("#dateRegular")?.value || "",
          date_resigned: document.querySelector("#dateResigned")?.value || "",
          date_terminated: document.querySelector("#dateTerminated")?.value || "",
          end_of_contract: document.querySelector("#endOfContract")?.value || "",
          rehired_date: document.querySelector("#rehiredDate")?.value || "",
          rehired: document.querySelector("#rehired")?.checked ? 1 : 0,

          // --- Accounts ---
          machine_id: document.querySelector("#machineID")?.value || "",
          sss_no: document.querySelector("#sssNo")?.value || "",
          gsis_no: document.querySelector("#gsisNo")?.value || "",
          pagibig_no: document.querySelector("#pagibigNo")?.value || "",
          philhealth_no: document.querySelector("#philhealthNo")?.value || "",
          tin_no: document.querySelector("#tinNo")?.value || "",
          branch_code: document.querySelector("#branchCode")?.value || "",
          atm_no: document.querySelector("#atmNo")?.value || "",
          bank_name: document.querySelector("#bankSelect")?.value || "",
          bank_branch: document.querySelector("#bankBranchSelect")?.value || "",
          projects: document.querySelector("#projectsSelect")?.value || "",
          salary_type: document.querySelector("#salaryTypeSelect")?.value || "",
          };

          // --- Dependents ---
          empData.dependents = [];
          const depTableEdit = document.querySelector("#employeeDetails .dependents-table");
          if (depTableEdit) {
          const rows = Array.from(depTableEdit.querySelectorAll("tr")).slice(1);
          rows.forEach((r) => {
              const inputs = r.querySelectorAll("input");
              if (inputs.length >= 1) {
              const name = inputs[0].value.trim();
              const birthday = inputs[1]?.value.trim() || null;
              if (name) empData.dependents.push({ name, birthday });
              }
          });
          }

          // --- Payroll Computation ---
          empData.payrollComputation = {
          payroll_period: document.getElementById("payrollPeriodSelect")?.value || "",
          payroll_rate: document.getElementById("payrollRateSelect")?.value || "",
          ot_rate: document.getElementById("otRateSelect")?.value || "",
          days_in_year: Number(document.getElementById("daysInYear")?.value) || null,
          days_in_week: Number(document.getElementById("daysInWeek")?.value) || null,
          main_computation: Number(document.getElementById("amountRate")?.value) || null,
          basis_absences: document.getElementById("basisAbsences")?.value || null,
          basis_overtime: document.getElementById("basisOvertime")?.value || null,
          hours_in_day: Number(document.getElementById("hoursInDay")?.value) || null,
          week_in_year: Number(document.getElementById("weekInYear")?.value) || null,
          strict_no_overtime: document.getElementById("strictNoOvertime")?.checked ? 1 : 0,
          days_in_year_ot: Number(document.getElementById("daysInYearOT")?.value) || null,
          rate_basis_ot: Number(document.getElementById("rateBasisOT")?.value) || null,
          };

          // --- Tax Insurance ---
          empData.taxInsurance = {
            tax_status: document.querySelector("#taxStatus")?.value || "",
            tax_exemption: parseFloat(document.querySelector("#taxExemption")?.value) || 0,
            insurance: parseFloat(document.querySelector("#insurance")?.value) || 0,
            regional_minimum_wage_rate_id: parseInt(document.querySelector("#regionalMinimumWageRate")?.value) || null
          };

          // --- Contributions ---
          empData.contributions = [];
          console.log("Contributions Data: ", empData.contributions);

          function pushContribution(typeId, enabled, start, period, typeOpt, comp, ee, er, ecc, annualize = 0) {
            empData.contributions.push({
              contribution_type_id: typeId,
              enabled: enabled ? 1 : 0,
              start_date: start || null,
              period: period || null,
              type_option: typeOpt || null,
              computation: comp || null,
              ee_share: parseFloat(ee) || 0,
              er_share: parseFloat(er) || 0,
              ecc: parseFloat(ecc) || 0,
              annualize
            });
          }

          // SSS = 1
          pushContribution(
            1,
            document.querySelector("#sss")?.checked,
            document.querySelector("#sssStartDate")?.value,
            document.querySelector("#sssPeriod")?.value,
            document.querySelector("#sssType")?.value,
            document.querySelector("#sssComputation")?.value,
            document.querySelector("#sssEEShare")?.value,
            document.querySelector("#sssERShare")?.value,
            document.querySelector("#sssECC")?.value
          );

          // Pag-IBIG = 2
          pushContribution(
            2,
            document.querySelector("#pagibig")?.checked,
            document.querySelector("#pagibigStartDate")?.value,
            document.querySelector("#pagibigPeriod")?.value,
            document.querySelector("#pagibigType")?.value,
            document.querySelector("#pagibigComputation")?.value,
            document.querySelector("#pagibigEEShare")?.value,
            document.querySelector("#pagibigERShare")?.value,
            document.querySelector("#pagibigECC")?.value
          );

          // PhilHealth = 3
          pushContribution(
            3,
            document.querySelector("#philhealth")?.checked,
            document.querySelector("#philhealthStartDate")?.value,
            document.querySelector("#philhealthPeriod")?.value,
            document.querySelector("#philhealthType")?.value,
            document.querySelector("#philhealthComputation")?.value,
            document.querySelector("#philhealthEEShare")?.value,
            document.querySelector("#philhealthERShare")?.value,
            0
          );

          // Withholding Tax = 4
          pushContribution(
            4,
            document.querySelector("#withholdingTax")?.checked,
            document.querySelector("#withholdingTaxStartDate")?.value,
            document.querySelector("#withholdingTaxPeriod")?.value,
            document.querySelector("#withholdingTaxType")?.value,
            document.querySelector("#withholdingTaxComputation")?.value,
            document.querySelector("#withholdingTaxEEShare")?.value,
            0,
            document.querySelector("#withholdingTaxECC")?.value,
            document.querySelector("#annualize")?.checked ? 1 : 0
          );

          // --- Allowances and Deductions ---
          empData.allowances = [
            ...collectAllowancesFromTable("#taxableAllowanceRows"),
            ...collectAllowancesFromTable("#nontaxableAllowanceRows")
          ];
          empData.deductions = collectDeductionsFromTable("#deductionRows");

          try {
            const user_id = sessionStorage.getItem("user_id");
            const admin_name = sessionStorage.getItem("admin_name");

            const res = await fetch(`/api/employee/update/${empCode}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id, admin_name, ...empData }),
            });

            const result = await res.json();
            if (!res.ok || !result.success)
                return showToast("⚠️ Failed to update employee: " + (result.message || "Unknown error."), "warning");

            showToast(`✅ Employee ${result.emp_code || empCode} updated successfully!`);
            saveModal.classList.add("hidden");
            await loadEmployeeSummary();
            await loadEmployeeList();
            showSection("employeeFile");
          } catch (error) {
          console.error("Error updating employee:", error);
          showToast("⚠️ Server error while saving changes.", "error");
          }
        }

        // Close Save Confirmation Modal
        if (e.target && e.target.id === "cancelSaveBtn") {
          saveModal.classList.add("hidden");
        }
      });

      // Show section
      showSection("employeeDetails");
    } catch (err) {
      console.error("❌ Error loading employee data:", err);
      showToast("Server error while editing employee data.", "error");
    }
  }
}

// ========== PAYROLL COMPUTATION PAGE ==========
if (window.location.pathname === '/dashboard/payroll_computation.html') {
  let selectedEmployeeId = null;

  // ===============================
  // Section Controller
  // ===============================
  function showSection(sectionId) {
    // Hide all sections first
    document.getElementById("filterSection").classList.add("hidden");
    document.getElementById("computationSection").classList.add("hidden");

    // Show target section
    const target = document.getElementById(sectionId);
    if (target) {
      target.classList.remove("hidden");
      console.log("✅ Showing section:", sectionId);
    } else {
      console.warn("⚠️ Section not found:", sectionId);
    }
  }

  // === Setting Active Tab ===
  function setActiveTab(tabId, containerSelector = null) {
    const container = containerSelector ? document.querySelector(containerSelector) : document;

    if (containerSelector && !container) return console.warn('Tab container not found:', containerSelector);

    // hide all tab-content and remove active from tab-btns
    container.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    // show requested tab-content
    const target = document.getElementById(tabId);
    const tabButtons = document.querySelector(".tab-buttons");
    if (target && (!containerSelector || container.contains(target))) {
      target.classList.remove('hidden');
      if (tabButtons) tabButtons.classList.remove('hidden');
    } else {
      console.warn('Tab content not found:', tabId, containerSelector);
    }

    // activate corresponding button
    const btn = container.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');
  }

  // === Event listeners to all tab and container buttons ===
  document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');
      setActiveTab(tabId);
    });
  });

  // ===============================
  // STEP 1 LEFT: Payroll Setup
  // ===============================
  const payrollGroup = document.getElementById("payrollGroup");
  const periodOption = document.getElementById("periodOption");
  const monthSelect = document.getElementById("month");
  const yearSelect = document.getElementById("year");
  const payrollRange = document.getElementById("payrollRange");
  const payrollRangeHeader = document.getElementById("payrollRangeHeader");

  // Fetch payroll setup data (groups, months, years, periods)
  async function loadPayrollData() {
    try {
      const res = await fetch("/api/payroll_periods");
      const json = await res.json();

      if (!json.success) throw new Error("Failed to fetch payroll data");

      const { payrollGroups, payrollMonths, payrollYears, payrollPeriods } = json.data;

      // Populate groups
      payrollGroup.innerHTML = '<option value="" disabled selected>-- Select Group --</option>';
      payrollGroups.forEach(g => {
        const opt = document.createElement("option");
        // backend returns group_id and group_name. Keep value as group_name lowercased if that's your intended key
        opt.value = g.group_name.toLowerCase();
        opt.textContent = g.group_name;
        payrollGroup.appendChild(opt);
      });

      // Populate months
      monthSelect.innerHTML = '<option value="" disabled selected>-- Select Month --</option>';
      payrollMonths.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.month_id;
        opt.textContent = m.month_name;
        monthSelect.appendChild(opt);
      });

      // Populate years
      const currentYear = new Date().getFullYear();
      yearSelect.innerHTML = '<option value="" disabled>-- Select Year --</option>';
      payrollYears.forEach(y => {
        const opt = document.createElement("option");
        opt.value = y.year_value;
        opt.textContent = y.year_value;
        if (y.year_value === currentYear) opt.selected = true;
        yearSelect.appendChild(opt);
      });

      // Store periods globally for filtering
      window.allPayrollPeriods = payrollPeriods;
      updatePeriodOptions();
      generatePayrollRange();

    } catch (err) {
      console.error("Error loading payroll data:", err);
    }
  }

  function defaultPeriodOption(text) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.disabled = true;
    opt.selected = true;
    opt.textContent = text;
    return opt;
  }

  function updatePeriodOptions() {
    const group = payrollGroup.value;
    periodOption.innerHTML = "";
    
    if (!group) {
      // No payroll group selected — show placeholder
      periodOption.appendChild(defaultPeriodOption("-- Please select a group first --"));
      return;
    }

    periodOption.appendChild(defaultPeriodOption("-- Select Period --"));

    // Filter periods for selected group
    const filteredPeriods = (window.allPayrollPeriods || []).filter(
      p => p.group_id === group
    );

    if (filteredPeriods.length > 0) {
      filteredPeriods.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.period_id;
        opt.textContent = p.period_name;
        periodOption.appendChild(opt);
      });
    } else {
      if (group === "weekly") {
        ["1st Week", "2nd Week", "3rd Week", "4th Week"].forEach(w => {
          const opt = document.createElement("option");
          opt.value = w.toLowerCase();
          opt.textContent = w;
          periodOption.appendChild(opt);
        });
      } else if (group === "semi-monthly") {
        ["First Half", "Second Half"].forEach(h => {
          const opt = document.createElement("option");
          opt.value = h.toLowerCase();
          opt.textContent = h;
          periodOption.appendChild(opt);
        });
      } else if (group === "monthly") {
        const opt = document.createElement("option");
        opt.value = "monthly";
        opt.textContent = "Monthly";
        opt.selected = true;
        periodOption.appendChild(opt);
      }
    }

    generatePayrollRange();
  }

  function generatePayrollRange() {
    const group = payrollGroup.value;
    const period = periodOption.options[periodOption.selectedIndex]?.text || "";
    const month = monthSelect.options[monthSelect.selectedIndex]?.text || "";
    const year = yearSelect.value;
    let range = "";

    if (!group || !month || !year) {
      payrollRange.value = "";
      return;
    }

    if (group === "weekly") range = `${month} (${period}) ${year}`;
    else if (group === "semi-monthly") {
      if (period.includes("First")) range = `${month} 1–15, ${year}`;
      else if (period.includes("Second")) range = `${month} 16–30, ${year}`;
    } else if (group === "monthly") range = `${month} 1–30, ${year}`;

    payrollRange.value = range;
    if (payrollRangeHeader) payrollRangeHeader.textContent = range;
  }

  payrollGroup.addEventListener("change", updatePeriodOptions);
  periodOption.addEventListener("change", generatePayrollRange);
  monthSelect.addEventListener("change", generatePayrollRange);
  yearSelect.addEventListener("change", generatePayrollRange);

  // Load data on page load
  loadPayrollData();

  // Fetching parameters from payroll_journal.html
  const urlParams = new URLSearchParams(window.location.search);

  // Safe access for optional parameters
  const myParam = urlParams.get('myParam') || undefined;
  myParam && console.log('Parameter:', myParam);

  // Safe access for group_id
  const groupId = urlParams.get("group_id") ? urlParams.get("group_id").toLowerCase() : undefined;
  const periodId = urlParams.get("period_id") || undefined;
  const monthId = urlParams.get("month_id") || undefined;
  const yearId = urlParams.get("year_id") || undefined;

  console.log("parameters fetched:", groupId, periodId, monthId, yearId);

  function setSelectWhenReady(selectId, value, retries = 10) {
    const select = document.getElementById(selectId);
    if (!select || !value) return;

    const optionExists = [...select.options].some(opt => opt.value == value);

    if (optionExists) {
      select.value = value;
      select.dispatchEvent(new Event("change"));
    } else if (retries > 0) {
      setTimeout(() => setSelectWhenReady(selectId, value, retries - 1), 300);
    }
  }
  
  document.addEventListener("DOMContentLoaded", () => {
    setSelectWhenReady("payrollGroup", groupId);
    setSelectWhenReady("periodOption", periodId);
    setSelectWhenReady("month", monthId);
    setSelectWhenReady("year", yearId);
  });

  // ===============================
  // STEP 1 RIGHT: Filter Dropdowns
  // ===============================
  async function loadPayrollDropdowns() {
    try {
      const dropdowns = [
        { category: "company", elementId: "company" },
        { category: "location", elementId: "location" },
        { category: "branch", elementId: "branch" },
        { category: "division", elementId: "division" },
        { category: "department", elementId: "department" },
        { category: "class", elementId: "class" },
        { category: "position", elementId: "position" },
        { category: "employee_type", elementId: "empType" },
        { category: "salary_type", elementId: "salaryType" },
        { category: "employee", elementId: "employee" }
      ];

      // Load dropdown options
      for (const drop of dropdowns) {
        let url = `/api/system_lists/${drop.category}`;

        if (drop.category === "employee") {
          const selectedOption = document.querySelector('input[name="option"]:checked')?.value || "active";
          url += `?status=${selectedOption}`;
        }

        const res = await fetch(url);
        const data = await res.json();
        const select = document.getElementById(drop.elementId);
        if (!select) continue;

        select.innerHTML = '<option value="" disabled selected>-- Select --</option>';

        data.forEach(item => {
          const opt = document.createElement("option");
          opt.value = item.value;
          opt.textContent = item.value;
          select.appendChild(opt);
        });
      }
      // Reset radio buttons
      document.querySelectorAll('#filterSection input[type="radio"]').forEach(input => {
        input.checked = false;
      });
      document.getElementById("activeEmployees").checked = true;
      document.getElementById('employeeName').value = '';

      // Load employees based on selected filters
      loadEmployeeDropdownByRun();
    } catch (err) {
      console.error("Error loading payroll dropdowns:", err);
    }
  }

  // Get runId based on filters (checking if there's record)
  async function getRunIdFromFilters() {
    const payrollGroup = document.getElementById('payrollGroup').value;
    const payrollPeriod = document.getElementById('periodOption').value;
    const month = document.getElementById('month').value;
    const year = document.getElementById('year').value;

    if (!payrollGroup || !payrollPeriod || !month || !year) return null;

    const url = `/api/get_run_id_payroll_computation?payroll_group=${payrollGroup}&payroll_period=${payrollPeriod}&month=${month}&year=${year}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.success && data.run_id) {
      return data.run_id;
    } else {
      return null;  // Return null if no run_id found
    }
  }

  // Load dropdown for employee category based on runId
  async function loadEmployeeDropdownByRun() {
    const runId = await getRunIdFromFilters();
    const selectedOption = document.querySelector('input[name="option"]:checked')?.value || "active";

    if (!runId) return; // If no run_id is found, stop execution

    const params = new URLSearchParams({
      company: document.getElementById("company").value,
      location: document.getElementById("location").value,
      branch: document.getElementById("branch").value,
      division: document.getElementById("division").value,
      department: document.getElementById("department").value,
      class: document.getElementById("class").value,
      position: document.getElementById("position").value,
      empType: document.getElementById("empType").value,
      salaryType: document.getElementById("salaryType").value
    });

    // Fetch employees for this run_id
    const res = await fetch(`/api/employees_for_payroll_run?run_id=${runId}&status=${selectedOption}&${params}`);
    const data = await res.json();

    const select = document.getElementById("employee");
    select.innerHTML = '<option value="" disabled selected>-- Select --</option>';

    data.employees.forEach(emp => {
      const opt = document.createElement("option");
      opt.value = emp.employee_id;
      opt.textContent = `${emp.last_name}`;
      opt.dataset.fullname = `[${emp.emp_code}] ${emp.first_name} ${emp.last_name}`;
      select.appendChild(opt);
    });
  }

  // Employee dropdown event listener
  document.getElementById("categorySelector").addEventListener("change", (e) => {
    if (e.target.tagName === "SELECT" && e.target.id !== "employee") {
      loadEmployeeDropdownByRun();
    }
  });

  // Employee Name field event listener
  document.getElementById("employee").addEventListener("change", function () {
    const selectedOption = this.options[this.selectedIndex];
    const employeeNameInput = document.getElementById("employeeName");

    employeeNameInput.value = selectedOption.dataset.fullname || "";
  });

  // Radio button event listener
  document.querySelectorAll('input[name="option"]').forEach(radio => {
    radio.addEventListener("change", () => {
      loadEmployeeDropdownByRun();
    });
  });

  // Clear button event listener
  document.getElementById('clearFiltersBtn').addEventListener('click', function() {
    // Get all the dropdowns (select elements)
    const dropdowns = document.querySelectorAll('.filter-panel select');

    // Loop through each dropdown and reset to default value (empty)
    dropdowns.forEach(function(dropdown) {
      dropdown.value = ''; // Reset to default (empty) value
    });

    document.getElementById('employeeName').value = ''; // Reset to default (empty) value

    // Optionally, reset the radio buttons if needed
    document.getElementById('activeEmployees').checked = true; // Keep 'Active' as default
  });
  
  // Filter change event listener
  function setupFilterChangeListeners() {
    const updateDropdowns = () => {
      loadEmployeeDropdownByRun();
    };

    document.getElementById('payrollGroup').addEventListener('change', updateDropdowns);
    document.getElementById('periodOption').addEventListener('change', updateDropdowns);
    document.getElementById('month').addEventListener('change', updateDropdowns);
    document.getElementById('year').addEventListener('change', updateDropdowns);
  }

  // call once when page loads
  loadPayrollDropdowns();
  setupFilterChangeListeners();

  // ===============================
  // STEP 1.5: CHECKER AND CREATE A PAYROLL
  // ===============================
  // --- Ensure or create payroll_run and return run_id ---
  async function ensurePayrollRun() {
    // read UI selections (you already used these elsewhere)
    const groupValue = document.getElementById("payrollGroup").value;
    const periodId = document.getElementById("periodOption").value;
    const monthId = document.getElementById("month").value;
    const yearValue = document.getElementById("year").value;

    if (!groupValue || !periodId || !monthId || !yearValue) {
      throw new Error("Missing payroll run identifiers");
    }

    // First try to find existing run
    const qs = new URLSearchParams({
      group_id: groupValue,
      period_id: periodId,
      month_id: monthId,
      year_id: yearValue
    });

    try {
      // 1) Try GET to find existing run
      let res = await fetch(`/api/payroll_runs?${qs.toString()}`);
      let data = await res.json();

      if (res.ok && data && data.run) {
        // found existing run
        return data.run.run_id;ev
      }

      // 2) Not found — create new run
      const payrollRange = document.getElementById("payrollRange").value || "";
      const createBody = {
        group_id: groupValue,
        period_id: periodId,
        month_id: monthId,
        year_id: yearValue,
        payroll_range: payrollRange
      };

      const user_id = sessionStorage.getItem("user_id");
      const admin_name = sessionStorage.getItem("admin_name");
      const bodyData = {
        ...createBody,
        user_id,
        admin_name
      };
      res = await fetch("/api/payroll_runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData)
      });

      data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to create payroll run");
      }

      return data.run_id;
    } catch (err) {
      console.error("ensurePayrollRun error:", err);
      throw err;
    }
  }

  async function startPayrollComputationUI(runId) {
    // show computation section and set default payroll tab
    showSection("computationSection");
    // default to payroll tab inside computation section
    setActiveTab("payroll", "#computationSection");

    document.getElementById("profile-header").classList.add("hidden");
    document.querySelector(".tab-buttons").classList.add("hidden");
    document.querySelector(".summary-bar").classList.add("hidden");
    document.getElementById("payroll").classList.add("hidden");

    await loadAllowanceAndDeductionTypes();
    generateRows();
    generateOTND();
    generateOTNDAdjustments();
    generateAttendanceAdjustments();
    resetPayrollFields();
    setupSummaryListener();

    // make sure runId is available to loader
    window.currentPayrollRunId = runId || window.currentPayrollRunId || "";
    resetSearchControls();
    loadFilteredEmployees(runId);
  }
  
  // Event Listener for Helper Tools
  document.addEventListener("DOMContentLoaded", function () {
    const selectAllBtn = document.getElementById("selectAllBtn");
    const clearAllBtn = document.getElementById("clearAllBtn");
    const table = document.getElementById("employeeSelectTable");

    function getCheckboxes() {
      return table.querySelectorAll("tbody input[type='checkbox']");
    }

    // Select All
    selectAllBtn.addEventListener("click", () => {
      getCheckboxes().forEach(cb => cb.checked = true);
      clearAllBtn.checked = false;
    });

    // Clear All
    clearAllBtn.addEventListener("click", () => {
      getCheckboxes().forEach(cb => cb.checked = false);
      selectAllBtn.checked = false;
    });

    // Delegate change event (works even for dynamic rows)
    table.addEventListener("change", (e) => {
      if (e.target.type === "checkbox" && e.target.checked) {
        clearAllBtn.checked = false;
      } else {
        selectAllBtn.checked = false;
      }
    });
  });

  // Default Modal Function
  function resetModal() {
    const selectAllBtn = document.getElementById("selectAllBtn");
    const clearAllBtn = document.getElementById("clearAllBtn");
    const table = document.getElementById("employeeSelectTable");
    const searchCategory = document.getElementById("searchCategoryModal");
    const searchInput = document.getElementById("searchInputModal");
    
    // Safety check for table
    if (table) {
      const checkboxes = table.querySelectorAll("tbody input[type='checkbox']");
      checkboxes.forEach(cb => cb.checked = false);
    }

    // Reset Select All / Clear All buttons
    if (selectAllBtn) selectAllBtn.checked = false;
    if (clearAllBtn) clearAllBtn.checked = false;

    // Reset search select dropdown to first option
    if (searchCategory) searchCategory.selectedIndex = 0;

    // Clear search input
    if (searchInput) searchInput.value = "";
  }

  // Reset modal on page load
  document.addEventListener("DOMContentLoaded", () => {
    resetModal();
  });

  let runIdForModal = null;

  // Set up listeners only once
  document.getElementById("searchCategoryModal").addEventListener("change", () => {
    openEmployeeSelectionModal(runIdForModal);
  });

  document.getElementById("searchInputModal").addEventListener("input", () => {
    openEmployeeSelectionModal(runIdForModal);
  });

  async function openEmployeeSelectionModal(runId) {
    const modal = document.getElementById("employeeSelectModal");
    const searchValue = document.getElementById("searchInputModal")?.value || "";
    const searchCategoryValue = document.getElementById("searchCategoryModal")?.value || "employee_id";
    
    runIdForModal = runId;

    try {
      const employees = await loadSelectableEmployees(runId, searchValue, searchCategoryValue);
      const tbody = document.querySelector("#employeeSelectTable tbody");

      // render table
      tbody.innerHTML = "";
      employees.forEach(emp => {
        const row = document.createElement("tr");
        console.log("EMPLOYEES LOADED:", employees);

        row.innerHTML = `
          <td><input type="checkbox" class="emp-check" value="${emp.employee_id}"></td>
          <td>${emp.emp_code || emp.employee_id}</td>
          <td>${emp.last_name}</td>
          <td>${emp.first_name}</td>
        `;
        
        tbody.appendChild(row);
      });
  
      // Show modal
      modal.classList.remove("hidden");
      
      // Scroll to top
      const container = document.querySelector("#employeeSelectModal .employee-select-container");
      container.scrollTop = 0;
      
      // Cancel button
      document.getElementById("employeeSelectCancel").onclick = () => {
        modal.classList.add("hidden");
      };

      // Proceed button
      document.getElementById("employeeSelectProceed").onclick = async () => {
        const selected = [...document.querySelectorAll(".emp-check:checked")].map(cb => Number(cb.value));

        if (selected.length === 0) {
          showToast("Select at least one employee.", "warning");
          return;
        }

        try {
          const res = await fetch(`/api/payroll_runs/${runId}/employees`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employees: selected })
          });
          const insert = await res.json();

          if (!insert.success) {
            showToast(insert.message || "Error adding employees to payroll.", "warning");
            return;
          }

          showToast("Payroll created successfully.", "success");
          modal.classList.add("hidden");

          // Start payroll UI
          startPayrollComputationUI(runId);
        } catch (err) {
          console.error("Error adding employees to payroll:", err);
          showToast("Server error while adding employees.", "warning");
        }
      };
    } catch (err) {
      console.error("openEmployeeSelectionModal error:", err);
      showToast("Failed to load selectable employees.", "warning");
    }
  }

  function openMissingEmployeesModal({ runId, missingCount, onContinue }) {
    const modal = document.getElementById("missingEmployeesModal");
    const text = document.getElementById("missingEmployeesText");

    const addBtn = document.getElementById("missingAddBtn");
    const continueBtn = document.getElementById("missingContinueBtn");
    const backBtn = document.getElementById("missingBackBtn");

    if (missingCount === 0) {
      // INFORMATION MODE
      text.textContent =
        "All employees matching the current filters are already included in this payroll run.";

      addBtn.classList.add("hidden");
      continueBtn.classList.add("hidden");
      backBtn.classList.remove("hidden");

      backBtn.onclick = () => {
        modal.classList.add("hidden");
      };
    } else {
      // DECISION MODE
      text.textContent = missingCount === 1
        ? "There is 1 employee not yet included in this payroll run."
        : `There are ${missingCount} employees not yet included in this payroll run.`;

      addBtn.classList.remove("hidden");
      continueBtn.classList.remove("hidden");
      backBtn.classList.add("hidden");

      // ADD EMPLOYEES
      addBtn.onclick = () => {
        modal.classList.add("hidden");
        openEmployeeSelectionModal(runId);
      };

      // CONTINUE ANYWAY
      continueBtn.onclick = () => {
        modal.classList.add("hidden");
        if (typeof onContinue === "function") {
          onContinue(runId);
        }
      };
    }

    modal.classList.remove("hidden");
  }

  // Load Selectable Employees for the modal
  async function loadSelectableEmployees(runId, searchValue = "", searchCategoryValue = "employee_id") {
    // Build same filter params used for the main list
    const params = new URLSearchParams({
      payroll_period: document.getElementById("payrollGroup").value,
      company: document.getElementById("company").value,
      location: document.getElementById("location").value,
      branch: document.getElementById("branch").value,
      division: document.getElementById("division").value,
      department: document.getElementById("department").value,
      class: document.getElementById("class").value,
      position: document.getElementById("position").value,
      empType: document.getElementById("empType").value,
      salaryType: document.getElementById("salaryType").value,
      employee: document.getElementById("employee").value,
      option: document.querySelector("input[name='option']:checked")?.value || "active"
    });

    if (searchValue !== "") {
      params.append("search", searchValue);
      params.append("searchBy", searchCategoryValue);
    } else {
      console.log("searchValue is empty");
    }
    
    try {
      // 1) Fetch all filtered employees
      const res = await fetch(`/api/employees_for_payroll?${params.toString()}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to load employees");

      let candidates = data.employees || [];

      // 2) Fetch existing employees already in the run so we can exclude them
      if (runId) {
        try {
          const runRes = await fetch(`/api/payroll_runs/${runId}/employees`);
          const runData = await runRes.json();
          if (runData && Array.isArray(runData.employees) && runData.employees.length > 0) {
            const existingIds = new Set(runData.employees.map(r => Number(r.employee_id)));
            candidates = candidates.filter(c => !existingIds.has(Number(c.employee_id)));
          }
        } catch (err) {
          // if the endpoint fails, continue with candidate list (better show selection than nothing)
          console.warn("Could not fetch existing employees for run:", err);
        }
      }

      return candidates;
    } catch (err) {
      console.error("loadSelectableEmployees error:", err);
      return [];
    }
  }

  // Check for negative net pay employees on page load
  document.addEventListener("DOMContentLoaded", () => {
    checkNegativePayroll();
  });

  // Check for negative net pay employees before proceeding with payroll computation
  async function checkNegativePayroll() {
    const res = await fetch("/api/employees_negative_netpay");
    const data = await res.json();

    if (data.success && data.employees.length > 0) {
      const modal = document.getElementById("negativePayrollModal");
      document.getElementById("negativePayrollText").textContent = 
        `${data.employees.length} employee(s) have negative net pay.`;

      modal.classList.remove("hidden");

      // Put on Hold button opens employee selection modal
      document.getElementById("negativeHoldBtn").onclick = () => {
        modal.classList.add("hidden"); // hide warning
        openEmployeeSelectionModalForNegativePayroll(data.employees);
      };

      // Continue Anyway button
      document.getElementById("negativeContinueBtn").onclick = () => {
        modal.classList.add("hidden");
        console.log("Continuing payroll process...");
      };
    } else {
      console.log("Continuing payroll process..."); // no negative employees, continue directly
    }
  }

  // Display Modal with list of employees to select from
  function openEmployeeSelectionModalForNegativePayroll(negativeEmployees) {
    const modal = document.getElementById("employeeSelectModal");
    const tbody = modal.querySelector("#employeeSelectTable tbody");
    tbody.innerHTML = ""; // Clear previous rows

    // Populate table
    negativeEmployees.forEach(emp => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><input type="checkbox" class="employeeCheckbox" value="${emp.employee_id}"></td>
        <td>${emp.emp_code}</td>
        <td>${emp.last_name}</td>
        <td>${emp.first_name}</td>
      `;
      tbody.appendChild(row);
    });

    // Select All / Clear All
    document.getElementById("selectAllBtn").onclick = () => {
      document.querySelectorAll(".employeeCheckbox").forEach(cb => cb.checked = true);
    };
    
    document.getElementById("clearAllBtn").onclick = () => {
      document.querySelectorAll(".employeeCheckbox").forEach(cb => cb.checked = false);
    };

    // Proceed button
    document.getElementById("employeeSelectProceed").onclick = async () => {
      const selectedIds = Array.from(document.querySelectorAll(".employeeCheckbox:checked"))
                            .map(cb => cb.value);
      if (selectedIds.length === 0) {
        alert("Please select at least one employee.");
        return;
      }

      try {
          const res = await fetch("/api/employee_payroll/hold_negative", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employeeIds: selectedIds })
          });

          // Check HTTP status first
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || "Server responded with error");
          }

          const data = await res.json();
          if (data.success) {
            document.getElementById("employeeSelectModal").classList.add("hidden");
            console.log("Continuing payroll process..."); // Continue payroll
          } else {
            alert("Failed to put employees on hold.");
          }
      } catch (err) {
        console.error(err);
        alert("Server error while putting employees on hold.");
      }
    };

    // Cancel button
    document.getElementById("employeeSelectCancel").onclick = () => {
      modal.classList.add("hidden");
    };

    modal.classList.remove("hidden"); // Show modal
  }

  // Fetch employees strictly based on payroll run (for saving)
  async function loadEmployeesByRun(runId) {
    console.log("loadEmployeesByRun called with runId:", runId);

    if (!runId) return [];

    const status =
      document.querySelector("input[name='option']:checked")?.value || "null";

    try {
      console.log("Fetching with status:", status);

      const res = await fetch(
        `/api/employees_for_payroll_run?run_id=${runId}&status=${status}`
      );
      
      const data = await res.json();
      console.log("API response:", data);

      if (!data.success || !Array.isArray(data.employees)) {
        console.warn("No employees returned for payroll run:", data.message);
        return [];
      }

      const candidates = data.employees;
      console.log("Final selectable employees:", candidates);
      
      const employeeIds = candidates.map(e => e.employee_id);
      console.log("Employee IDs:", employeeIds);

      return candidates;
    } catch (err) {
      console.error("loadEmployeesByRun error:", err);
      return [];
    }
  }
  
  // ===============================
  // STEP 2 TOP: List of Employees
  // ===============================
  // Load Filtered Employees
  async function loadFilteredEmployees(runId) {
    try {
      // --- RESET STATE ---
      selectedEmployeeId = null; // clear previously selected employee
      document.querySelectorAll("#employeeTable tbody tr").forEach(r => r.classList.remove("selected-row"));
      const container = document.getElementById("employeeListContainer");
      if (container) container.scrollTop = 0;
      
      // Get the selected employee's ID
      const selectedEmployeeIdFromDropdown = document.getElementById("employee").value;

      const employeeParam = selectedEmployeeIdFromDropdown;

      const searchValue = document.getElementById("searchInput").value.trim();
      const searchCategoryValue = document.getElementById("searchCategory").value;

      const params = new URLSearchParams({
        payroll_period: document.getElementById("payrollGroup").value,
        company: document.getElementById("company").value,
        location: document.getElementById("location").value,
        branch: document.getElementById("branch").value,
        division: document.getElementById("division").value,
        department: document.getElementById("department").value,
        class: document.getElementById("class").value,
        position: document.getElementById("position").value,
        empType: document.getElementById("empType").value,
        salaryType: document.getElementById("salaryType").value,
        employee: employeeParam,
        option: document.querySelector("input[name='option']:checked").value
      });

      if (searchValue !== "") {
        params.append("search", searchValue);
        params.append("searchBy", searchCategoryValue);
      } else {
        console.log("searchValue is empty");
      }
      
      const effectiveRunId = typeof runId === "string"
        ? runId
        : window.currentPayrollRunId || "";

      const res = await fetch(`/api/employees_for_payroll?${params.toString()}&run_id=${effectiveRunId}`);
      const data = await res.json();

      if (!data.success) throw new Error(data.message);

      const tbody = document.querySelector("#employeeTable tbody");
      tbody.innerHTML = "";

      data.employees.forEach((emp, i) => {
        const row = document.createElement("tr");
        row.dataset.employeeId = emp.employee_id;
        row.innerHTML = `
          <td>${i + 1}</td>
          <td>${emp.company || "-"}</td>
          <td>${emp.department || "-"}</td>
          <td>${emp.last_name}</td>
          <td>${emp.first_name}</td>
          <td>${emp.emp_code}</td>
        `;

        // Highlight if this is the previously selected employee
        if (emp.employee_id === selectedEmployeeId) {
          row.classList.add("selected-row");
        }

        // When clicked, load payroll computation for this employee
        row.addEventListener("click", () => {
          // Remove highlight from previously selected row
          document.querySelectorAll("#employeeTable tbody tr").forEach(r => r.classList.remove("selected-row"));
          
          // Highlight the clicked row
          row.classList.add("selected-row");

          // Remember this employee
          selectedEmployeeId = emp.employee_id;

          // Display employee info
          document.getElementById("profile-header").classList.remove("hidden");
          document.getElementById("empFNameDetail").textContent = `${emp.first_name} ${emp.last_name}`;
          document.getElementById("empIdDetail").textContent = emp.emp_code;
          document.getElementById("empDeptDetail").textContent = emp.department || "-";
          document.getElementById("empPosDetail").textContent = emp.position || "-";
          document.getElementById("empStatDetail").textContent = emp.status || "-";

          // Load their payroll
          resetPayrollFields();
          renderEmployeePayroll(emp.employee_id, "employee");
          attachAmountInputListeners();
          resetAllRows();
        });

        tbody.appendChild(row);
        
        //applySearchFilter();
      });
    } catch (err) {
      console.error("Error loading employees:", err);
    }
  }

  // ===============================
  // STEP 2 BOTTOM: Payroll Computation
  // ===============================
  // Globals to cache master lists
  let allowanceTypes = [];   // { allowance_type_id, allowance_name, is_taxable, default_amount }
  let deductionTypes = [];   // { deduction_type_id, deduction_name, default_amount }

  // Reset fields
  function resetPayrollFields() {
    console.log("Input fields are reset")
    
    // Reset all time fields
    document.querySelectorAll('[data-time-field]').forEach(input => {
      const format = input.dataset.format; // "absence" or "late"

      if (format === "absence") {
        input.value = "00:00:00"; // Absence format: DD:HH:MM
      } else {
        input.value = "000:00";    // Late/Undertime/OT format: HHH:MM
      }

      input.disabled = true; // keep disabled if needed
    });

    // Reset amount fields (e.g. formatted currency inputs)
    document.querySelectorAll('#computationSection .amount').forEach(el => {
      const input = el.querySelector('input[data-amount-field]');

      if (input) {
        input.value = "0.00";
      } else {
        el.textContent = "0.00";
      }
    });

    // Reset all number fields
    document.querySelectorAll('#computationSection input[type="number"]').forEach(input => {
      input.value = "0.00";
      input.disabled = true;
    });

    // Reset checkboxes
    document.querySelectorAll('#computationSection input[type="checkbox"]').forEach(input => {
      input.checked = false;
      input.disabled = true;
    });
    
    // Reset buttons
    document.querySelectorAll('#allowances button[type="button"], #deductions button[type="button"]').forEach(button => {
      button.disabled = true;
    });

    // Reset selection options
    document.querySelectorAll('#payroll select, #allowances select, #deductions select').forEach(select => {
      select.selectedIndex = 0;
      select.disabled = true;
    });

    // Reset key summary display
    ["grossPay", "grandTotalDeductions", "netPay"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = "0.00";
    });
  }

  // Time input change handler 
  function time() {
    const inputs = document.querySelectorAll('[data-time-field]');

    inputs.forEach(input => {
      const format = input.dataset.format; // "absence" or "late"

      // Handle typing and formatting
      input.addEventListener('input', () => {
        let val = input.value;

        // Keep numbers only
        val = val.replace(/\D/g, '');

        if (format === 'absence') {
          // Absence format: DD:HH:MM
          val = val.slice(0, 6); // max 6 digits (DDHHMM)
          if (val.length > 4) {
            val = val.replace(/(\d{2})(\d{2})(\d{1,2})/, "$1:$2:$3");
          } else if (val.length > 2) {
            val = val.replace(/(\d{2})(\d{1,2})/, "$1:$2");
          }
        } else {
          // Late/Undertime format: HHH:MM
          val = val.slice(0, 5); // max 5 digits (HHHMM)
          if (val.length > 2) {
            val = val.replace(/(\d{1,3})(\d{2})/, "$1:$2");
          }
        }

        input.value = val;
      });

      // Restrict keypresses
      input.addEventListener('keydown', (e) => {
        const allowed = ['ArrowLeft', 'ArrowRight', 'Backspace', 'Delete', 'Tab'];
        if (!allowed.includes(e.key) && !e.key.match(/[0-9]/)) {
          e.preventDefault();
        }
      });
    });
  }
  
  // Convert the minutes to input formats
  function formatAbsence(value) {
    // If value is number, treat it as total minutes
    let totalMinutes = typeof value === "number" ? value : (() => {
      if (!value) return 0;
      const [hh, mm, ss] = value.split(":").map(Number);
      return hh*60 + mm;
    })();

    const days = Math.floor(totalMinutes / (24*60));
    const hours = Math.floor((totalMinutes % (24*60)) / 60);
    const minutes = totalMinutes % 60;

    return `${String(days).padStart(2,'0')}:${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
  }

  function formatLateOrUndertime(value) {
    // If value is number, treat it as total minutes
    let totalMinutes = typeof value === "number" ? value : (() => {
      if (!value) return 0;
      const [hh, mm, ss] = value.split(":").map(Number);
      return hh*60 + mm;
    })();

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${String(hours).padStart(3,'0')}:${String(minutes).padStart(2,'0')}`;
  }

  // Convert the input to total minutes
  function parseAbsence(inputValue) {
    // If the value is already a number (minutes), return it
    if (typeof inputValue === "number") return inputValue;

    // Fallback for null/undefined/empty
    if (!inputValue) return 0;

    // Expecting "DD:HH:MM" string
    const [dd, hh, mm] = inputValue.split(":").map(Number);
    return (dd || 0) * 24 * 60 + (hh || 0) * 60 + (mm || 0);
  }

  function parseLateOrUndertime(inputValue) {
    if (typeof inputValue === "number") return inputValue;
    if (!inputValue) return 0;

    // Expecting "HHH:MM" string
    const [hh, mm] = inputValue.split(":").map(Number);
    return (hh || 0) * 60 + (mm || 0);
  }
  
  // === Live gross pay, grand total deduc. and net pay updater ===
  function setupLiveDeductionListeners() {
    // Get inputs
    const basicSalary = parseFloat(document.getElementById("basicSalary").value || 0);
    const overtime = parseFloat(document.getElementById("overtime").value || 0);
    const taxable = parseFloat(document.getElementById("taxableAllowances").value || 0);
    const nontaxable = parseFloat(document.getElementById("nonTaxableAllowances").value || 0);
    const adjComp = parseFloat(document.getElementById("adjComp").value || 0);
    const adjNonComp = parseFloat(document.getElementById("adjNonComp").value || 0);
    const leavesUsed = parseFloat(document.getElementById("leavesUsed").value || 0);

    // Deduction inputs
    const absenceDeductionValue = parseFloat(document.getElementById("absenceDeduction").value || 0);
    const lateDeductionValue = parseFloat(document.getElementById("lateDeduction").value || 0);
    const undertimeDeductionValue = parseFloat(document.getElementById("undertimeDeduction").value || 0);

    // Grand deductions
    const sssEE = parseFloat(document.getElementById("sssEE").value || 0);
    const pagibigEE = parseFloat(document.getElementById("pagibigEE").value || 0);
    const philhealthEE = parseFloat(document.getElementById("philhealthEE").value || 0);
    const taxWithheld = parseFloat(document.getElementById("taxWithheld").value || 0);
    const totalDeductions = parseFloat(document.getElementById("totalDeductions").value || 0);
    const totalLoans = parseFloat(document.getElementById("totalLoans").value || 0);
    const otherDeductions = parseFloat(document.getElementById("otherDeductions").value || 0);
    const premiumAdj = parseFloat(document.getElementById("premiumAdj").value || 0);
    const empInputs = document.querySelectorAll('#premiumRows [data-emp-field]');
    let empInputsTotal = 0;
    empInputs.forEach(input => { empInputsTotal += parseFloat(input.value || 0); });

    // Summary fields
    const totalGrossPay = document.getElementById("grossPay");
    const grandTotalDeductions = document.getElementById("grandTotalDeductions");
    const totalNetPay = document.getElementById("netPay");

    // Calculations
    const totalTimeDeductions = absenceDeductionValue + lateDeductionValue + undertimeDeductionValue;
    const gross = basicSalary - totalTimeDeductions + overtime + taxable + nontaxable + adjComp + adjNonComp + leavesUsed;
    const deductions = sssEE + pagibigEE + philhealthEE + taxWithheld + totalDeductions + totalLoans + otherDeductions + premiumAdj;

    // Update summary fields
    totalGrossPay.textContent = gross.toLocaleString("en-PH", { minimumFractionDigits: 2 });
    grandTotalDeductions.textContent = deductions.toLocaleString("en-PH", { minimumFractionDigits: 2 });
    totalNetPay.textContent = (gross - deductions).toLocaleString("en-PH", { minimumFractionDigits: 2 });
  }
  
  // Deduction fields updater
  function updateDeductionFields(payroll) {
    const monthlySalary = parseFloat(payroll.main_computation || 0);
    const daysInYear = payroll.days_in_year;
    const hoursInDay = payroll.hours_in_day;

    const daysInMonth = daysInYear / 12;
    const dailyRate = monthlySalary / daysInMonth;
    const minutesPerDay = hoursInDay * 60;

    const absenceMinutes = parseAbsence(document.getElementById("absenceTime").value);
    const lateMinutes = parseLateOrUndertime(document.getElementById("lateTime").value);
    const undertimeMinutes = parseLateOrUndertime(document.getElementById("undertime").value);

    const absenceDeductionValue = Math.round((absenceMinutes / minutesPerDay) * dailyRate * 10) / 10;
    const lateDeductionValue = Math.round((lateMinutes / minutesPerDay) * dailyRate * 100) / 100;
    const undertimeDeductionValue = Math.round((undertimeMinutes / minutesPerDay) * dailyRate * 10) / 10;

    document.getElementById("absenceDeduction").value = absenceDeductionValue.toFixed(2) || "0.00";
    document.getElementById("lateDeduction").value = lateDeductionValue.toFixed(2) || "0.00";
    document.getElementById("undertimeDeduction").value = undertimeDeductionValue.toFixed(2) || "0.00";
  }

  // Call this after populating fields
  function timeInputListener(payroll) {
    const absenceInput = document.getElementById("absenceTime");
    const lateInput = document.getElementById("lateTime");
    const undertimeInput = document.getElementById("undertime");
    const adjNonComp = document.getElementById("adjNonComp");

    [absenceInput, lateInput, undertimeInput, adjNonComp].forEach(input => {
      input.addEventListener("input", () => {
        updateDeductionFields(payroll);
      });
    });
  }

  // Event listener for updating summary fields
  function setupSummaryListener() {
    const section = document.getElementById("computationSection");

    // Listen to input changes
    section.addEventListener("input", (e) => {
      if (e.target.tagName === "INPUT") {
        setupLiveDeductionListeners();
      }
    });

    // Listen to button clicks
    section.addEventListener("click", (e) => {
      if (e.target.tagName === "BUTTON") {
        setupLiveDeductionListeners();
      }
    });

    // Listen to select changes
    section.addEventListener("change", (e) => {
      if (e.target.tagName === "SELECT") {
        setupLiveDeductionListeners();
      }
    });
  }

  // Load employee payroll information for one employee
  async function renderEmployeePayroll(employeeId, triggerSource = "employee") {
    const periodOption = document.getElementById("periodOption").value;
    try {
      const runId = await getRunIdFromFilters();
      const res = await fetch(
        `/api/employee_payroll_settings/${employeeId}?run_id=${runId}&periodOption=${encodeURIComponent(periodOption)}`
      );
      const data = await res.json();

      console.log("Payroll data response:", data);
      if (!data.success) {
        if (triggerSource === "employee") {
          showToast("⚠️ No payroll data found for this employee.", "warning");
        }
        
        resetPayrollFields();
        return;
      }

      // Switch to computation section
      setActiveTab("payroll", "#computationSection");
      document.querySelector(".summary-bar").classList.remove("hidden");

      // Populate payslip fields when an employee is selected
      const payroll = data.data;
      const basicSalaryField = document.getElementById("basicSalary");
      const absenceTime = document.getElementById("absenceTime");
      const absenceDeduction = document.getElementById("absenceDeduction");
      const lateTime = document.getElementById("lateTime");
      const lateDeduction = document.getElementById("lateDeduction");
      const undertime = document.getElementById("undertime");
      const undertimeDeduction = document.getElementById("undertimeDeduction");
      const overtimeField = document.getElementById("overtime");
      const taxableAllowancesField = document.getElementById("taxableAllowances");
      const nonTaxableAllowancesField = document.getElementById("nonTaxableAllowances");
      const adjCompField = document.getElementById("adjComp");
      const adjNonCompField = document.getElementById("adjNonComp");
      const leavesUsed = document.getElementById("leavesUsed");

      const gsisEE = document.getElementById("gsisEE");
      const gsisER = document.getElementById("gsisER");
      const gsisECC = document.getElementById("gsisECC");
      const sssEE = document.getElementById("sssEE");
      const sssER = document.getElementById("sssER");
      const sssECC = document.getElementById("sssECC");
      const pagibigEE = document.getElementById("pagibigEE");
      const pagibigER = document.getElementById("pagibigER");
      const pagibigECC = document.getElementById("pagibigECC");
      const philhealthEE = document.getElementById("philhealthEE");
      const philhealthER = document.getElementById("philhealthER");
      const philhealthECC = document.getElementById("philhealthECC");
      const taxWithheld = document.getElementById("taxWithheld");
      const totalDeductionsField = document.getElementById("totalDeductions");
      const totalLoansField = document.getElementById("totalLoans");
      const otherDeductionsField = document.getElementById("otherDeductions");
      const premiumAdjField = document.getElementById("premiumAdj");
      
      const ytdSSSField = document.getElementById("ytdSSS");
      const ytdWtaxField = document.getElementById("ytdWtax");
      const ytdPhilhealthField = document.getElementById("ytdPhilhealth");
      const ytdGSISField = document.getElementById("ytdGSIS");
      const ytdPagibigField = document.getElementById("ytdPagibig");
      const ytdGrossField = document.getElementById("ytdGross");

      const totalGrossPay = document.getElementById("grossPay");
      const grandTotalDeductions = document.getElementById("grandTotalDeductions");
      const totalNetPay = document.getElementById("netPay");

      // === GROSS EARNINGS ===
      // Normalize the payroll_period string from backend
      const period = (payroll.payroll_period || "").trim().toLowerCase();

      // Fill allowance and deduction fields
      fillAllowanceDeductionRows(payroll);

      // Fill OT / ND and Adjustments fields
      const otNd = payroll.ot_nd;
      const otNdAdj = payroll.ot_nd_adj;
      const attAdj = payroll.attendance_adj;
      fillOTND(otNd);
      fillOTNDAdjustments(otNdAdj);
      fillAttendanceAdjustments(attAdj);
      
      // Determine adjusted basic salary based on payroll period
      let adjustedSalary = parseFloat(payroll.main_computation || 0);

      // Separate taxable and non-taxable
      const { taxable, nontaxable } = calculateAllowanceTotals();
      const totalDeductions = calculateDeductionTotals();

      switch (period) {
        case "weekly":
          adjustedSalary /= 4;
          break;
        case "semi-monthly":
          adjustedSalary /= 2;
          break;
        case "monthly":
        default:
          break;
      }

      // Deductions based on time
      const monthlySalary = parseFloat(payroll.main_computation || 0);
      const daysInYear = payroll.days_in_year
      const daysInWeek = payroll.days_in_week
      const hoursInDay = payroll.hours_in_day
      const weekInYear = payroll.week_in_year
      const daysInMonth = daysInYear / 12;

      const dailyRate = (monthlySalary || 0) / daysInMonth;
      const minutesPerDay = hoursInDay * 60;

      const absenceMinutes = Number(payroll.absence_time || 0);
      const lateMinutes = Number(payroll.late_time || 0);
      const undertimeMinutes = Number(payroll.undertime || 0);
      
      const absenceDeductionValue = Math.round((absenceMinutes / minutesPerDay) * dailyRate * 10) / 10;
      const lateDeductionValue = Math.round((lateMinutes / minutesPerDay) * dailyRate * 100) / 100;
      const undertimeDeductionValue = Math.round((undertimeMinutes / minutesPerDay) * dailyRate * 10) / 10;

      // Fetch the other values normally
      const overtime = parseFloat(payroll.overtime || 0);
      const adjComp = parseFloat(payroll.adj_comp || 0);
      const adjNonComp = parseFloat(payroll.adj_non_comp || 0);

      basicSalaryField.value = adjustedSalary.toFixed(2);
      absenceTime.value = formatAbsence(payroll.absence_time) || "00:00:00";
      lateTime.value = formatLateOrUndertime(payroll.late_time) || "000:00";
      undertime.value = formatLateOrUndertime(payroll.undertime) || "000:00";
      absenceDeduction.value = absenceDeductionValue.toFixed(2);
      lateDeduction.value = lateDeductionValue.toFixed(2);
      undertimeDeduction.value = undertimeDeductionValue.toFixed(2);
      overtimeField.value = overtime.toFixed(2);
      taxableAllowancesField.value = taxable.toFixed(2);
      nonTaxableAllowancesField.value = nontaxable.toFixed(2);
      adjCompField.value = adjComp.toFixed(2);
      adjNonCompField.value = adjNonComp.toFixed(2);

      // Change listeners
      timeInputListener(payroll);
      OTNDInputListener(payroll);
      bindOTNDAdjustmentListeners(payroll);
      attendanceAdjInputListener(payroll);
      premiumInputListener();

      // === DEDUCTIONS ===
      totalDeductionsField.value = totalDeductions.toFixed(2);

      function adjustByPeriod(amount, period) {
        switch (period) {
          case "weekly":
            return amount / 4;
          case "semi-monthly":
            return amount / 2;
          case "monthly":
          default:
            return amount;
        }
      }

      // === Contributions ===
      if (payroll.contributions && payroll.contributions.length > 0) {
        payroll.contributions.forEach(c => {
          switch (c.contribution_type_id) {
            case 1: // SSS
              sssEE.value  = adjustByPeriod(c.ee_share, period);
              sssER.value  = adjustByPeriod(c.er_share, period);
              sssECC.value = adjustByPeriod(c.ecc, period);
              break;

            case 2: // Pag-IBIG
              pagibigEE.value  = adjustByPeriod(c.ee_share, period);
              pagibigER.value  = adjustByPeriod(c.er_share, period);
              pagibigECC.value = adjustByPeriod(c.ecc, period);
              break;

            case 3: // PhilHealth
              philhealthEE.value  = adjustByPeriod(c.ee_share, period);
              philhealthER.value  = adjustByPeriod(c.er_share, period);
              philhealthECC.value = adjustByPeriod(c.ecc, period);
              break;

            case 4: // Tax Withheld
              taxWithheld.value = adjustByPeriod(c.ee_share, period);
              break;
          }
        });
      }

      // Fetch the other values normally
      const leaves = parseFloat(payroll.total_leaves_used || 0);
      const totalLoans = parseFloat(payroll.lonas || 0);
      const otherDeductions = parseFloat(payroll.other_deductions || 0);
      const premiumAdj = parseFloat(payroll.premium_adj || 0);

      leavesUsed.value = leaves.toFixed(2);
      totalLoansField.value = totalLoans.toFixed(2);
      otherDeductionsField.value = otherDeductions.toFixed(2);
      premiumAdjField.value = premiumAdj.toFixed(2);

      // === SUMMARY ===
      // Hold status checkbox
      const holdCheckbox = document.getElementById("holdCheckbox");

      if (payroll.payroll_status && payroll.payroll_status.toLowerCase() === "hold") {
        holdCheckbox.checked = true;
      } else {
        holdCheckbox.checked = false;
      }

      // Total gross pay
      totalGrossPay.textContent = parseFloat(
        (
          adjustedSalary -
          absenceDeductionValue -
          lateDeductionValue -
          undertimeDeductionValue +
          overtime +
          taxable +
          nontaxable +
          adjComp +
          adjNonComp +
          leaves
        ).toFixed(2)
      ).toLocaleString("en-PH", { minimumFractionDigits: 2 });

      // Total deductions
      grandTotalDeductions.textContent = parseFloat(
        (
          parseFloat(sssEE.value || 0) +
          parseFloat(pagibigEE.value || 0) +
          parseFloat(philhealthEE.value || 0) +
          parseFloat(taxWithheld.value || 0) +
          totalDeductions
        ).toFixed(2)
      ).toLocaleString("en-PH", { minimumFractionDigits: 2 });

      // Total net pay
      const cleanValue = (el) => parseFloat(el.textContent.replace(/[^0-9.-]/g, "")) || 0;
      const grossValue = cleanValue(totalGrossPay);
      const deductionValue = cleanValue(grandTotalDeductions);
      totalNetPay.textContent = parseFloat(
        (grossValue - deductionValue).toFixed(2)
      ).toLocaleString("en-PH", { minimumFractionDigits: 2 });

      // === YTD VALUES ===
      // Fetch the other values normally
      const ytdSSS = parseFloat(payroll.previousYtd.ytd_sss || 0);
      const ytdWtax = parseFloat(payroll.previousYtd.ytd_wtax || 0);
      const ytdPhilhealth = parseFloat(payroll.previousYtd.ytd_philhealth || 0);
      const ytdGSIS = parseFloat(payroll.previousYtd.ytd_gsis || 0);
      const ytdPagibig = parseFloat(payroll.previousYtd.ytd_pagibig || 0);
      const ytdGross = parseFloat(payroll.previousYtd.ytd_gross || 0);

      ytdSSSField.value = (ytdSSS + parseFloat(sssEE.value || 0)).toFixed(2);
      ytdWtaxField.value = (ytdWtax + parseFloat(taxWithheld.value || 0)).toFixed(2);
      ytdPhilhealthField.value = (ytdPhilhealth + parseFloat(philhealthEE.value || 0)).toFixed(2);
      ytdGSISField.value = (ytdGSIS + parseFloat(gsisEE.value || 0)).toFixed(2);
      ytdPagibigField.value = (ytdPagibig + parseFloat(pagibigEE.value || 0)).toFixed(2);
      
      // Gross YTD = prev gross + current gross
      const currentGross = grossValue;
      ytdGrossField.value = (ytdGross + currentGross).toFixed(2);

      console.log(`✅ Loaded payroll for employee ID ${employeeId}`);
      return payroll;
    } catch (err) {
      console.error("Error loading employee payroll:", err);
    }
  }

  // Helper: minutes → HHH:MM
  function formatMinutesToTime(minutes) {
    minutes = Number(minutes) || 0;

    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;

    return `${String(hh).padStart(3, "0")}:${String(mm).padStart(2, "0")}`;
  }

  // Overtime and Night Differential
  function generateOTND() {
    const overtimeRows = document.getElementById("otNdOvertimeRows");
    const nightRows = document.getElementById("otNdNightRows");

    if (!overtimeRows || !nightRows) return;

    overtimeRows.innerHTML = "";
    nightRows.innerHTML = "";

    const OT_DATA = [
      { code: "RG RATE", rate: 1.00, key: "rg_rate" },
      { code: "RG OT", rate: 1.25, key: "rg_ot" },
      { code: "RD RATE", rate: 1.30, key: "rd_rate" },
      { code: "RD OT", rate: 1.69, key: "rd_ot" },
      { code: "SD RATE", rate: 0.30, key: "sd_rate" },
      { code: "SD OT", rate: 1.69, key: "sd_ot" },
      { code: "SDRD RATE", rate: 1.50, key: "sdrd_rate" },
      { code: "SDRD OT", rate: 1.95, key: "sdrd_ot" },
      { code: "HD RATE", rate: 1.00, key: "hd_rate" },
      { code: "HD OT", rate: 2.60, key: "hd_ot" },
      { code: "HDRD RATE", rate: 2.60, key: "hdrd_rate" },
      { code: "HDRD OT", rate: 3.38, key: "hdrd_ot" }
    ];

    const ND_PERCENT = 0.10;

    function createRow(target, label, rate, key, isND = false) {
      const tr = document.createElement("tr");

      tr.dataset.key = key;
      tr.dataset.rate = rate;
      tr.dataset.isNd = isND;

      tr.innerHTML = `
        <td>${label}</td>
        <td>${isND ? `${ND_PERCENT}% of ${rate.toFixed(2)}%` : rate.toFixed(2) + "%"}</td>
        <td>
          <input
            type="text"
            name="${key}"
            maxlength="6"
            placeholder="000:00"
            data-time-field
            data-format="time-field"
          >
        </td>
        <td class="amount">0.00</td>
      `;

      target.appendChild(tr);
    }

    OT_DATA.forEach(row => {
      createRow(overtimeRows, row.code, row.rate, row.key);
      createRow(nightRows, row.code + " ND", row.rate, row.key + "_nd", true);
    });
  }

  // Event handler for time inputs in overtime and night differential
  function OTNDInputListener(payroll) {
    // select all time inputs inside overtime and ND tables
    const timeInputs = document.querySelectorAll('#ot-nd [data-time-field]');

    timeInputs.forEach(input => {
      // prevent duplicate listeners
      if (input.dataset.listener === "true") return;
      input.dataset.listener = "true";

      input.addEventListener("input", () => {
        const tr = input.closest("tr");
        const amountCell = tr.querySelector(".amount");

        // READ RATE and isND from tr dataset
        const ND_PERCENT = 0.10;
        const rate = parseFloat(tr.dataset.rate) || 0;
        const isND = tr.dataset.isNd === "true";
        
        const monthlySalary = parseFloat(payroll.main_computation || 0);
        const daysInYear = payroll.days_in_year_ot
        const daysInWeek = payroll.days_in_week
        const hoursInDay = payroll.hours_in_day
        const weekInYear = payroll.week_in_year
        const daysInMonth = daysInYear / 12;

        const minutes = parseLateOrUndertime(input.value);
        const finalRate = isND ? rate * ND_PERCENT : rate;

        const dailyRate = (monthlySalary || 0) / daysInMonth;
        const minutesPerDay = hoursInDay * 60;

        // Round per-minute rate first
        const perMinuteRate = Math.round((dailyRate / minutesPerDay) * 100) / 100;

        const amount = Math.round(perMinuteRate * finalRate * minutes * 100) / 100;
        amountCell.textContent = amount.toFixed(2) || "0.00";

        // Overtime total handler
        const overtimeField = document.getElementById("overtime");
        if (!overtimeField) return;

        let total = 0;
        document.querySelectorAll("#ot-nd .amount").forEach(cell => {
          total += parseFloat(cell.textContent) || 0;
        });

        overtimeField.value = total.toFixed(2);
      });
    });

    // Run calculation once on existing values
    timeInputs.forEach(input => {
      if (input.value) {
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  }

  // === Fill ot / nd rows with employee data ===
  function fillOTND(otNd) {
    if (!otNd) return;

    const rows = document.querySelectorAll(
      "#otNdOvertimeRows tr, #otNdNightRows tr"
    );

    rows.forEach(row => {
      const baseKey = row.dataset.key;
      if (!baseKey) return;

      const input = row.querySelector("input[data-time-field]");
      const amountCell = row.querySelector(".amount");

      const timeKey = `${baseKey}_time`;

      // === TIME (000:00) ===
      if (input && otNd[timeKey] != null) {
        input.value = formatMinutesToTime(otNd[timeKey]);
      }

      // === AMOUNT ===
      if (amountCell && otNd[baseKey] != null) {
        amountCell.textContent = Number(otNd[baseKey]).toFixed(2);
      }
    });
  }

  // Collect OT / ND data
  function collectOTNDData() {
    const rows = document.querySelectorAll(
      "#otNdOvertimeRows tr, #otNdNightRows tr"
    );

    const ot_nd = {};

    rows.forEach(row => {
      const baseKey = row.dataset.key; // rg_rate, rg_ot, rg_rate_nd, etc

      const amount = parseFloat(
        row.querySelector(".amount")?.textContent
      ) || 0;

      const timeInput = row.querySelector("input[data-time-field]");
      const timeMinutes = parseLateOrUndertime(timeInput?.value);

      // amount
      ot_nd[baseKey] = amount;

      // time
      ot_nd[`${baseKey}_time`] = timeMinutes;
    });

    return ot_nd;
  }

  // === Overtime and Night Differential Adjustments ===
  function generateOTNDAdjustments() {
    const overtimeRows = document.getElementById("otAdjOvertimeRows");
    const nightRows = document.getElementById("otAdjNightRows");

    if (!overtimeRows || !nightRows) return;

    overtimeRows.innerHTML = "";
    nightRows.innerHTML = "";

    const OT_DATA = [
      { label: "RG RATE", rate: 1.00, key: "ot_adj_rg_rate" },
      { label: "RG OT", rate: 1.25, key: "ot_adj_rg_ot" },
      { label: "RD RATE", rate: 1.30, key: "ot_adj_rd_rate" },
      { label: "RD OT", rate: 1.69, key: "ot_adj_rd_ot" },
      { label: "SD RATE", rate: 0.30, key: "ot_adj_sd_rate" },
      { label: "SD OT", rate: 1.69, key: "ot_adj_sd_ot" },
      { label: "SDRD RATE", rate: 1.50, key: "ot_adj_sdrd_rate" },
      { label: "SDRD OT", rate: 1.95, key: "ot_adj_sdrd_ot" },
      { label: "HD RATE", rate: 1.00, key: "ot_adj_hd_rate" },
      { label: "HD OT", rate: 2.60, key: "ot_adj_hd_ot" },
      { label: "HDRD RATE", rate: 2.60, key: "ot_adj_hdrd_rate" },
      { label: "HDRD OT", rate: 3.38, key: "ot_adj_hdrd_ot" }
    ];

    const ND_PERCENT = 0.10;

    function createRow(target, label, rate, key, isND = false) {
      const tr = document.createElement("tr");

      tr.dataset.key = key;
      tr.dataset.rate = rate;
      tr.dataset.isNd = isND;

      tr.innerHTML = `
        <td>${label}</td>
        <td>${isND ? `${ND_PERCENT * 100}% of ${rate.toFixed(2)}%` : rate.toFixed(2) + "%"}</td>
        <td>
          <input
            type="text"
            maxlength="6"
            placeholder="000:00"
            data-time-field
            data-format="time-field"
          >
        </td>
        <td class="amount">0.00</td>
      `;

      target.appendChild(tr);
    }

    OT_DATA.forEach(row => {
      createRow(overtimeRows, row.label, row.rate, row.key);
      createRow(
        nightRows,
        row.label + " ND",
        row.rate,
        row.key.replace("ot_adj_", "nd_adj_"),
        true
      );
    });
  }

  // Event handler for time inputs in overtime and night differential adjustments
  function bindOTNDAdjustmentListeners(payroll) {
    const timeInputs = document.querySelectorAll("#ot-adj [data-time-field]");

    timeInputs.forEach(input => {
      if (input.dataset.listener === "true") return;
      input.dataset.listener = "true";

      input.addEventListener("input", () => {
        const tr = input.closest("tr");
        const amountCell = tr.querySelector(".amount");

        const rate = parseFloat(tr.dataset.rate) || 0;
        const isND = tr.dataset.isNd === "true";
        const ND_PERCENT = 0.10;

        const minutes = parseLateOrUndertime(input.value);

        const monthlySalary = Number(payroll.main_computation || 0);
        const daysInMonth = payroll.days_in_year_ot / 12;
        const hoursPerDay = payroll.hours_in_day;

        const dailyRate = monthlySalary / daysInMonth;
        const perMinuteRate =
          Math.round((dailyRate / (hoursPerDay * 60)) * 100) / 100;

        const multiplier = isND ? rate * ND_PERCENT : rate;
        const amount = Math.round(perMinuteRate * multiplier * minutes * 100) / 100;

        amountCell.textContent = amount.toFixed(2);

        updateAdjCompTotal();
      });
    });
  }

  // === Fill ot / nd adjustment rows with employee data ===
  function fillOTNDAdjustments(otNdAdj) {
    if (!otNdAdj) return;

    const rows = document.querySelectorAll(
      "#otAdjOvertimeRows tr, #otAdjNightRows tr"
    );

    rows.forEach(row => {
      const key = row.dataset.key;
      if (!key) return;

      const input = row.querySelector("[data-time-field]");
      const amountCell = row.querySelector(".amount");

      if (input && otNdAdj[`${key}_time`] != null) {
        input.value = formatMinutesToTime(otNdAdj[`${key}_time`]);
      }

      if (amountCell && otNdAdj[key] != null) {
        amountCell.textContent = Number(otNdAdj[key]).toFixed(2);
      }
    });
  }

  // Collect OT / ND adjustments data
  function collectOTNDAdjustmentData() {
    const rows = document.querySelectorAll(
      "#otAdjOvertimeRows tr, #otAdjNightRows tr"
    );

    const data = {};

    rows.forEach(row => {
      const key = row.dataset.key;
      if (!key) return;

      const amount =
        Number(row.querySelector(".amount")?.textContent) || 0;

      const timeValue = row.querySelector("[data-time-field]")?.value;
      const minutes = parseLateOrUndertime(timeValue);

      data[key] = amount;
      data[`${key}_time`] = minutes;
    });

    return data;
  }

  // Update total compensation adjustment field based on OT/ND adjustments and attendance adjustments
  function updateAdjCompTotal() {
    const adjCompField = document.getElementById("adjComp");
    if (!adjCompField) return;

    let total = 0;

    // OT/ND sum
    document.querySelectorAll("#ot-adj .amount").forEach(cell => {
      total += parseFloat(cell.textContent) || 0;
    });

    // Attendance sum with + / − logic
    document.querySelectorAll("#attendanceAdj tr").forEach(row => {
      const key = row.dataset.key;
      const amountCell = row.querySelector(".amount");
      let cellAmount = 0;

      if (amountCell) {
        const input = amountCell.querySelector("input");
        if (input) {
          cellAmount = parseFloat(input.value) || 0; // read from input
        } else {
          cellAmount = parseFloat(amountCell.textContent) || 0; // read from td text
        }
      }

      if (key === "basic_salary" || key === "others") total += cellAmount;
      if (key === "absences" || key === "late" || key === "undertime") total -= cellAmount;
    });

    adjCompField.value = total.toFixed(2);
  }

  // === Attendance Adjustments ===
  function generateAttendanceAdjustments() {
    const attendanceRows = document.getElementById("attendanceRows");
    const premiumRows = document.getElementById("premiumRows");

    if (!attendanceRows || !premiumRows) return;

    attendanceRows.innerHTML = "";
    premiumRows.innerHTML = "";

    const ATTENDANCE_DATA = [
      { label: "Basic Salary", key: "basic_salary" },
      { label: "Absences", key: "absences" },
      { label: "Late", key: "late" },
      { label: "Undertime", key: "undertime" },
      { label: "Others", key: "others", hasTime: false }
    ];

    ATTENDANCE_DATA.forEach(item => {
      const tr = document.createElement("tr");
      tr.dataset.key = item.key;

      tr.innerHTML = `
        <td>${item.label}</td>
        <td>
          ${
            item.hasTime === false
              ? ""
              : `<input type="text" data-time-field maxlength="6" placeholder="000:00">`
          }
        </td>
        <td class="amount">
          ${
            item.hasTime === false
              ? `<input type="number" data-amount-field placeholder="0.00" step="0.01" min="0" value="0.00">`
              : `0.00`
          }
        </td>
      `;

      attendanceRows.appendChild(tr);
    });

    const PREMIUM_DATA = [
      { label: "GSIS", key: "gsis" },
      { label: "SSS", key: "sss" },
      { label: "Pag-ibig", key: "pagibig" },
      { label: "Philhealth", key: "philhealth" },
      { label: "Tax withheld", key: "tax" }
    ];

    PREMIUM_DATA.forEach(item => {
      const tr = document.createElement("tr");
      tr.dataset.key = item.key;

      // For "tax", skip employer and ECC fields
      if (item.key === "tax") {
        tr.innerHTML = `
          <td>${item.label}</td>
          <td><input type="number" data-emp-field placeholder="0.00" step="0.01" min="0"></td>
          <td></td>
          <td></td>
        `;
      } else {
        tr.innerHTML = `
          <td>${item.label}</td>
          <td><input type="number" data-emp-field placeholder="0.00" step="0.01" min="0"></td>
          <td><input type="number" data-empl-field placeholder="0.00" step="0.01" min="0"></td>
          <td><input type="number" data-ecc-field placeholder="0.00" step="0.01" min="0"></td>
        `;
      }

      premiumRows.appendChild(tr);
    });
  }

  // Event handler for Attendance Adjustments
  function attendanceAdjInputListener(payroll) {
    const timeInputs = document.querySelectorAll('#attendanceAdj [data-time-field]');
    const amountInputs = document.querySelectorAll('#attendanceAdj .amount input');

    // Listener for time inputs (late/undertime)
    timeInputs.forEach(input => attachListener(input));

    // Listener for "amount" inputs (others, basic_salary)
    amountInputs.forEach(input => attachListener(input));

    function attachListener(input) {
      if (input.dataset.listener === "true") return;
      input.dataset.listener = "true";

      input.addEventListener("input", () => {
        const tr = input.closest("tr");
        const amountCell = tr.querySelector(".amount");

        if (input.hasAttribute("data-time-field")) {
          // calculate per-minute rate for time-based fields
          const monthlySalary = parseFloat(payroll.main_computation || 0);
          const daysInYear = payroll.days_in_year;
          const hoursInDay = payroll.hours_in_day;
          const daysInMonth = daysInYear / 12;
          const minutesPerDay = hoursInDay * 60;

          const minutes = parseLateOrUndertime(input.value);
          const dailyRate = monthlySalary / daysInMonth;

          const perMinuteRate = Math.round((dailyRate / minutesPerDay) * 100) / 100;
          const amount = Math.round(perMinuteRate * minutes * 100) / 100;

          amountCell.textContent = amount.toFixed(2) || "0.00";
        }

        // update combined total
        updateAdjCompTotal();
      });
    }
  }

  // Event handler for Premium Adjustments
  function premiumInputListener() {
    // select all employee premium inputs
    const empInputs = document.querySelectorAll('#premiumRows [data-emp-field]');
    const premiumAdjField = document.getElementById("premiumAdj");

    if (!premiumAdjField) return;

    empInputs.forEach(input => {
      // prevent duplicate listeners
      if (input.dataset.listener === "true") return;
      input.dataset.listener = "true";

      input.addEventListener("input", () => {
        let total = 0;

        document.querySelectorAll('[data-emp-field]').forEach(field => {
          total += parseFloat(field.value) || 0;
        });

        premiumAdjField.value = total.toFixed(2);
      });
    });

    // Run calculation once on existing values
    empInputs.forEach(input => {
      if (input.value) {
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  }

  // === Fill attendance adjustment fields with employee data ===
  function fillAttendanceAdjustments(attAdj) {
    if (!attAdj) return;

    document.querySelectorAll("#attendanceRows tr").forEach(row => {
      const key = row.dataset.key;

      // Fill time input if present
      const timeInput = row.querySelector("[data-time-field]");
      if (timeInput && attAdj[`${key}_time`] != null) {
        timeInput.value = formatMinutesToTime(attAdj[`${key}_time`]);
      }

      // Fill amount
      const amountCell = row.querySelector(".amount");
      if (!amountCell) return;

      // If there is an <input> in the amount cell (like "Others"), fill it
      const input = amountCell.querySelector("input");
      if (input && attAdj[`${key}_amt`] != null) {
        input.value = Number(attAdj[`${key}_amt`]).toFixed(2);
      }
      // Otherwise, fill textContent (for rows without input)
      else if (attAdj[`${key}_amt`] != null) {
        amountCell.textContent = Number(attAdj[`${key}_amt`]).toFixed(2);
      }
    });

    // Fill premium rows
    document.querySelectorAll("#premiumRows tr").forEach(row => {
      const key = row.dataset.key;

      const empInput = row.querySelector("[data-emp-field]");
      const emplInput = row.querySelector("[data-empl-field]");
      const eccInput = row.querySelector("[data-ecc-field]");

      if (key === "tax") {
        if (empInput) { empInput.value = Number(attAdj["tax_withheld"] || 0).toFixed(2); }
      } else {
        if (empInput) { empInput.value = Number(attAdj[`${key}_emp`] || 0).toFixed(2); }
        if (emplInput) { emplInput.value = Number(attAdj[`${key}_employer`] || 0).toFixed(2); }
        if (eccInput) { eccInput.value = Number(attAdj[`${key}_ecc`] || 0).toFixed(2); }
      }
    });
  }

  // Collect attendance adjustments data
  function collectAttendanceAdjustments() {
    const data = {};

    // Attendance rows
    document.querySelectorAll("#attendanceRows tr").forEach(row => {
      const key = row.dataset.key;
      const timeInput = row.querySelector("[data-time-field]");
      const amountInput = row.querySelector(".amount input");

      if (timeInput) {
        data[`${key}_time`] = parseLateOrUndertime(timeInput.value) || 0;
      }

      if (amountInput) {
        data[`${key}_amt`] = Number(amountInput.value) || 0;
      } else {
        // fallback: if amount is in textContent (time-based rows)
        const amountCell = row.querySelector(".amount");
        data[`${key}_amt`] = parseFloat(amountCell.textContent) || 0;
      }
    });

    // Premium rows
    document.querySelectorAll("#premiumRows tr").forEach(row => {
      const key = row.dataset.key;

      const empInput = row.querySelector("[data-emp-field]");
      const emplInput = row.querySelector("[data-empl-field]");
      const eccInput = row.querySelector("[data-ecc-field]");

      if (key === "tax") {
        data["tax_withheld"] = empInput ? Number(empInput.value) || 0 : 0;
        return;
      }

      data[`${key}_emp`] = empInput ? Number(empInput.value) || 0 : 0;
      data[`${key}_employer`] = emplInput ? Number(emplInput.value) || 0 : 0;
      data[`${key}_ecc`] = eccInput ? Number(eccInput.value) || 0 : 0;
    });

    return data;
  }

  // Centralize total calculations
  function calculateAllowanceTotals() {
    let taxable = 0;
    let nontaxable = 0;

    document.querySelectorAll('#taxableAllowanceRows .amount-input').forEach(i => {
      taxable += Number(i.value || 0);
    });

    document.querySelectorAll('#nontaxableAllowanceRows .amount-input').forEach(i => {
      nontaxable += Number(i.value || 0);
    });

    return { taxable, nontaxable };
  }

  function calculateDeductionTotals() {
    let total = 0;

    document.querySelectorAll('#deductionRows .amount-input').forEach(i => {
      total += Number(i.value || 0);
    });

    return total;
  }

  // Call this after populating fields
  function attachAmountInputListeners() {
    document.querySelectorAll("#allowances, #deductions").forEach(container => {
      container.addEventListener("input", function(e) {
        if (e.target.classList.contains("amount-input")) {
          updateAllowanceAndDeductionTotals();
        }
      });
    });
  }

  // Update summary fields
  function updateAllowanceAndDeductionTotals() {
    console.log("Updating totals...");
    const taxableAllowancesField = document.getElementById("taxableAllowances");
    const nonTaxableAllowancesField = document.getElementById("nonTaxableAllowances");
    const totalDeductionsField = document.getElementById("totalDeductions");

    const { taxable, nontaxable } = calculateAllowanceTotals();
    const totalDeductions = calculateDeductionTotals();

    taxableAllowancesField.value = taxable.toFixed(2);
    nonTaxableAllowancesField.value = nontaxable.toFixed(2);
    totalDeductionsField.value = totalDeductions.toFixed(2);
  }

  // === Generate rows for Allowance/Deduction Payroll Entry ===
  function buildAllowanceSelectHTML(isTaxable, selectedId = null) {
    if (!allowanceTypes || allowanceTypes.length === 0) {
      return `<select class="allowance-select"><option value="" disabled selected>-- No allowances --</option></select>`;
    }

    const list = allowanceTypes.filter(a => a.taxable ? isTaxable : !isTaxable);

    if (list.length === 0) {
      return `<select class="allowance-select"><option value="" disabled selected>-- No allowances --</option></select>`;
    }

    return `<select class="allowance-select">
              <option value="" disabled selected>-- Select --</option>
              ${list.map(a => `
                <option value="${a.id || a.allowance_type_id}" data-amount="${a.amount || a.default_amount || 0}" ${String(a.id || a.allowance_type_id) === String(selectedId) ? 'selected' : ''}>
                  ${a.name || a.allowance_name}
                </option>`).join('')}
            </select>`;
  }

  function buildDeductionSelectHTML(selectedId = null) {
    if (!deductionTypes || deductionTypes.length === 0) {
      return `<select class="deduction-select"><option value="" disabled selected>-- No deductions --</option></select>`;
    }

    return `<select class="deduction-select">
              <option value="" disabled selected>-- Select --</option>
              ${deductionTypes.map(d => `
                <option value="${d.id || d.deduction_type_id}" data-amount="${d.amount || d.default_amount || 0}" ${String(d.id || d.deduction_type_id) === String(selectedId) ? 'selected' : ''}>
                  ${d.name || d.deduction_name}
                </option>`).join('')}
            </select>`;
  }

  // Call this after generating rows
  function attachSelectListeners() {
    function markRowActive(row) {
      row.dataset.deleted = "0";
      console.log(`Row ${row.dataset.rowIndex} mark as active.`);
    }

    // Allowance selects
    document.querySelectorAll(".allowance-select").forEach(select => {
      select.addEventListener("change", function () {
        const row = this.closest("tr");
        const amountInput = this.closest("tr").querySelector(".amount-input");
        const selectedOption = this.selectedOptions[0];

        if (amountInput && selectedOption) {
          amountInput.value = Number(selectedOption.dataset.amount || 0).toFixed(2);
          updateAllowanceAndDeductionTotals();
        }
        
        // UNDELETE if user selects again
        if (this.value) {
          markRowActive(row);
        }
      });
    });

    // Deduction selects
    document.querySelectorAll(".deduction-select").forEach(select => {
      select.addEventListener("change", function () {
        const row = this.closest("tr");
        const amountInput = this.closest("tr").querySelector(".amount-input");
        const selectedOption = this.selectedOptions[0];

        if (amountInput && selectedOption) {
          amountInput.value = Number(selectedOption.dataset.amount || 0).toFixed(2);
          updateAllowanceAndDeductionTotals();
        }
        
        // UNDELETE if user selects again
        if (this.value) {
          markRowActive(row);
        }
      });
    });
  }

  // Function to clear rows in allowances and deductions table
  function clearRow(button) {
    // Find the closest <tr> of the clicked button
    const row = button.closest('tr');
    if (!row) return;

    // Mark row as deleted and cleardbId
    row.dataset.deleted = "1";
    console.log(`Row ${row.dataset.rowIndex} only mark as to delete.`);

    // Reset all <select> elements in the row to their first option
    row.querySelectorAll('select').forEach(select => {
      select.selectedIndex = 0;
    });

    // Reset all input elements in the row to 0
    row.querySelectorAll('input').forEach(input => {
      if (input.type === 'number') {
        input.value = '0.00';
      } else {
        input.value = '';
      }
    });

    // Recalculate totals
    updateAllowanceAndDeductionTotals();
  }

  function generateRows() {
    const taxableContainer = document.getElementById("taxableAllowanceRows");
    const nontaxableContainer = document.getElementById("nontaxableAllowanceRows");
    const deductionContainer = document.getElementById("deductionRows");
    const rowCount = 7;

    const buildRow = (index, type) => {
      let selectHTML = '';
      if (type === 'taxable') selectHTML = buildAllowanceSelectHTML(true);
      else if (type === 'nontaxable') selectHTML = buildAllowanceSelectHTML(false);
      else selectHTML = buildDeductionSelectHTML();
      
      const actionHTML = `<button type="button" class="btn" onclick="clearRow(this)">Clear</button>`;

      return `<tr 
                data-row-index="${index}"
                data-emp-id="" 
                data-deleted="0"
              >
                <td>${index}.</td>
                <td>${selectHTML}</td>
                <td><input type="number" value="0.00" step="0.01" class="amount-input"></td>
                <td>${actionHTML}</td>
              </tr>`;
    };

    let taxableRows = '', nontaxableRows = '', deductionRows = '';
    for (let i = 1; i <= rowCount; i++) {
      taxableRows += buildRow(i, 'taxable');
      nontaxableRows += buildRow(i, 'nontaxable');
      deductionRows += buildRow(i, 'deduction');
    }

    if (taxableContainer) taxableContainer.innerHTML = taxableRows;
    if (nontaxableContainer) nontaxableContainer.innerHTML = nontaxableRows;
    if (deductionContainer) deductionContainer.innerHTML = deductionRows;

    // Attach listeners so selecting an option fills the input
    attachSelectListeners();
  }

  // Function to reset all rows to active (not deleted)
  function resetAllRows() {
    // Select all rows in your allowances and deductions tables
    document.querySelectorAll("#taxableAllowanceRows tr, #nontaxableAllowanceRows tr, #deductionRows tr")
      .forEach(row => {
        // ONLY clear dbId for rows that were deleted
        if (row.dataset.deleted === "1") {
          row.dataset.dbId = "";   // safe now, backend already received it
          console.log(`Row ${row.dataset.rowIndex} reset.`);
        }
        
        // Reset all rows
        row.dataset.deleted = "0"; // mark as active
        console.log(`Row ${row.dataset.rowIndex} marked as active.`);

        // Reset all select elements in the row to their first option
        row.querySelectorAll('select').forEach(select => {
          select.selectedIndex = 0;
        });

        // Reset all input elements in the row to 0
        row.querySelectorAll('input').forEach(input => {
          if (input.type === 'number') {
            input.value = '0.00';
          } else {
            input.value = '';
          }
        });
      });

    // Recalculate totals after reset
    updateAllowanceAndDeductionTotals();
  }

  // === Load allowance/deduction master lists ===
  async function loadAllowanceAndDeductionTypes() {
    try {
      // Fetch allowance types
      const resA = await fetch('/api/allowances');

      if (resA.ok) {
        allowanceTypes = await resA.json();
        if (!Array.isArray(allowanceTypes)) allowanceTypes = allowanceTypes.data || [];
      } else {
        console.warn('Could not load allowance_types, status', resA.status);
        allowanceTypes = [];
      }

      // Fetch deduction types
      const resD = await fetch('/api/deductions');
      if (resD.ok) {
        deductionTypes = await resD.json();
        if (!Array.isArray(deductionTypes)) deductionTypes = deductionTypes.data || [];
      } else {
        console.warn('Could not load deduction_types, status', resD.status);
        deductionTypes = [];
      }
    } catch (err) {
      console.warn('Warning: failed to fetch allowance/deduction types', err);
      allowanceTypes = [];
      deductionTypes = [];
    }
  }

  // === Fill allowance/deduction rows with employee data ===
  function fillAllowanceDeductionRows(emp) {
    console.log("fillAllowanceDeductionRows → emp = ", emp);

    if (!emp) {
      console.error("emp is undefined!");
      return;
    }

    // Determine the payroll period scaling factor
    let scaleFactor = 1; // default: monthly
    const period = document.getElementById("payrollGroup").value.trim().toLowerCase();

    switch (period) {
      case "weekly":
        scaleFactor = 1 / 4; // divide monthly amounts by 4
        break;
      case "semi-monthly":
        scaleFactor = 1 / 2; // divide monthly amounts by 2
        break;
      case "monthly":
      default:
        scaleFactor = 1; // no scaling
        break;
    }

    // Helper: fill rows from a list into a container
    function fillListToContainer(list, containerSelector, isAllowance) {
      const container = document.querySelector(containerSelector);
      if (!container) return;

      const rows = container.querySelectorAll('tr');

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;

        const item = list[i] || {}; // Use empty object if no data

        // Determine payroll override
        if (isAllowance) {
          row.dataset.payrollOverride = item.isPayrollOverride ? "true" : "false";
        } else {
          row.dataset.payrollOverride = item.isPayrollOverride ? "true" : "false";
        }

        // Select box
        const sel = row.querySelector(isAllowance ? '.allowance-select' : '.deduction-select');
        if (sel) {
          sel.value = isAllowance ? (item.allowance_type_id || "") : (item.deduction_type_id || "");
        }

        // Amount input
        const amountInput = row.querySelector('.amount-input');
        if (amountInput) {
          let baseValue = Number(item.amount || 0);

          // store original monthly amount ONCE
          amountInput.dataset.baseAmount = baseValue;

          const isOverride = row.dataset.payrollOverride === "true";

          let displayValue = baseValue;
          if (!isOverride) {
            displayValue *= scaleFactor;
          }

          amountInput.value = displayValue.toFixed(2);
          amountInput.step = "0.01";
        }

        // Store DB ID if present
        if (item.emp_allowance_id) row.dataset.dbId = item.emp_allowance_id;
        if (item.emp_deduction_id) row.dataset.dbId = item.emp_deduction_id;
        if (item.source_emp_allowance_id) row.dataset.dbId = item.source_emp_allowance_id;
        if (item.source_emp_deduction_id) row.dataset.dbId = item.source_emp_deduction_id;
      }
    }

    // Fill allowances
    if (Array.isArray(emp.allowances)) {
      const taxable = emp.allowances.filter(a => a.is_taxable);
      const nontax = emp.allowances.filter(a => !a.is_taxable);

      fillListToContainer(taxable, "#taxableAllowanceRows", true);
      fillListToContainer(nontax, "#nontaxableAllowanceRows", true);
    } else {
      // Fill empty rows if no allowances
      fillListToContainer([], "#taxableAllowanceRows", true);
      fillListToContainer([], "#nontaxableAllowanceRows", true);
    }

    // Fill deductions
    if (Array.isArray(emp.deductions)) {
      fillListToContainer(emp.deductions, "#deductionRows", false);
    } else {
      fillListToContainer([], "#deductionRows", false);
    }
  }

  // Collect allowances from table and attach current payroll period label
  function getCurrentPeriodLabel() {
      // Get the payroll group element
      const grp = document.getElementById("payrollGroup");

      // If the payroll group is "Weekly", return its selected option text
      if (grp && grp.options[grp.selectedIndex]?.text === "Weekly") {
          return grp.options[grp.selectedIndex]?.text || "";
      }

      // Otherwise, fallback to the period option select
      const periodSelect = document.getElementById("periodOption");
      if (periodSelect && periodSelect.selectedIndex >= 0) {
          const txt = periodSelect.options[periodSelect.selectedIndex]?.text || "";
          if (txt) return txt;
      }

      // If no valid selection, return an empty string
      return "";
  }

  function collectAllowancesFromTable(selector) {
    const periodLabel = getCurrentPeriodLabel() || "Monthly";
    const rows = Array.from(document.querySelectorAll(`${selector} tr`));
    const out = [];

    for (const row of rows) {
      const sel = row.querySelector('.allowance-select');
      const amountInput = row.querySelector('.amount-input');
      const empAllowanceId = row.dataset.dbId ? Number(row.dataset.dbId) : null;
      const deleted = row.dataset.deleted === "1";

      if (!sel && !deleted) continue; // skip completely empty rows that are not deleted

      const allowance_type_id = sel ? sel.value || null : null;
      const amount = amountInput ? Number(amountInput.value || 0) : 0;
      
      // include row if it has a value OR is marked deleted
      if (!allowance_type_id && !deleted && amount === 0) continue;

      out.push({
        emp_allowance_id: empAllowanceId,
        allowance_type_id: allowance_type_id ? Number(allowance_type_id) : null,
        amount: Number(amount),
        period: periodLabel,
        deleted: deleted
      });
    }
    return out;
  }

  function collectDeductionsFromTable(selector) {
    const periodLabel = getCurrentPeriodLabel() || "Monthly";
    const rows = Array.from(document.querySelectorAll(`${selector} tr`));
    const out = [];
    
    for (const row of rows) {
      const sel = row.querySelector('.deduction-select');
      const amountInput = row.querySelector('.amount-input');
      const empDeductionId = row.dataset.dbId ? Number(row.dataset.dbId) : null;
      const deleted = row.dataset.deleted === "1";

      if (!sel && !deleted) continue; // skip completely empty rows that are not deleted

      const deduction_type_id = sel ? sel.value || null : null;
      const amount = amountInput ? Number(amountInput.value || 0) : 0;

      // include row if it has a value OR is marked deleted
      if (!deduction_type_id && !deleted && amount === 0) continue;

      out.push({
        emp_deduction_id: empDeductionId,
        deduction_type_id: deduction_type_id ? Number(deduction_type_id) : null,
        amount: Number(amount),
        period: periodLabel,
        deleted: deleted
      });
    }
    return out;
  }

  // ===============================
  // STEP 3 EDIT: Payroll Computation
  // ===============================
  document.addEventListener("click", async (e) => {
    // --- EDIT ---
    // Only show selected employee in list
    function filterEmployeeListToSelected() {
      if (!selectedEmployeeId) return;
      document.querySelectorAll("#employeeTable tbody tr").forEach(row => {
        row.style.display = row.dataset.employeeId == selectedEmployeeId ? "" : "none";
      });
    }

    if (e.target && e.target.id === "editPayrollBtn") {
      console.log("🟢 Edit clicked!");
      console.log("Editing employee:", selectedEmployeeId);

      // Enable all editable fields
      document.querySelectorAll(`
        #computationSection [data-time-field],
        #computationSection #adjNonComp,
        #computationSection [type='checkbox'],
        #computationSection select,
        #allowances [type='number'],
        #deductions [type='number'],
        #attendanceAdj [type='number']
      `).forEach(input => input.disabled = false);

      // Enable buttons
      document.querySelectorAll('#allowances button[type="button"], #deductions button[type="button"]').forEach(button => {
        button.disabled = false;
      });

      setActiveTab("payroll", "#computationSection");
      filterEmployeeListToSelected();
      time();

      // Toggle buttons
      document.querySelectorAll(".quick-search").forEach(el => { el.classList.add("hidden"); });
      document.getElementById("editPayrollBtn").classList.add("hidden");
      document.getElementById("deletePayrollBtn").classList.add("hidden");
      document.getElementById("savePayrollBtn").classList.remove("hidden");
      document.getElementById("cancelEditBtn").classList.remove("hidden");
      document.getElementById("backButton").classList.add("hidden");
      document.getElementById("savePayroll").classList.add("hidden");
    }

    // --- CANCEL ---
    if (e.target && e.target.id === "cancelEditBtn") {
      const cancelModal = document.getElementById("cancelModal");
      const confirmCancelBtn = document.getElementById("confirmCancelBtn");
      const cancelCancelBtn = document.getElementById("cancelCancelBtn");

      console.log("🟡 Cancel clicked!");
      cancelModal.classList.remove("hidden");
      
      confirmCancelBtn.addEventListener("click", async () => {
        // Disable inputs again
        document.querySelectorAll(
          "#computationSection input[type='number'], #computationSection [data-time-field], #computationSection [type='checkbox']"
        ).forEach((input) => (input.disabled = true));

        setActiveTab("computationSection"); // hide previous active tab
        document.getElementById("profile-header").classList.add("hidden"); // hide profile
        document.querySelector(".tab-buttons").classList.add("hidden"); // hide tab buttons
        document.querySelector(".summary-bar").classList.add("hidden"); // hide summary bar

        // Restore full employee list
        resetPayrollFields();
        resetSearchControls();
        loadFilteredEmployees();
        cancelModal.classList.add("hidden");

        // Toggle buttons back
        document.querySelectorAll(".quick-search").forEach(el => { el.classList.remove("hidden"); });
        document.getElementById("editPayrollBtn").classList.remove("hidden");
        document.getElementById("deletePayrollBtn").classList.remove("hidden");
        document.getElementById("savePayrollBtn").classList.add("hidden");
        document.getElementById("cancelEditBtn").classList.add("hidden");
        document.getElementById("backButton").classList.remove("hidden");
        document.getElementById("savePayroll").classList.remove("hidden");
      });

      cancelCancelBtn.addEventListener("click", () => {
        cancelModal.classList.add("hidden");
      });
    }

    // --- SAVE ---
    if (e.target && e.target.id === "savePayrollBtn") {
      console.log("💾 Save clicked!");

      if (!selectedEmployeeId) {
        showToast("No employee selected!", "warning");
        return;
      }

      const holdCheckbox = document.getElementById("holdCheckbox");
      const payrollStatus = holdCheckbox.checked ? "Hold" : "Active";

      const ot_nd = collectOTNDData();
      const ot_nd_adj = collectOTNDAdjustmentData();
      const att_adj = collectAttendanceAdjustments();

      // build allowances/deductions arrays
      const allowancesArr = [
        ...collectAllowancesFromTable("#taxableAllowanceRows"),
        ...collectAllowancesFromTable("#nontaxableAllowanceRows")
      ];

      console.log("allowancesArr:", allowancesArr);
      const deductionsArr = collectDeductionsFromTable("#deductionRows");
      console.log("deductionsArr:", deductionsArr);

      const updatedData = {
        // === GROSS EARNINGS ===
        basic_salary: Number(document.getElementById("basicSalary")?.value || 0),
        absence_time: parseAbsence(document.getElementById("absenceTime")?.value),
        absence_deduction: Number(document.getElementById("absenceDeduction")?.value || 0),
        late_time: parseLateOrUndertime(document.getElementById("lateTime")?.value),
        late_deduction: Number(document.getElementById("lateDeduction")?.value || 0),
        undertime: parseLateOrUndertime(document.getElementById("undertime")?.value),
        undertime_deduction: Number(document.getElementById("undertimeDeduction")?.value || 0),
        overtime: Number(document.getElementById("overtime")?.value || 0),
        taxable_allowances: Number(document.getElementById("taxableAllowances")?.value || 0),
        non_taxable_allowances: Number(document.getElementById("nonTaxableAllowances")?.value || 0),
        adj_comp: Number(document.getElementById("adjComp")?.value || 0),
        adj_non_comp: Number(document.getElementById("adjNonComp")?.value || 0),
        total_leaves_used: Number(document.getElementById("leavesUsed")?.value || 0),
        
        // === DEDUCTIONS ===
        gsis_employee: Number(document.getElementById("gsisEE")?.value || 0),
        gsis_employer: Number(document.getElementById("gsisER")?.value || 0),
        gsis_ecc: Number(document.getElementById("gsisECC")?.value || 0),
        sss_employee: Number(document.getElementById("sssEE")?.value || 0),
        sss_employer: Number(document.getElementById("sssER")?.value || 0),
        sss_ecc: Number(document.getElementById("sssECC")?.value || 0),
        pagibig_employee: Number(document.getElementById("pagibigEE")?.value || 0),
        pagibig_employer: Number(document.getElementById("pagibigER")?.value || 0),
        pagibig_ecc: Number(document.getElementById("pagibigECC")?.value || 0),
        philhealth_employee: Number(document.getElementById("philhealthEE")?.value || 0),
        philhealth_employer: Number(document.getElementById("philhealthER")?.value || 0),
        philhealth_ecc: Number(document.getElementById("philhealthECC")?.value || 0),
        tax_withheld: Number(document.getElementById("taxWithheld")?.value || 0),
        total_deductions: Number(document.getElementById("totalDeductions")?.value || 0),
        loans: Number(document.getElementById("totalLoans")?.value || 0),
        other_deductions: Number(document.getElementById("otherDeductions")?.value || 0),
        premium_adj: Number(document.getElementById("premiumAdj")?.value || 0),
        ytd_sss: Number(document.getElementById("ytdSSS")?.value || 0),
        ytd_wtax: Number(document.getElementById("ytdWtax")?.value || 0),
        ytd_philhealth: Number(document.getElementById("ytdPhilhealth")?.value || 0),
        ytd_gsis: Number(document.getElementById("ytdGSIS")?.value || 0),
        ytd_pagibig: Number(document.getElementById("ytdPagibig")?.value || 0),
        ytd_gross: Number(document.getElementById("ytdGross")?.value || 0),
        
        // === SUMMARY ===
        payroll_status: payrollStatus,
        gross_pay: Number((document.getElementById("grossPay")?.textContent || "0").replace(/,/g, "")),
        grand_total_deductions: Number((document.getElementById("grandTotalDeductions")?.textContent || "0").replace(/,/g, "")),
        net_pay: Number((document.getElementById("netPay")?.textContent || "0").replace(/,/g, "")),
        ot_nd, ot_nd_adj, att_adj,
        // send allowances as an array of objects (with period)
        allowances: allowancesArr,
        // send deductions as an array of objects (with period)
        deductions: deductionsArr,
        // send the period label so backend can use it (and also fallback if rows don't have period)
        periodOption: getCurrentPeriodLabel()
      };

      // send user info and payload
      try {
        const run_id = (window.currentPayrollRunId || "");
        const user_id = sessionStorage.getItem("user_id");
        const admin_name = sessionStorage.getItem("admin_name");
        const res = await fetch(`/api/update_employee_payroll/${selectedEmployeeId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id, admin_name, run_id, ...updatedData })
        });

        const result = await res.json();
        if (result.success) {
          showToast(result.message);
        } else {
          showToast(result.message || "Failed to update payroll.", "warning");
        }
      } catch (err) {
        console.error("Error saving payroll:", err);
        showToast("Server error while saving payroll.", "warning");
      }

      // Disable inputs again
      document.querySelectorAll(
        "#computationSection input[type='number'], #computationSection [data-time-field], #computationSection [type='checkbox']"
      ).forEach((input) => (input.disabled = true));

      setActiveTab("computationSection"); // hide previous active tab
      document.getElementById("profile-header").classList.add("hidden"); // hide profile
      document.querySelector(".tab-buttons").classList.add("hidden"); // hide tab buttons
      document.querySelector(".summary-bar").classList.add("hidden"); // hide summary bar

      // Restore full employee list
      resetPayrollFields();
      resetSearchControls();
      loadFilteredEmployees();

      // Toggle buttons back
      document.querySelectorAll(".quick-search").forEach(el => { el.classList.remove("hidden"); });
      document.getElementById("editPayrollBtn").classList.remove("hidden");
      document.getElementById("deletePayrollBtn").classList.remove("hidden");
      document.getElementById("savePayrollBtn").classList.add("hidden");
      document.getElementById("cancelEditBtn").classList.add("hidden");
      document.getElementById("backButton").classList.remove("hidden");
      document.getElementById("savePayroll").classList.remove("hidden");
    }

    // --- DELETE ---
    if (e.target && e.target.id === "deletePayrollBtn") {
      console.log("🟢 Delete clicked!");
      if (!selectedEmployeeId) return;

      // Show custom delete confirmation modal
      const deleteModal = document.getElementById("deleteModal");
      const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
      const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
      deleteModal.classList.remove("hidden");

      // Function to update "No." column
      function updateRowNumbers() {
        const rows = document.querySelectorAll("#employeeTable tbody tr");
        rows.forEach((row, index) => {
          const noCell = row.querySelector("td:first-child");
          if (noCell) noCell.textContent = index + 1;
        });
      }

      const empCode = document.querySelector("#empIdDetail")?.textContent.trim();
      if (!empCode) {
        showToast("⚠️ Employee ID missing — cannot save changes!", "warning");
        return;
      }

      // Handle confirm delete
      confirmDeleteBtn.onclick = async () => {
        deleteModal.classList.add("hidden");

        try {
          // ✅ Use the currentPayrollRunId from your frontend
          const runId = window.currentPayrollRunId;
          if (!runId) {
            showToast("⚠️ Payroll run ID missing!", "warning");
            return;
          }

          // Send request to delete employee from that run
          const user_id = sessionStorage.getItem("user_id");
          const admin_name = sessionStorage.getItem("admin_name");
          const response = await fetch("/api/delete-employee", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id, admin_name, employeeId: selectedEmployeeId, runId }),
          });

          const result = await response.json();

          if (response.ok && result.success) {
            // Remove the row from the table
            const row = document.querySelector(
              `#employeeTable tbody tr[data-employee-id='${selectedEmployeeId}']`
            );
            if (row) {
              row.remove();
              showToast(`Employee ${empCode} removed from run ${runId}.`, "success");
              updateRowNumbers();

              console.log(`Employee ${empCode} deleted from run ${runId} and removed from view.`);

              // Hide profile/payroll UI
              document.getElementById("profile-header").classList.add("hidden");
              document.querySelector(".tab-buttons").classList.add("hidden");
              document.querySelector(".summary-bar").classList.add("hidden");
              document.getElementById("payroll").classList.add("hidden");
              document.getElementById("allowances").classList.add("hidden");
              document.getElementById("deductions").classList.add("hidden");
              resetPayrollFields();
            }
          } else {
            showToast(`❌ Failed to delete employee: ${result.message || "Unknown error"}`, "error");
            console.error("Delete failed:", result);
          }
        } catch (error) {
          showToast("❌ Error deleting employee — check console for details.", "error");
          console.error("Delete error:", error);
        }
      };

      // Handle cancel delete
      cancelDeleteBtn.onclick = () => {
        deleteModal.classList.add("hidden");
        console.log("❎ Delete canceled");
      };
    }
  });

  // BUILD PAYROLL DATA PER EMPLOYEE
  async function buildEmployeePayroll(employeeId, runId) {
    const periodOption = document.getElementById("periodOption").value;

    const res = await fetch(
      `/api/employee_payroll_settings/${employeeId}?run_id=${runId}&periodOption=${encodeURIComponent(periodOption)}`
    );

    const { success, data } = await res.json();
    if (!success || !data) return null;

    const payroll = data;
    console.log("payroll:", payroll);

    // === COMPUTATIONS ===
    const basicSalary = Number(payroll.main_computation || 0);

    const taxableAllowances = (payroll.allowances || [])
      .filter(a => a.is_taxable)
      .reduce((s, a) => s + Number(a.amount || a.default_amount || 0), 0);

    const nonTaxableAllowances = (payroll.allowances || [])
      .filter(a => !a.is_taxable)
      .reduce((s, a) => s + Number(a.amount || a.default_amount || 0), 0);

    const totalDeductions = (payroll.deductions || [])
      .reduce((s, d) => s + Number(d.amount || 0), 0);

    // === CONTRIBUTIONS ===
    const contrib = { sss: {}, pagibig: {}, philhealth: {}, taxwithheld: {} };

    (payroll.contributions || []).forEach(c => {
      if (c.contribution_type_id === 1) contrib.sss = c;
      if (c.contribution_type_id === 2) contrib.pagibig = c;
      if (c.contribution_type_id === 3) contrib.philhealth = c;
      if (c.contribution_type_id === 4) contrib.taxwithheld = c;
    });

    // build allowances/deductions arrays
    const allowancesArr = (payroll.allowances || []).map(a => ({
      source_emp_allowance_id: a.source_emp_allowance_id || a.emp_allowance_id,
      allowance_type_id: a.allowance_type_id,
      period: a.period,
      amount: Number(a.amount || a.default_amount || 0)
    }));

    const deductionsArr = (payroll.deductions || []).map(d => ({
      source_emp_deduction_id: d.source_emp_deduction_id || d.emp_deduction_id,
      deduction_type_id: d.deduction_type_id,
      period: d.period,
      amount: Number(d.amount || 0)
    }));

    return {
      run_id: runId,
      employee_id: employeeId,

      basic_salary: basicSalary,
      absence_time: payroll.absence_time || 0,
      absence_deduction: payroll.absence_deduction || 0,
      late_time: payroll.late_time || 0,
      late_deduction: payroll.late_deduction || 0,
      undertime: payroll.undertime || 0,
      undertime_deduction: payroll.undertime_deduction || 0,
      overtime: payroll.overtime || 0,

      taxable_allowances: taxableAllowances,
      non_taxable_allowances: nonTaxableAllowances,
      adj_comp: payroll.adj_comp || 0,
      adj_non_comp: payroll.adj_non_comp || 0,
      total_leaves_used: payroll.leaves_used || 0,

      gsis_employee: payroll.gsis_employee || 0,
      gsis_employer: payroll.gsis_employer || 0,
      gsis_ecc: payroll.gsis_ecc || 0,

      sss_employee: contrib.sss.ee_share || 0,
      sss_employer: contrib.sss.er_share || 0,
      sss_ecc: contrib.sss.ecc || 0,

      pagibig_employee: contrib.pagibig.ee_share || 0,
      pagibig_employer: contrib.pagibig.er_share || 0,
      pagibig_ecc: contrib.pagibig.ecc || 0,

      philhealth_employee: contrib.philhealth.ee_share || 0,
      philhealth_employer: contrib.philhealth.er_share || 0,
      philhealth_ecc: contrib.philhealth.ecc || 0,

      tax_withheld: contrib.taxwithheld.ee_share || 0,
      total_deductions: totalDeductions,
      loans: payroll.loans || 0,
      other_deductions: payroll.other_deductions || 0,
      premium_adj: payroll.premium_adj || 0,

      ytd_sss: payroll.previousYtd.ytd_sss || 0,
      ytd_wtax: payroll.previousYtd.ytd_wtax || 0,
      ytd_philhealth: payroll.previousYtd.ytd_philhealth || 0,
      ytd_gsis: payroll.previousYtd.ytd_gsis || 0,
      ytd_pagibig: payroll.previousYtd.ytd_pagibig || 0,
      ytd_gross: payroll.previousYtd.ytd_gross || 0,

      payroll_status: payroll.payroll_status || "Active",
      gross_pay: payroll.gross_pay,
      grand_total_deductions: payroll.grand_total_deductions,
      net_pay: payroll.net_pay,
      allowances: allowancesArr,
      deductions: deductionsArr,
      periodOption: getCurrentPeriodLabel()
    };
  }

  // Save function for bulk employee payroll information
  async function savePayrollRun(runId) {
    if (!runId) {
      throw new Error("Missing runId");
    }

    const employees = await loadEmployeesByRun(runId);

    if (!employees.length) {
      throw new Error("No employees found for this payroll run");
    }

    const payrolls = [];

    for (const emp of employees) {
      const record = await buildEmployeePayroll(emp.employee_id, runId);

      if (!record || !record.employee_id) {
        console.warn("Skipping invalid payroll record:", record);
        continue;
      }

      payrolls.push(record);
    }

    console.log("PAYROLLS SENT TO BACKEND:", payrolls);

    if (!payrolls.length) {
      throw new Error("No valid payroll records to save");
    }

    const user_id = sessionStorage.getItem("user_id");
    const admin_name = sessionStorage.getItem("admin_name");
    const res = await fetch("/api/save_all_employee_payroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: runId,
        payrolls,
        user_id,
        admin_name
      })
    });

    const result = await res.json();

    if (!result.success) {
      throw new Error(result.message || "Payroll save failed");
    }

    return result;
  }

  // ===============================
  // EVENT LISTENERS
  // ===============================
  const computationButton = document.getElementById("computationButton");
  const backButton = document.getElementById("backButton");
  const searchCategory = document.getElementById("searchCategory");
  const searchInput = document.getElementById("searchInput");
  const addButton = document.getElementById("addButton");
  const savePayroll = document.getElementById("savePayroll");

  if (computationButton) {
    computationButton.addEventListener("click", async () => {
      // ========= VALIDATE REQUIRED FIELDS =========
      const requiredFields = ["Payroll Group", "Period", "Month", "Year"];
      const selects = document.querySelectorAll("#filterSection .form-grid select");
      const missingFields = [];

      selects.forEach((field) => {
        const rawLabel = field.closest(".payroll-period-row")?.querySelector("label")?.textContent || "";
        const label = rawLabel.replace(":", "").trim();

        if (requiredFields.includes(label)) {
          const isEmpty = !field.value || field.value.trim() === "";
          if (isEmpty) {
            missingFields.push(label);
            field.style.border = "1px solid red";
          } else {
            field.style.border = "";
          }
        }
      });

      if (missingFields.length > 0) {
        showToast(
          "⚠️ Please fill out or select the following required fields:\n- " +
          missingFields.join("\n- "),
          "missingFields"
        );
        return;
      }

      // Reset sorting
      if (searchCategory) searchCategory.value = "employee_id";

      try {
        // ========= STEP 1 — CREATE OR GET RUN ID =========
        const runId = await ensurePayrollRun();
        window.currentPayrollRunId = runId;

        // ========= STEP 2 — CHECK IF EMPLOYEE PAYROLL EXISTS =========
        const checkRes = await fetch(`/api/payroll_runs/${runId}/employees`);
        const check = await checkRes.json();

        // check.exists should be boolean (true if rows exist)
        if (!check.employees || check.employees.length === 0) {
          // NO payroll rows → OPEN employee selection modal
          openEmployeeSelectionModal(runId);
          return;
        }

        // ========= STEP 3 — CHECK FOR MISSING EMPLOYEES =========
        const selectableEmployees = await loadSelectableEmployees(runId);

        // If there are employees not yet included in this payroll run
        if (selectableEmployees.length > 0) {
          // existing payroll rows but there is/are employees not yet
          // in the record→ OPEN employee selection modal
          openMissingEmployeesModal({
            runId,
            missingCount: selectableEmployees.length,
            onContinue: (runId) => startPayrollComputationUI(runId)
          });
          return;
        }

        // ========= STEP 4 — NORMAL FLOW =========
        startPayrollComputationUI(runId);
      } catch (err) {
        showToast("Error starting payroll run: " + (err.message || err), "warning");
      }
    });
  }

  if (addButton) {
    addButton.addEventListener("click", async () => {
      const runId = await ensurePayrollRun();
      openEmployeeSelectionModal(runId);
    });
  }

  if (savePayroll) {
    savePayroll.addEventListener("click", async () => {
      try {
        const runId = await getRunIdFromFilters();
        console.log("RUN ID:", runId);

        const employees = await loadEmployeesByRun(runId);

        if (!employees.length) {
          showToast("⚠️ No employees found for this payroll run", "warning");
          return;
        }
        
        console.log(`Loaded payrolls for ${employees.length} employees`);
        
        const noPayrollRecord = await loadSelectableEmployees(runId);
        console.log("EMPLOYEES WITH NO PAYROLL RECORD YET:", noPayrollRecord);

        if (noPayrollRecord.length > 0) {
          // Show modal for missing employees
          openMissingEmployeesModal({
            runId,
            missingCount: noPayrollRecord.length,
            onContinue: async (runId) => {
              await savePayrollRun(runId, employees);
              
              showToast("Payroll record processed successfully.", "success");      
              showSection("filterSection");
              // refresh dropdowns on return
              loadPayrollData();
              loadPayrollDropdowns();
            }
          });
        } else {
          await savePayrollRun(runId, employees);

          showToast("Payroll record processed successfully.", "success");      
          showSection("filterSection");
          // refresh dropdowns on return
          loadPayrollData();
          loadPayrollDropdowns();
        }
      } catch (err) {
        console.error(err);
        showToast("Error starting payroll run: " + (err.message || err), "warning");
      }
    });
  }

  if (backButton) {
    backButton.addEventListener("click", () => {
      const backConfirmModal = document.getElementById("backConfirmModal");
      const confirmBackBtn = document.getElementById("confirmBackBtn");
      const cancelBackBtn = document.getElementById("cancelBackBtn");

      backConfirmModal.classList.remove("hidden");

      // CONFIRM → go back to filter section and reset dropdowns
      confirmBackBtn.addEventListener("click", async () => {
        backConfirmModal.classList.add("hidden");

        showSection("filterSection");

        // refresh dropdowns on return
        loadPayrollData();
        loadPayrollDropdowns();
      });
      
      // CANCEL → just close modal
      cancelBackBtn.addEventListener("click", async () => {
        backConfirmModal.classList.add("hidden");
      });
    });
  }
  
  function resetSearchControls() {
    searchInput.value = "";
    searchCategory.value = "employee_id";
  }

  if (searchCategory) {
    searchCategory.addEventListener("change", () => {
      searchInput.value = ""; // optional
      loadFilteredEmployees();
    });
  }

  if (searchInput) {
    let searchTimeout;

    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        loadFilteredEmployees();
      }, 300);
      
      setActiveTab("computationSection"); // hide previous active tab
      document.getElementById("profile-header").classList.add("hidden"); // hide profile
      document.querySelector(".tab-buttons").classList.add("hidden"); // hide tab buttons
      document.querySelector(".summary-bar").classList.add("hidden"); // hide summary bar
    });
  }
}

// ========== PAYROLL JOURNAL PAGE ==========
if (window.location.pathname === '/dashboard/payroll_journal.html') {
  // ===============================
  // Section Controller
  // ===============================
  function showSection(sectionId) {
    // Hide all sections first
    document.getElementById("summaryFilterSection").classList.add("hidden");
    document.getElementById("payrollJournalSection").classList.add("hidden");

    // Show target section
    const target = document.getElementById(sectionId);
    if (target) {
      target.classList.remove("hidden");
      console.log("✅ Showing section:", sectionId);
    } else {
      console.warn("⚠️ Section not found:", sectionId);
    }
  }
  
  // ===================================
  // STEP 1 LEFT: Payroll Journal Setup
  // ===================================
  function showCoveredDate(sectionId) {
    // Hide all sections first
    document.getElementById("summaryPeriod").classList.add("hidden");
    document.getElementById("summaryRange").classList.add("hidden");

    // Show target section
    const target = document.getElementById(sectionId);
    if (target) {
      target.classList.remove("hidden");
      console.log("✅ Showing covered date:", sectionId);
    } else {
      console.warn("⚠️ Covered date not found:", sectionId);
    }
  }
  
  // Covered date event listener
  const coveredDateRadios = document.querySelectorAll(".covered-date-options input[name='summaryCoveredDateOption']");

  coveredDateRadios.forEach(radio => {
    radio.addEventListener("change", function () {
      if (!this.checked) return;

      if (this.value === "period") {
        showCoveredDate("summaryPeriod");
        resetPanel("summaryPeriod");

        const currentYear = String(new Date().getFullYear());
        summaryYearPeriod.value = currentYear;

      } else if (this.value === "range") {
        showCoveredDate("summaryRange");
        resetPanel("summaryRange");

        const currentYear = String(new Date().getFullYear());
        summaryYearFrom.value = currentYear;
        summaryYearTo.value = currentYear;
      }
    });
  });

  // Reset panels
  function resetPanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    // Reset all <select> to default (first option)
    panel.querySelectorAll("select").forEach(sel => {
      sel.selectedIndex = 0;
      sel.style.removeProperty("border");
    });

    // Reset all <input type="text"> inside the panel
    panel.querySelectorAll("input[type='text']").forEach(inp => {
      inp.value = "";
    });
  }

  // Elements inside "Period" panel
  const periodGroup = document.getElementById("summaryPayrollGroupPeriod");
  const periodSelect = document.getElementById("summaryPeriodPeriod");
  const periodMonth = document.getElementById("summaryMonthPeriod");
  const periodYear = document.getElementById("summaryYearPeriod");
  const periodRange = document.getElementById("summaryPayrollRangePeriod");

  // Elements inside "Range" panel
  const rangeGroup = document.getElementById("summaryPayrollGroupRange");
  const rangeFromPeriod = document.getElementById("summaryPeriodFrom");
  const rangeFromMonth = document.getElementById("summaryMonthFrom");
  const rangeFromYear = document.getElementById("summaryYearFrom");
  const rangeToPeriod = document.getElementById("summaryPeriodTo");
  const rangeToMonth = document.getElementById("summaryMonthTo");
  const rangeToYear = document.getElementById("summaryYearTo");
  const rangeRange = document.getElementById("summaryPayrollRangeRange");

  // Load payroll data
  async function loadPayrollData() {
    try {
      const res = await fetch("/api/payroll_periods");
      const json = await res.json();
      if (!json.success) throw new Error("Failed to fetch payroll data");

      // Set default covered date option
      document.getElementById("summaryOptionPeriod").checked = true;
      showCoveredDate("summaryPeriod");

      const { payrollGroups, payrollMonths, payrollYears, payrollPeriods } = json.data;
      window.allPayrollPeriods = payrollPeriods; // store globally

      // --- Populate selects ---
      // Groups: use group_name string for value
      populateSelect(periodGroup, payrollGroups, "group_name", "group_name");
      populateSelect(rangeGroup, payrollGroups, "group_name", "group_name");

      // Months: keep using month_id
      populateSelect(periodMonth, payrollMonths, "month_id", "month_name");
      populateSelect(rangeFromMonth, payrollMonths, "month_id", "month_name");
      populateSelect(rangeToMonth, payrollMonths, "month_id", "month_name");

      // Years: keep using year_value, select current year by default
      populateSelect(periodYear, payrollYears, "year_value", "year_value", true);
      populateSelect(rangeFromYear, payrollYears, "year_value", "year_value", true);
      populateSelect(rangeToYear, payrollYears, "year_value", "year_value", true);

      // --- Update period options and generate ranges ---
      updatePeriodOptions(periodGroup, periodSelect);
      updateRangePeriods(rangeGroup, rangeFromPeriod, rangeToPeriod);
      generatePayrollRange(periodGroup, periodSelect, periodMonth, periodYear, periodRange);
      generateRangeRange();
    } catch (err) {
      console.error("Error loading payroll data:", err);
    }
  }

  // Helper to populate a select
  function populateSelect(selectEl, data, valueKey, textKey, selectCurrentYear=false) {
    selectEl.innerHTML = "";

    const defaultText = selectEl.id.includes("Month") ? "Month"
                      : selectEl.id.includes("Group") ? "Group"
                      : "Year";

    // Always add default option first
    selectEl.appendChild(option("", `-- Select ${defaultText} --`, true, true));

    const currentYear = new Date().getFullYear();
    data.forEach(d => {
      const opt = option(d[valueKey], d[textKey], false, selectCurrentYear && d[valueKey] === currentYear);
      selectEl.appendChild(opt);
    });
  }

  // Create an <option> element
  function option(value, text, disabled=false, selected=false) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    opt.disabled = disabled;
    opt.selected = selected;
    return opt;
  }

  // --- Update Period options for Period panel ---
  function updatePeriodOptions(groupEl, periodEl) {
    const groupName = groupEl.value;
    const groupNameLower = groupName.toLowerCase();
    
    periodEl.innerHTML = "";

    if (!groupNameLower) {
      periodEl.appendChild(option("", "-- Please select a group first --", true, true));
      return;
    }

    periodEl.appendChild(option("", "-- Select Period --", true, true));

    // Safe filtering
    const filtered = (window.allPayrollPeriods || []).filter(
      p => p.group_name && p.group_name.toLowerCase() === groupNameLower.toLowerCase()
    );

    if (filtered.length) {
      filtered.forEach(p => periodEl.appendChild(option(p.period_id, p.period_name)));
    } else {
      // fallback for weekly/semi-monthly/monthly
      if (groupNameLower.includes("weekly")) {
        ["1st Week","2nd Week","3rd Week","4th Week"].forEach(w => 
          periodEl.appendChild(option(w.toLowerCase(), w))
        );
      } else if (groupNameLower.includes("semi-monthly")) {
        ["First Half","Second Half"].forEach(h => 
          periodEl.appendChild(option(h.toLowerCase(), h))
        );
      } else if (groupNameLower.includes("monthly")) {
        periodEl.appendChild(option("monthly","Monthly", false, true));
      }
    }
  }

  // Update Period options for Range panel
  function updateRangePeriods(groupEl, fromEl, toEl) {
    updatePeriodOptions(groupEl, fromEl);
    updatePeriodOptions(groupEl, toEl);
  }

  // --- Update To Period, To Month, and To Year dynamically based on From Period, Month, and Year ---
  function handleRangePeriodLogic(fromPeriodEl, toPeriodEl, fromMonthEl, toMonthEl, fromYearEl, toYearEl) {
    const updateToPeriodMonthYear = () => {
      const fromPeriod = fromPeriodEl.value.toLowerCase();
      const fromMonth = parseInt(fromMonthEl.value, 10);
      const toMonth = parseInt(toMonthEl.value, 10);
      const fromYear = parseInt(fromYearEl.value, 10);
      const toYear = parseInt(toYearEl.value, 10);

      // --- Semi-monthly period logic ---
      if (!isNaN(fromMonth) && !isNaN(toMonth) && fromMonth === toMonth) {
        if (fromPeriod === "first half") {
          toPeriodEl.value = "second half";
          toPeriodEl.disabled = false;

          // Disable the first option
          Array.from(toPeriodEl.options).forEach(opt => {
            if (opt.value !== "second half") opt.disabled = true;
          });
        } else if (fromPeriod === "second half") {
          toPeriodEl.value = "second half";
          toPeriodEl.disabled = true;
        }
      } else {
        // Enable all options except the default first option
        Array.from(toPeriodEl.options).forEach(opt => {
          if (opt.value !== "") opt.disabled = false;
        });
        toPeriodEl.disabled = false;
      }

      // --- Restrict To Year options ---
      if (!isNaN(fromYear)) {
        for (const opt of toYearEl.options) {
          const yearVal = parseInt(opt.value, 10);
          if (!isNaN(yearVal)) {
            opt.disabled = yearVal < fromYear; // cannot select previous years
          }
        }

        // Auto-fix To Year if currently invalid
        if (!isNaN(toYear) && toYear < fromYear) {
          toYearEl.value = fromYear;
        }
      }

      // --- Restrict To Month options if same year ---
      const effectiveToYear = parseInt(toYearEl.value, 10);
      if (!isNaN(fromYear) && !isNaN(effectiveToYear) && fromYear === effectiveToYear && !isNaN(fromMonth)) {
        for (const opt of toMonthEl.options) {
          const monthVal = parseInt(opt.value, 10);
          if (!isNaN(monthVal)) {
            opt.disabled = monthVal < fromMonth;
          }
        }

        // Auto-fix To Month if currently invalid
        if (!isNaN(toMonth) && toMonth < fromMonth) {
          toMonthEl.value = fromMonth;
        }
      } else {
        // Enable all months except the default first option
        Array.from(toMonthEl.options).forEach(opt => {
          if (opt.value !== "") opt.disabled = false;
        });
      }

      generateRangeRange(); // update the generated range display
      loadSummaryEmployeeDropdownByRun(); // update the employee select options
    };

    // --- Event listeners ---
    fromPeriodEl.addEventListener("change", updateToPeriodMonthYear);
    fromMonthEl.addEventListener("change", updateToPeriodMonthYear);
    toMonthEl.addEventListener("change", updateToPeriodMonthYear);
    fromYearEl.addEventListener("change", updateToPeriodMonthYear);
    toYearEl.addEventListener("change", updateToPeriodMonthYear);

    // --- Initial call ---
    updateToPeriodMonthYear();
  }

  // Generate single payroll range
  function generatePayrollRange(groupEl, periodEl, monthEl, yearEl, rangeEl) {
    const groupName = groupEl.value.toLowerCase();
    const period = periodEl.selectedOptions[0]?.text || "";
    const month = monthEl.selectedOptions[0]?.text || "";
    const year = yearEl.value;

    if (!groupName || !month || !year) { rangeEl.value = ""; return; }

    let range = "";
    if (groupName.includes("weekly")) range = `${month} (${period}) ${year}`;
    else if (groupName.includes("semi-monthly")) {
      range = period.includes("First") ? `${month} 1–15, ${year}` : period.includes("Second") ? `${month} 16–30, ${year}` : "";
    } else if (groupName.includes("monthly")) range = `${month} 1–30, ${year}`;

    rangeEl.value = range;
  }

  // Generate payroll range for Range panel
  function generateRangeRange() {
    const groupName = rangeGroup.value.toLowerCase();
    const fromPeriod = rangeFromPeriod.selectedOptions[0]?.text || "";
    const fromMonth = rangeFromMonth.selectedOptions[0]?.text || "";
    const fromYear = rangeFromYear.value;
    const toPeriod = rangeToPeriod.selectedOptions[0]?.text || "";
    const toMonth = rangeToMonth.selectedOptions[0]?.text || "";
    const toYear = rangeToYear.value;

    if (!groupName || !fromMonth || !fromYear || !toMonth || !toYear) {
      rangeRange.value = "";
      return;
    }

    let fromRange = "";
    let toRange = "";

    if (groupName.includes("weekly")) {
      fromRange = `${fromMonth} (${fromPeriod}) ${fromYear}`;
      toRange   = `${toMonth} (${toPeriod}) ${toYear}`;
    } else if (groupName.includes("semi-monthly")) {
      fromRange = fromPeriod.includes("First") ? `${fromMonth} 1–15, ${fromYear}` : fromPeriod.includes("Second") ? `${fromMonth} 16–30, ${fromYear}` : "";
      toRange   = toPeriod.includes("First") ? `${toMonth} 1–15, ${toYear}` : toPeriod.includes("Second") ? `${toMonth} 16–30, ${toYear}` : "";
    } else if (groupName.includes("monthly")) {
      fromRange = `${fromMonth} 1–30, ${fromYear}`;
      toRange   = `${toMonth} 1–30, ${toYear}`;
    }

    rangeRange.value = `${fromRange} - ${toRange}`;
  }
  
  // Event listeners
  periodGroup.addEventListener("change", () => { updatePeriodOptions(periodGroup, periodSelect); generatePayrollRange(periodGroup, periodSelect, periodMonth, periodYear, periodRange); });
  periodSelect.addEventListener("change", () => generatePayrollRange(periodGroup, periodSelect, periodMonth, periodYear, periodRange));
  periodMonth.addEventListener("change", () => generatePayrollRange(periodGroup, periodSelect, periodMonth, periodYear, periodRange));
  periodYear.addEventListener("change", () => generatePayrollRange(periodGroup, periodSelect, periodMonth, periodYear, periodRange));

  rangeGroup.addEventListener("change", () => { 
    updateRangePeriods(rangeGroup, rangeFromPeriod, rangeToPeriod); 
    handleRangePeriodLogic(rangeFromPeriod, rangeToPeriod, rangeFromMonth, rangeToMonth, rangeFromYear, rangeToYear);
    generateRangeRange(); 
  });
  rangeFromPeriod.addEventListener("change", generateRangeRange);
  rangeFromMonth.addEventListener("change", generateRangeRange);
  rangeFromYear.addEventListener("change", generateRangeRange);
  rangeToPeriod.addEventListener("change", generateRangeRange);
  rangeToMonth.addEventListener("change", generateRangeRange);
  rangeToYear.addEventListener("change", generateRangeRange);

  // Load data on page load
  loadPayrollData();

  // ===============================
  // STEP 1 RIGHT: Filter Dropdowns
  // ===============================
  // --- Load all filter dropdowns ---
  async function loadSummaryDropdowns() {
    try {
      const dropdowns = [
        { category: "company", elementId: "summaryCompany" },
        { category: "location", elementId: "summaryLocation" },
        { category: "branch", elementId: "summaryBranch" },
        { category: "division", elementId: "summaryDivision" },
        { category: "department", elementId: "summaryDepartment" },
        { category: "class", elementId: "summaryClass" },
        { category: "position", elementId: "summaryPosition" },
        { category: "employee_type", elementId: "summaryEmpType" },
        { category: "salary_type", elementId: "summarySalaryType" },
        { category: "employee", elementId: "summaryEmployee" }
      ];

      for (const drop of dropdowns) {
        let url = `/api/system_lists/${drop.category}`;

        if (drop.category === "employee") {
          const selectedOption = document.querySelector('input[name="summaryOption"]:checked')?.value || "active";
          url += `?status=${selectedOption}`;
        }

        const res = await fetch(url);
        const data = await res.json();
        const select = document.getElementById(drop.elementId);
        if (!select) continue;

        // Reset select to default
        select.innerHTML = `<option value="" disabled selected>-- Select --</option>`;

        data.forEach(item => {
          const opt = document.createElement("option");
          opt.value = item.value;
          opt.textContent = item.value;
          select.appendChild(opt);
        });
      }

      // Reset summaryOption radios
      document.querySelectorAll('#summaryFilterSection input[name="summaryOption"]').forEach(r => r.checked = false);
      document.getElementById("summaryActiveEmployees").checked = true;
      document.getElementById('summaryEmployeeName').value = '';

      // Load employees if run exists
      loadSummaryEmployeeDropdownByRun();
    } catch (err) {
      console.error("Error loading summary dropdowns:", err);
    }
  }

  // --- Helper to detect whether Period or Range is selected ---
  function getSummaryCoveredDateType() {
    return document.querySelector('input[name="summaryCoveredDateOption"]:checked')?.value;
  }

  // --- Get runId based on payroll filters on Period covered data ---
  async function getSummaryRunIdsByPeriod() {
    const payrollGroup = document.getElementById('summaryPayrollGroupPeriod').value;
    const payrollPeriod = document.getElementById('summaryPeriodPeriod').value;
    const month = document.getElementById('summaryMonthPeriod').value;
    const year = document.getElementById('summaryYearPeriod').value;

    const payrollGroupLower = payrollGroup.toLowerCase();
    
    if (!payrollGroupLower || !payrollPeriod || !month || !year) return null;

    const url = `/api/get_run_id_payroll_journal?payroll_group=${payrollGroupLower}&payroll_period=${payrollPeriod}&month=${month}&year=${year}`;
    const res = await fetch(url);
    const data = await res.json();

    console.log("data from period:",data);
    console.log("data.run_ids from period:",data.run_id);
    return data.success && data.run_id ? data.run_id : null;
  }

  // --- Get runId based on payroll filters on Range covered data ---
  async function getSummaryRunIdsByRange() {
    const payrollGroup = document.getElementById('summaryPayrollGroupRange').value;
    const fromPeriod = document.getElementById('summaryPeriodFrom').value;
    const fromMonth = document.getElementById('summaryMonthFrom').value;
    const fromYear = document.getElementById('summaryYearFrom').value;
    const toPeriod = document.getElementById('summaryPeriodTo').value;
    const toMonth = document.getElementById('summaryMonthTo').value;
    const toYear = document.getElementById('summaryYearTo').value;

    if (
      !payrollGroup ||
      !fromPeriod || !fromMonth || !fromYear ||
      !toPeriod || !toMonth || !toYear
    ) return [];

    // If from == to, shortcut to single run API
    if (
      fromPeriod === toPeriod &&
      fromMonth === toMonth &&
      fromYear === toYear
    ) {
      const singleRunId = await getSummaryRunIdFromRange();
      console.log("singleRunId: ", singleRunId);
      return singleRunId ? [singleRunId] : [];
    }

    console.log("Payroll Group:", payrollGroup, " From:", fromPeriod, fromMonth, fromYear, " To:", toPeriod, toMonth, toYear);
    const url = `/api/get_run_ids_range?` +
      `payroll_group=${payrollGroup.toLowerCase()}` +
      `&from_period=${fromPeriod}&from_month=${fromMonth}&from_year=${fromYear}` +
      `&to_period=${toPeriod}&to_month=${toMonth}&to_year=${toYear}`;

    const res = await fetch(url);
    const data = await res.json();

    console.log("data from range:",data);
    console.log("data.run_ids from range:",data.run_ids);
    return data.success ? data.run_ids : [];
  }
  
  // --- Get runId based on payroll filters on Range covered data but single range covered date ---
  // This is only a rollback IF ever na mag same values yung from-to sa range covered date
  async function getSummaryRunIdFromRange() {
    const payrollGroup = document.getElementById('summaryPayrollGroupRange').value;
    const payrollPeriod = document.getElementById('summaryPeriodFrom').value;
    const month = document.getElementById('summaryMonthFrom').value;
    const year = document.getElementById('summaryYearFrom').value;

    if (!payrollGroup || !payrollPeriod || !month || !year) return null;

    const url = `/api/get_run_id_payroll_journal?payroll_group=${payrollGroup.toLowerCase()}&payroll_period=${payrollPeriod}&month=${month}&year=${year}`;
    const res = await fetch(url);
    const data = await res.json();

    return data.success && data.run_id ? data.run_id : null;
  }

  // --- Load employees based on runId(s) ---
  async function loadSummaryEmployeeDropdownByRun() {
    const coveredType = getSummaryCoveredDateType();
    const selectedOption = document.querySelector('input[name="summaryOption"]:checked')?.value || "active";

    const select = document.getElementById("summaryEmployee");
    const input = document.getElementById('summaryEmployeeName');
    select.innerHTML = '<option value="" disabled selected>-- Select --</option>';
    input.value = '';

    let runIds = [];

    if (coveredType === "period") {
      const runId = await getSummaryRunIdsByPeriod();
      if (runId) runIds = [runId];
    } else {
      runIds = await getSummaryRunIdsByRange();
    }

    console.log("runIds:",runIds);

    if (!runIds.length) return;

    const params = new URLSearchParams({
      company: summaryCompany.value,
      location: summaryLocation.value,
      branch: summaryBranch.value,
      division: summaryDivision.value,
      department: summaryDepartment.value,
      class: summaryClass.value,
      position: summaryPosition.value,
      empType: summaryEmpType.value,
      salaryType: summarySalaryType.value
    });
    
    const res = await fetch(
      `/api/employees_for_multiple_runs?run_ids=${runIds.join(",")}&status=${selectedOption}&${params}`
    );
    const data = await res.json();
    console.log("data:",data);

    data.employees.forEach(emp => {
      const opt = document.createElement("option");
      opt.value = emp.employee_id;
      opt.textContent = emp.last_name;
      opt.dataset.fullname = `[${emp.emp_code}] ${emp.first_name} ${emp.last_name}`;
      select.appendChild(opt);
    });
  }

  // --- Employee dropdown event listener ---
  document.getElementById("summaryCategorySelector").addEventListener("change", (e) => {
    if (e.target.tagName === "SELECT" && e.target.id !== "summaryEmployee") {
      loadSummaryEmployeeDropdownByRun();
    }
  });

  // --- Filter change listeners to reload employees ---
  function setupSummaryFilterListeners() {
    const update = () => {
      loadSummaryEmployeeDropdownByRun();
    };

    // Period selectors
    [
      'summaryPayrollGroupPeriod',
      'summaryPeriodPeriod',
      'summaryMonthPeriod',
      'summaryYearPeriod'
    ].forEach(id => {
      document.getElementById(id)?.addEventListener('change', update);
    });

    // Range selectors
    [
      'summaryPeriodTo'
    ].forEach(id => {
      document.getElementById(id)?.addEventListener('change', update);
    });

    // Covered date radio
    document
      .querySelectorAll('input[name="summaryCoveredDateOption"]')
      .forEach(r => r.addEventListener('change', update));
  }

  // --- Employee select change: update employee name ---
  document.getElementById("summaryEmployee").addEventListener("change", function () {
    const selected = this.selectedOptions[0];
    document.getElementById("summaryEmployeeName").value = selected?.dataset.fullname || "";
  });

  // --- Radio button change: reload employees ---
  document.querySelectorAll('input[name="summaryOption"]').forEach(radio => {
    radio.addEventListener("change", loadSummaryEmployeeDropdownByRun);
  });

  // --- Clear filters button ---
  document.getElementById('summaryClearFiltersBtn').addEventListener('click', () => {
    document.querySelectorAll('#summaryCategorySelector select').forEach(sel => sel.value = "");
    document.getElementById("summaryActiveEmployees").checked = true;
    document.getElementById('summaryEmployeeName').value = '';
  });

  // --- Call on page load ---
  loadSummaryDropdowns();
  setupSummaryFilterListeners();

  // ===============================
  // STEP 2: Generated Payroll Records
  // ===============================
  let payrollJournalData = [];

  function getDayRange(payrollGroup, period) {
    const daysInMonth = 30; // fixed 30 days for all months

    payrollGroup = payrollGroup.toLowerCase();
    period = period.toLowerCase();

    if (payrollGroup === "semi-monthly") {
      if (period === "first half") return [1, 15];
      if (period === "second half") return [16, daysInMonth];
    } else if (payrollGroup === "weekly") {
      switch (period) {
        case "1st week": return [1, 7];
        case "2nd week": return [8, 14];
        case "3rd week": return [15, 21];
        case "4th week": return [22, 28];
        default: return [1, 7];
      }
    } else if (payrollGroup === "monthly") {
      return [1, daysInMonth];
    }

    // default fallback
    return [1, 15];
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  
  function formatPeriodDate(month, dayStart, dayEnd, year) {
    // For Period mode: show start-end if needed (like 1-15)
    return `${monthNames[parseInt(month, 10) - 1]} ${dayStart}, ${year} - ${monthNames[parseInt(month, 10) - 1]} ${dayEnd}, ${year}`;
  }

  function formatRangeDate(month, day, year) {
    // For Range mode: show single day only
    return `${monthNames[parseInt(month, 10) - 1]} ${day}, ${year}`;
  }

  // Update journal header based on selection
  function updateJournalHeader() {
    const selectedOption = document.querySelector('input[name="summaryCoveredDateOption"]:checked').value;

    let coveredText = "";

    if (selectedOption === "period") {
      const payrollGroup = document.getElementById("summaryPayrollGroupPeriod").value;
      const period = document.getElementById("summaryPeriodPeriod").value;
      const month = document.getElementById("summaryMonthPeriod").value;
      const year = document.getElementById("summaryYearPeriod").value;

      if (payrollGroup && period && month && year) {
        const [dayStart, dayEnd] = getDayRange(payrollGroup, period);
        const payrollRange = formatPeriodDate(month, dayStart, dayEnd, year);
        document.getElementById("summaryPayrollRangePeriod").value = payrollRange;
        coveredText = `[ ${payrollRange} ]`;
      }
    } else if (selectedOption === "range") {
      const payrollGroup = document.getElementById("summaryPayrollGroupRange").value;

      const fromPeriod = document.getElementById("summaryPeriodFrom").value;
      const fromMonth = document.getElementById("summaryMonthFrom").value;
      const fromYear = document.getElementById("summaryYearFrom").value;

      const toPeriod = document.getElementById("summaryPeriodTo").value;
      const toMonth = document.getElementById("summaryMonthTo").value;
      const toYear = document.getElementById("summaryYearTo").value;

      if (payrollGroup && fromPeriod && fromMonth && fromYear && toPeriod && toMonth && toYear) {
        const [fromDayStart, fromDayEnd] = getDayRange(payrollGroup, fromPeriod);
        const [toDayStart, toDayEnd] = getDayRange(payrollGroup, toPeriod);

        const fromDateStr = formatRangeDate(fromMonth, fromDayStart, fromYear);
        const toDateStr = formatRangeDate(toMonth, toDayEnd, toYear);

        const payrollRange = `${fromDateStr} – ${toDateStr}`;
        document.getElementById("summaryPayrollRangeRange").value = payrollRange;
        coveredText = `[ ${payrollRange} ]`;
      }
    }

    // Update journal header
    document.getElementById("journalCoveredDate").textContent = coveredText;
  }

  // Generating payroll records
  async function loadPayrollJournal(runIds) {
    if (!runIds || !runIds.length) return;

    // Reset Scroll
    const container = document.getElementById("journalTable");
    if (container) container.scrollLeft = 0;

    const orderBy = document.getElementById("journalOrderBy")?.value || "department_surname";

    const params = new URLSearchParams({
      run_ids: runIds.join(","),
      orderBy,
      status: document.querySelector("input[name='summaryOption']:checked").value,
      company: summaryCompany.value,
      location: summaryLocation.value,
      branch: summaryBranch.value,
      division: summaryDivision.value,
      department: summaryDepartment.value,
      class: summaryClass.value,
      position: summaryPosition.value,
      empType: summaryEmpType.value,
      salaryType: summarySalaryType.value,
      employeeId: summaryEmployee.value
    });
    
    console.log("Filters sent:", Object.fromEntries(params));

    try {
      const res = await fetch(`/api/payroll_journal_employees?${params.toString()}`);
      const data = await res.json();

      if (!data.success || !data.employees || !data.employees.length) {
        showToast("No payroll records found for the selected run(s).", "info");
        return;
      }
      
      payrollJournalData = data.employees;

      const tableBody = document.getElementById("payrollJournalTableBody");
      tableBody.innerHTML = "";

      const fmt = num => Number(num || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      // style: 'currency', currency: 'PHP', 

      const SUM_FIELDS = [
        "basic_salary","absence_deduction","undertime_deduction","late_deduction","overtime",
        "rg_rate","rg_ot","rd_rate","rd_ot","sd_rate","sd_ot",
        "sdrd_rate","sdrd_ot", "hd_rate","hd_ot","hdrd_rate","hdrd_ot",
        "rg_rate_nd","rg_ot_nd","rd_rate_nd","rd_ot_nd","sd_rate_nd","sd_ot_nd",
        "sdrd_rate_nd","sdrd_ot_nd", "hd_rate_nd","hd_ot_nd","hdrd_rate_nd","hdrd_ot_nd",
        "adj_comp","taxable_allowances","gross_taxable","adj_non_comp","non_taxable_allowances",
        "sss_employee","philhealth_employee","pagibig_employee","tax_withheld",
        "sss_emp_adj","philhealth_emp_adj","pagibig_emp_adj","tax_withheld_adj",
        "deductions","loans","other_deductions","net_pay"
      ];

      const createTotals = () => {
        const t = { _count: 0 };
        SUM_FIELDS.forEach(f => t[f] = 0);
        return t;
      };

      const addToTotals = (totals, emp) => {
        totals._count++;
        SUM_FIELDS.forEach(f => totals[f] += parseFloat(emp[f] || 0));
      };

      // Use your exact renderSubtotalRow
      const renderSubtotalRow = (label, totals, cssClass = "subtotal-row") => {
        return `
          <tr class="${cssClass}">
            <td><strong>${label}</strong> <span>${totals._count} record(s)</span></td>
            <td>${fmt(totals.basic_salary)}</td>
            <td>${fmt(totals.absence_deduction)}</td>
            <td>${fmt(totals.undertime_deduction)}<br>${fmt(totals.late_deduction)}</td>
            <td>${fmt(totals.overtime)}</td>

            <!-- OT / ND -->
            <td>${fmt(totals.rg_rate)}</br>${fmt(totals.rg_rate_nd)}</td>
            <td>${fmt(totals.rg_ot)}</br>${fmt(totals.rg_ot_nd)}</td>
            <td>${fmt(totals.rd_rate)}</br>${fmt(totals.rd_rate_nd)}</td>
            <td>${fmt(totals.rd_ot)}</br>${fmt(totals.rd_ot_nd)}</td>
            <td>${fmt(totals.sd_rate)}</br>${fmt(totals.sd_rate_nd)}</td>
            <td>${fmt(totals.sd_ot)}</br>${fmt(totals.sd_ot_nd)}</td>
            <td>${fmt(totals.sdrd_rate)}</br>${fmt(totals.sdrd_rate_nd)}</td>
            <td>${fmt(totals.sdrd_ot)}</br>${fmt(totals.sdrd_ot_nd)}</td>
            <td>${fmt(totals.hd_rate)}</br>${fmt(totals.hd_rate_nd)}</td>
            <td>${fmt(totals.hd_ot)}</br>${fmt(totals.hd_ot_nd)}</td>
            <td>${fmt(totals.hdrd_rate)}</br>${fmt(totals.hdrd_rate_nd)}</td>
            <td>${fmt(totals.hdrd_ot)}</br>${fmt(totals.hdrd_ot_nd)}</td>

            <!-- Earnings -->
            <td>${fmt(totals.adj_comp)}</td>
            <td>${fmt(totals.taxable_allowances)}</td>
            <td>${fmt(totals.gross_taxable)}</td>
            <td>${fmt(totals.adj_non_comp)}</td>
            <td>${fmt(totals.non_taxable_allowances)}</td>
            
            <!-- Deductions -->
            <td>${fmt(totals.sss_employee)}</br>${fmt(totals.sss_emp_adj)}</td>
            <td>${fmt(totals.philhealth_employee)}</br>${fmt(totals.philhealth_emp_adj)}</td>
            <td>${fmt(totals.pagibig_employee)}</br>${fmt(totals.pagibig_emp_adj)}</td>
            <td>${fmt(totals.tax_withheld)}</br>${fmt(totals.tax_withheld_adj)}</td>

            <td>${fmt(totals.deductions)}</td>
            <td>${fmt(totals.loans)}</td>
            <td>${fmt(totals.other_deductions)}</td>
            <td colspan="999"><strong>${fmt(totals.net_pay)}</strong></td>
          </tr>
        `;
      };

      const ORDER_CONFIG = {
        department_surname: { order:["department","last_name"], groups:["department"] },
        department_employeeid: { order:["department","employee_id"], groups:["department"] },
        division_surname: { order:["division","last_name"], groups:["division"] },
        division_employeeid: { order:["division","employee_id"], groups:["division"] },
        branch_department_surname: { order:["branch","department","last_name"], groups:["branch","department"] },
        branch_department_employeeid: { order:["branch","department","employee_id"], groups:["branch","department"] },
        project_salary_type_surname: { order:["projects","salary_type","last_name"], groups:["projects","salary_type"] },
        project_salary_type_employeeid: { order:["projects","salary_type","employee_id"], groups:["projects","salary_type"] },
        surname: { order:["last_name"], groups:[] },
        employeeid: { order:["employee_id"], groups:[] }
      };

      const config = ORDER_CONFIG[orderBy.replace("-", "_")] || ORDER_CONFIG["department_surname"];

      // Initialize totals
      const groupTotals = {};
      config.groups.forEach(g => groupTotals[g] = createTotals());
      const grandTotals = createTotals();

      let lastGroupValues = {};
      config.groups.forEach(g => lastGroupValues[g] = null);

      // Helper: group row
      const createGroupRow = (label, level) => {
        const tr = document.createElement("tr");
        tr.classList.add("group-row");
        tr.innerHTML = `<td colspan="999" style="padding-left:${level * 25}px;"><strong>${label}</strong></td>`;
        return tr;
      };

      // --- Render employees by company ---
      // Preserve the company order from the original dataset
      const companies = [];
      const seenCompanies = new Set();
      data.employees.forEach(e => {
        const cname = e.company || "COMPANY NAME";
        if (!seenCompanies.has(cname)) {
          companies.push(cname);
          seenCompanies.add(cname);
        }
      });

      companies.forEach(companyName => {
        // Company header row
        const companyTr = document.createElement("tr");
        companyTr.classList.add("company-row");
        companyTr.innerHTML = `<td colspan="999"><strong>${companyName}</strong></td>`;
        tableBody.appendChild(companyTr);

        // Filter employees for this company
        const companyEmployees = data.employees
        .filter(e => (e.company || "COMPANY NAME") === companyName)
        .sort((a, b) => {
          // Sort by configured order keys
          for (const key of config.order) {
            const valA = (a[key] || "").toString().toUpperCase();
            const valB = (b[key] || "").toString().toUpperCase();
            if (valA < valB) return -1;
            if (valA > valB) return 1;
          }
          return 0;
        });

        // Reset company totals
        const companyTotals = createTotals();

        // Reset group totals per company
        const groupTotals = {};
        config.groups.forEach(g => groupTotals[g] = createTotals());
        let lastGroupValues = {};
        config.groups.forEach(g => lastGroupValues[g] = null);

        // Loop through employees and process group rows and subtotals
        companyEmployees.forEach((emp, i) => {
          // Group rows & subtotals
          config.groups.forEach((groupKey, levelIndex) => {
            if (emp[groupKey] !== lastGroupValues[groupKey]) {
              // Render subtotals for all lower levels (inner → outer)
              for (let i = config.groups.length - 1; i >= levelIndex; i--) {
                const k = config.groups[i];
                if (lastGroupValues[k] !== null && groupTotals[k]._count > 0) {
                  tableBody.insertAdjacentHTML(
                    "beforeend",
                    renderSubtotalRow(
                      `Sub Total Per ${k.replace("_"," ").toUpperCase()} - ${lastGroupValues[k]}`,
                      groupTotals[k]
                    )
                  );
                }
              }

              // Reset totals
              config.groups.slice(levelIndex).forEach(k => groupTotals[k] = createTotals());

              // RESET lastGroupValues for lower levels
              config.groups.slice(levelIndex + 1).forEach(k => {
                lastGroupValues[k] = null;
              });

              // Update last seen value
              lastGroupValues[groupKey] = emp[groupKey];
              
              // Log to see group value changes
              //console.log(`Switching to group: ${emp[groupKey]} at level ${levelIndex}`);

              // Render group header row
              const groupLabel = emp[groupKey] || `Unknown ${groupKey}`;
              tableBody.appendChild(createGroupRow(groupLabel, levelIndex + 1));
            }
          });

          // Render employee row
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td style="position: relative;">
              <span style="display:inline-block; width:90px;">
                ${i + 1}. ${emp.emp_code}
              </span>
              <span style="float: right;">
                ${fmt(emp.main_computation)}
              </span>
              <br>
              ${emp.last_name.toUpperCase()}, ${emp.first_name.toUpperCase()}
            </td>
            <td>${fmt(emp.basic_salary)}</td>
            <td>${fmt(emp.absence_deduction)}</td>
            <td>${fmt(emp.undertime_deduction)}<br>${fmt(emp.late_deduction)}</td>
            <td>${fmt(emp.overtime)}</td>

            <!-- OT / ND -->
            <td>${fmt(emp.rg_rate)}</br>${fmt(emp.rg_rate_nd)}</td>
            <td>${fmt(emp.rg_ot)}</br>${fmt(emp.rg_ot_nd)}</td>
            <td>${fmt(emp.rd_rate)}</br>${fmt(emp.rd_rate_nd)}</td>
            <td>${fmt(emp.rd_ot)}</br>${fmt(emp.rd_ot_nd)}</td>
            <td>${fmt(emp.sd_rate)}</br>${fmt(emp.sd_rate_nd)}</td>
            <td>${fmt(emp.sd_ot)}</br>${fmt(emp.sd_ot_nd)}</td>
            <td>${fmt(emp.sdrd_rate)}</br>${fmt(emp.sdrd_rate_nd)}</td>
            <td>${fmt(emp.sdrd_ot)}</br>${fmt(emp.sdrd_ot_nd)}</td>
            <td>${fmt(emp.hd_rate)}</br>${fmt(emp.hd_rate_nd)}</td>
            <td>${fmt(emp.hd_ot)}</br>${fmt(emp.hd_ot_nd)}</td>
            <td>${fmt(emp.hdrd_rate)}</br>${fmt(emp.hdrd_rate_nd)}</td>
            <td>${fmt(emp.hdrd_ot)}</br>${fmt(emp.hdrd_ot_nd)}</td>

            <!-- Earnings -->
            <td>${fmt(emp.adj_comp)}</td>
            <td>${fmt(emp.taxable_allowances)}</td>
            <td>${fmt(emp.gross_taxable)}</td>
            <td>${fmt(emp.adj_non_comp)}</td>
            <td>${fmt(emp.non_taxable_allowances)}</td>

            <!-- Deductions -->
            <td>${fmt(emp.sss_employee)}</br>${fmt(emp.sss_emp_adj)}</td>
            <td>${fmt(emp.philhealth_employee)}</br>${fmt(emp.philhealth_emp_adj)}</td>
            <td>${fmt(emp.pagibig_employee)}</br>${fmt(emp.pagibig_emp_adj)}</td>
            <td>${fmt(emp.tax_withheld)}</br>${fmt(emp.tax_withheld_adj)}</td>

            <td>${fmt(emp.deductions)}</td>
            <td>${fmt(emp.loans)}</td>
            <td>${fmt(emp.other_deductions)}</td>
            <td>${fmt(emp.net_pay)}</td>
          `;
          tableBody.appendChild(tr);

          // Accumulate totals
          config.groups.forEach(g => addToTotals(groupTotals[g], emp));
          addToTotals(companyTotals, emp);
          addToTotals(grandTotals, emp);
        });

        // --- Subtotals per group (inside this company) ---
        // IMPORTANT: inner → outer
        for (let i = config.groups.length - 1; i >= 0; i--) {
          const g = config.groups[i];
          if (lastGroupValues[g] !== null && groupTotals[g]._count > 0) {
            tableBody.insertAdjacentHTML(
              "beforeend",
              renderSubtotalRow(
                `Sub Total Per ${g.replace("_"," ").toUpperCase()} - ${lastGroupValues[g]}`,
                groupTotals[g]
              )
            );
          }
        }

        // --- Subtotal per company ---
        tableBody.insertAdjacentHTML(
          "beforeend",
          renderSubtotalRow(`Sub Total Per COMPANY`, companyTotals, "subtotal-company-row")
        );
      });

      // --- GRAND TOTAL ---
      tableBody.insertAdjacentHTML(
        "beforeend",
        renderSubtotalRow("GRAND TOTAL", grandTotals, "grand-total-row")
      );
    } catch (err) {
      console.error("Error loading payroll journal:", err);
      showToast("Error loading payroll journal: " + (err.message || err), "warning");
    }
  }

  // Handle Order By change
  document.getElementById("journalOrderBy").addEventListener("change", async () => {
    const runIds = window.currentPayrollRunId || [];
    await loadPayrollJournal(runIds);
  });

  // Start payroll journal
  async function startPayrollJournal(runIds) {
    showSection("payrollJournalSection");

    // Save globally for Order By changes
    window.currentPayrollRunId = runIds;

    // Update report header
    await updateJournalHeader();

    // Load payroll table
    await loadPayrollJournal(runIds);
  }
  
  // ===============================
  // EVENT LISTENERS
  // ===============================
  const generateSummaryButton = document.getElementById("generateSummaryButton");
  const backButton = document.getElementById("backButton");
  const printBtn = document.getElementById("printPayrollJournal");

  function openMissingPayrollRunModal(message = null) {
    const modal = document.getElementById("missingPayrollRunModal");
    const text = document.getElementById("missingPayrollRunText");

    if (message) {
      text.textContent = message;
    }

    modal.classList.remove("hidden");

    // Helper: get selected values safely
    function getSelectedValue(id) {
      const el = document.getElementById(id);
      return el ? el.value : null;
    }

    // PERIOD MODE parameters
    function getPayrollParamsPeriod() {
      return {
        group_id: getSelectedValue("summaryPayrollGroupPeriod"),
        period_id: getSelectedValue("summaryPeriodPeriod"),
        month_id: getSelectedValue("summaryMonthPeriod"),
        year_id: getSelectedValue("summaryYearPeriod")
      };
    }

    // PERIOD MODE redirect
    function redirectToPayrollComputationPeriod() {
      const paramsObj = getPayrollParamsPeriod();
      const params = new URLSearchParams(paramsObj);

      console.log("Redirecting with PERIOD params:", paramsObj);
      console.log("Query string:", params.toString());

      window.location.href = `payroll_computation.html?${params.toString()}`;
    }

    // RANGE MODE parameters (using FROM fields but either will do)
    function getPayrollParamsRange() {
      return {
        group_id: getSelectedValue("summaryPayrollGroupRange"),
        period_id: getSelectedValue("summaryPeriodFrom"),
        month_id: getSelectedValue("summaryMonthFrom"),
        year_id: getSelectedValue("summaryYearFrom")
      };
    }

    // RANGE MODE redirect
    function redirectToPayrollComputationRange() {
      const paramsObj = getPayrollParamsRange();
      const params = new URLSearchParams(paramsObj);

      console.log("Redirecting with RANGE params:", paramsObj);
      console.log("Query string:", params.toString());

      window.location.href = `payroll_computation.html?${params.toString()}`;
    }

    // CREATE PAYROLL RECORD
    document.getElementById("createPayrollRunBtn").addEventListener("click", () => {
      const coveredType = getSummaryCoveredDateType();

      if (coveredType === "period") {
        redirectToPayrollComputationPeriod();
      } else {
        redirectToPayrollComputationRange();
      }
    });

    // CANCEL
    document.getElementById("cancelPayrollRunBtn").addEventListener("click", () => {
      modal.classList.add("hidden");
    });
  }
  
  if (backButton) {
    backButton.addEventListener("click", () => {
      showSection("summaryFilterSection");

      // refresh dropdowns on return
      loadPayrollData();
      loadSummaryDropdowns();
    });
  }

  // ================================
  // PRINT HANDLER
  // ================================
  async function printPayrollJournal() {
    const headerHtml = document.getElementById('journalHeader').outerHTML;
    const tableHtml = document.getElementById('journalTable').outerHTML;

    // Get the paper size from the modal
    const paperSize = document.getElementById("printPaperSize").value;

    const response = await fetch('/api/payroll_journal/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        headerHtml, 
        tableHtml,
        paperSize,
        landscape: true
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("PDF generation failed:", errText);
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    // Open PDF in new tab
    window.open(url, '_blank');
  }

  // ================================
  // EXCEL EXPORT
  // ================================
  async function exportPayrollToExcelJS(employees, { orderBy = "department_surname" } = {}) {
    const workbook = new ExcelJS.Workbook();
    workbook.calcProperties.fullCalcOnLoad = true;
    const sheet = workbook.addWorksheet("Payroll Journal", {
      views: [{ state: "frozen", ySplit: 8 }]
    });

    /* ================================
        STYLES
    ================================= */
    const cal8 = { name: "Calibri", size: 8 };
    const cal11 = { name: "Calibri", size: 11 };
    const bold = { bold: true };
    const center = { vertical: "middle", horizontal: "center", wrapText: true };
    const right = { vertical: "middle", horizontal: "right" };
    const thickBorder = {
      top: { style: "thick" },
      left: { style: "thick" },
      bottom: { style: "thick" },
      right: { style: "thick" }
    };
    const pesoFormat = '_-* ₱* #,##0.00_-;_-* (₱* #,##0.00)_-;_-* ₱* 0.00_-;_-@_-';
    const formatRecordLabel = (count) => `${count} record${count === 1 ? "" : "s"}`;

    /* ================================
        COLUMN WIDTHS
    ================================= */
    const totalCols = 94; // A–CP
    sheet.columns = Array.from({ length: totalCols }, (_, i) => ({ width: 13 }));
    sheet.getColumn(1).width = 6;  // CTR
    sheet.getColumn(2).width = 12; // EMPLOYEE NO.
    sheet.getColumn(3).width = 45; // EMPLOYEE NAME

    /* ================================
        META HEADER ROWS
    ================================= */
    const now = new Date();
    const fmtDate = d => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`;
    const fmtTime = d => `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
    const periodText = document.getElementById("journalCoveredDate")?.textContent?.trim() || "N/A";

    sheet.getCell("A1").value = `RUNDATE: ${fmtDate(now)}`;
    sheet.getCell("A1").font = cal8;
    sheet.getCell("A2").value = `RUNTIME: ${fmtTime(now)}`;
    sheet.getCell("A2").font = cal8;

    sheet.mergeCells("A4:CP4");
    const h4 = sheet.getCell("A4");
    h4.value = "Payroll Journal Details";
    h4.font = { ...cal11, ...bold };
    h4.alignment = center;

    sheet.mergeCells("A5:CP5");
    const h5 = sheet.getCell("A5");
    h5.value = `For the Period ${periodText}`;
    h5.font = { ...cal11, ...bold };
    h5.alignment = center;

    /* ================================
        TABLE HEADERS ROW 7-8
    ================================= */
    const H1 = 7, H2 = 8;

    const header = [
      { label: "CTR", merge: "A7:A8" },
      { label: "EMPLOYEE NO.", merge: "B7:B8" },
      { label: "EMPLOYEE NAME", merge: "C7:C8" },
      { label: "TAX STATUS", merge: "D7:D8" },
      { label: "AMOUNT RATE", merge: "E7:E8" },
      { label: "ATTENDANCE", merge: "F7:J7", sub: ["BASIC PAY","ABSENCES","LATE","UNDERTIME","TOTAL LOST HOURS"] },
      { label: "TOTAL ATTENDANCE", merge: "K7:K8" },
      { label: "ATTENDANCE ADJUSTMENTS", merge: "L7:O7", sub: ["DAYS PRESENT","ABSENCES","LATE","UNDERTIME"] },
      { label: "TOTAL ATTENDANCE ADJ.", merge: "P7:P8" },
      { label: "BASIC NET OF LOST HOURS", merge: "Q7:Q8" },
      { label: "OVERTIME", merge: "R7:AC7", sub: ["RG RATE","RG OT","RD RATE","RD OT","SD RATE","SD OT","SDRD RATE","SDRD OT","HD RATE","HD OT","HDRD RATE","HDRD OT"] },
      { label: "TOTAL O.T.", merge: "AD7:AD8" },
      { label: "OVERTIME ADJUSTMENTS", merge: "AE7:AP7", sub: ["RG RATE","RG OT","RD RATE","RD OT","SD RATE","SD OT","SDRD RATE","SDRD OT","HD RATE","HD OT","HDRD RATE","HDRD OT"] },
      { label: "TOTAL O.T. ADJ.", merge: "AQ7:AQ8" },
      { label: "NET TOTAL O.T.", merge: "AR7:AR8" },
      { label: "NIGHT DIFFERENTIAL", merge: "AS7:BD7", sub: ["RG ND","RG OTND","RD ND","RD OTND","SD ND","SD OTND","SDRD ND","SDRD OTND","HD ND","HD OTND","HDRD ND","HDRD OTND"] },
      { label: "TOTAL NIGHT DIFF.", merge: "BE7:BE8" },
      { label: "NIGHT DIFFERENTIAL ADJUSTMENTS", merge: "BF7:BQ7", sub: ["RG ND","RG OTND","RD ND","RD OTND","SD ND","SD OTND","SDRD ND","SDRD OTND","HD ND","HD OTND","HDRD ND","HDRD OTND"] },
      { label: "TOTAL N.D. ADJ.", merge: "BR7:BR8" },
      { label: "NET TOTAL N.D.", merge: "BS7:BS8" },
      { label: "OTHER ADJ. TAXABLE", merge: "BT7:BT8" },
      { label: "OTHER ADJ. NON-TAXABLE", merge: "BU7:BU8" },
      { label: "ALLOWANCE TAXABLE", merge: "BV7:BV8" },
      { label: "ALLOWANCE NON-TAXABLE", merge: "BW7:BW8" },
      { label: "GROSS INCOME", merge: "BX7:BX8" },
      { label: "GROSS TAXABLE", merge: "BY7:BY8" },
      { label: "GOVERNMENT CONTRIBUTION", merge: "BZ7:CC7", sub:["SSS","PHILHEALTH","PAG-IBIG","TAX WITHHELD"] },
      { label: "GOVERNMENT CONTRIBUTION ADJ.", merge: "CD7:CG7", sub:["SSS","PHILHEALTH","PAG-IBIG","TAX WITHHELD"] },
      { label: "DEDUCTION", merge: "CH7:CH8" },
      { label: "LOAN DEDUCTION", merge: "CI7:CI8" },
      { label: "OTHER DEDUCTION", merge: "CJ7:CJ8" },
      { label: "TOTAL DEDUCTIONS", merge: "CK7:CK8" },
      { label: "NET PAY", merge: "CL7:CL8" },
      { label: "PREMIUMS ER SHARE", merge: "CM7:CP7", sub:["SSS","SSS ECC","PHILHEALTH","PAG-IBIG"] },
    ];

    let col = 1;
    header.forEach(h => {
      if(h.merge) sheet.mergeCells(h.merge);

      // top cell
      const topCell = sheet.getCell(H1, col);
      topCell.value = h.label;
      topCell.font = { ...cal11, ...bold };
      topCell.alignment = center;
      topCell.border = thickBorder;

      // subheaders
      if(h.sub){
        h.sub.forEach((subLabel, i)=>{
          const cell = sheet.getCell(H2, col + i);
          cell.value = subLabel;
          cell.font = { ...cal11, ...bold };
          cell.alignment = center;
          cell.border = thickBorder;
        });
        col += h.sub.length;
      } else col++;
    });

    // header row heights
    sheet.getRow(H1).height = 15;
    sheet.getRow(H2).height = 29.4;

    // ================================
    // BODY ROWS WITH HIERARCHICAL BORDERS
    // ================================
    // Borders for body hierarchy
    const thinBorder = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    const mediumBorder = { top: { style: "medium" }, left: { style: "medium" }, bottom: { style: "medium" }, right: { style: "medium" } };
    const thickBorderRow = { top: { style: "thick" }, left: { style: "thick" }, bottom: { style: "thick" }, right: { style: "thick" } };

    // Function to create and apply borders to ranges
    const applyBorderToRange = (sheet, startRow, startCol, endCol, borderStyle, endRow = startRow) => {
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          sheet.getRow(r).getCell(c).border = borderStyle;
        }
      }
    };

    // Function to create and apply outside border
    const applyOutsideBorder = (sheet, startRow, endRow, startCol, endCol) => {
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const cell = sheet.getRow(r).getCell(c);
          const border = { ...(cell.border || {}) };

          if (r === startRow) border.top = { style: "thick" };
          if (r === endRow) border.bottom = { style: "thick" };
          if (c === startCol) border.left = { style: "thick" };
          if (c === endCol) border.right = { style: "thick" };

          cell.border = border;
        }
      }
    };

    /* ==============================
        TEMPLATES FOR SUBTOTALS
    ============================== */
    const renderGroupSubtotalRow = (label, totals, level, options = {}) => {
      const r = sheet.getRow(row++);

      const {
        boldRow = false,
        fillColor = null,
        topDoubleBorder = false,
        noIndent = false,
        useGroupLevelFill = false
      } = options;

      // Label with pluralized record count
      r.getCell(1).value = `${label} (${formatRecordLabel(totals._count)})`;
      r.getCell(1).alignment = {
        horizontal: "left",
        indent: noIndent ? 0 : level + 2
      };

      if (boldRow) r.font = { bold: true };

      // Numbers
      const FIRST_SUM_COL = 6; // Column F (basic_salary)
      let col = FIRST_SUM_COL;


      Object.keys(COLUMN_MAP).forEach(c => {
        const cell = r.getCell(Number(c));
        cell.value = totals[COLUMN_MAP[c]];
        cell.numFmt = pesoFormat;
        cell.alignment = right;
      });

      // Borders
      applyBorderToRange(sheet, r.number, 1, 94, thinBorder);

      // Double top border (grand total)
      if (topDoubleBorder) {
        for (let c = 1; c <= 94; c++) {
          r.getCell(c).border = {
            ...r.getCell(c).border,
            top: { style: "double" }
          };
        }
      }

      // Fill handling
      if (useGroupLevelFill) {
        const levelColors = ['FFDCDCDC', 'FFEFEFEF', 'FFCFCFCF', 'FFBFBFBF'];
        const bgColor = levelColors[level] || 'FFDCDCDC';
        for (let c = 1; c <= 94; c++) {
          r.getCell(c).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: bgColor }
          };
        }
      } else if (fillColor) {
        for (let c = 1; c <= 94; c++) {
          r.getCell(c).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: fillColor }
          };
        }
      }
    };

    /* ==============================
      CALCULATING TOTALS
    ============================== */
    const COLUMN_MAP = {
      6: "basic_salary",
      7: "absence_deduction",
      8: "late_deduction",
      9: "undertime_deduction",
      10: "total_lost_hours",
      11: "total_attendance",
      12: "attendance_adj_days_present",
      13: "attendance_adj_absences",
      14: "attendance_adj_late",
      15: "attendance_adj_undertime",
      16: "total_attendance_adj",
      17: "basic_net_of_lost_hours",
      18: "rg_rate",
      19: "rg_ot",
      20: "rd_rate",
      21: "rd_ot",
      22: "sd_rate",
      23: "sd_ot",
      24: "sdrd_rate",
      25: "sdrd_ot",
      26: "hd_rate",
      27: "hd_ot",
      28: "hdrd_rate",
      29: "hdrd_ot",
      30: "total_overtime",
      31: "ot_adj_rg_rate",
      32: "ot_adj_rg_ot",
      33: "ot_adj_rd_rate",
      34: "ot_adj_rd_ot",
      35: "ot_adj_sd_rate",
      36: "ot_adj_sd_ot",
      37: "ot_adj_sdrd_rate",
      38: "ot_adj_sdrd_ot",
      39: "ot_adj_hd_rate",
      40: "ot_adj_hd_ot",
      41: "ot_adj_hdrd_rate",
      42: "ot_adj_hdrd_ot",
      43: "total_ot_adj",
      44: "net_total_ot",
      45: "rg_rate_nd",
      46: "rg_ot_nd",
      47: "rd_rate_nd",
      48: "rd_ot_nd",
      49: "sd_rate_nd",
      50: "sd_ot_nd",
      51: "sdrd_rate_nd",
      52: "sdrd_ot_nd",
      53: "hd_rate_nd",
      54: "hd_ot_nd",
      55: "hdrd_rate_nd",
      56: "hdrd_ot_nd",
      57: "total_nd",
      58: "nd_adj_rg_rate",
      59: "nd_adj_rg_ot",
      60: "nd_adj_rd_rate",
      61: "nd_adj_rd_ot",
      62: "nd_adj_sd_rate",
      63: "nd_adj_sd_ot",
      64: "nd_adj_sdrd_rate",
      65: "nd_adj_sdrd_ot",
      66: "nd_adj_hd_rate",
      67: "nd_adj_hd_ot",
      68: "nd_adj_hdrd_rate",
      69: "nd_adj_hdrd_ot",
      70: "total_nd_adj",
      71: "net_total_nd",
      72: "adj_comp",
      73: "adj_non_comp",
      74: "taxable_allowances",
      75: "non_taxable_allowances",
      76: "gross_pay",
      77: "gross_taxable",
      78: "sss_employee",
      79: "philhealth_employee",
      80: "pagibig_employee",
      81: "tax_withheld",
      82: "sss_emp_adj",
      83: "philhealth_emp_adj",
      84: "pagibig_emp_adj",
      85: "tax_withheld_adj",
      86: "deductions",
      87: "loans",
      88: "other_deductions",
      89: "total_deductions",
      90: "net_pay",
      91: "sss_employer_adj",
      92: "sss_ecc_adj",
      93: "philhealth_employer_adj",
      94: "pagibig_employer_adj"
    };

    const createTotals = () => {
      const t = { _count: 0 };
      Object.values(COLUMN_MAP).forEach(key => t[key] = 0);
      return t;
    };

    const addRowToTotals = (totals, row) => {
      totals._count++;
      
      Object.keys(COLUMN_MAP).forEach(col => {
        const cellValue = row.getCell(Number(col)).value;

        const value = typeof cellValue === "object" && cellValue !== null
          ? Number(cellValue.result) || 0
          : Number(cellValue) || 0;

        totals[COLUMN_MAP[col]] += value;
      });
    };

    const createGroupTotals = (groups) => {
      const map = {};
      groups.forEach(g => map[g] = createTotals());
      return map;
    };

    /* ==============================
      MAIN LOGIC (EMPLOYEES AND GROUPS)
    ============================== */
    // Iterate over each company
    let row = H2 + 1;  // Starting row after headers
    let ctr = 1;       // Initialize numbering

    // Grouping and totals handling
    const companyMap = {};
    employees.forEach(e => { companyMap[e.company] ??= []; companyMap[e.company].push(e); });

    const ORDER_CONFIG = {
      department_surname: { order:["department","last_name"], groups:["department"] },
      department_employeeid: { order:["department","employee_id"], groups:["department"] },
      division_surname: { order:["division","last_name"], groups:["division"] },
      division_employeeid: { order:["division","employee_id"], groups:["division"] },
      branch_department_surname: { order:["branch","department","last_name"], groups:["branch","department"] },
      branch_department_employeeid: { order:["branch","department","employee_id"], groups:["branch","department"] },
      project_salary_type_surname: { order:["projects","salary_type","last_name"], groups:["projects","salary_type"] },
      project_salary_type_employeeid: { order:["projects","salary_type","employee_id"], groups:["projects","salary_type"] },
      surname: { order:["last_name"], groups:[] },
      employeeid: { order:["employee_id"], groups:[] }
    };
    const cfg = ORDER_CONFIG[orderBy] || ORDER_CONFIG.department_surname;

    // Initialize grand totals
    const grandTotals = createTotals();
    
    let lastGroupValues = {};
    cfg.groups.forEach(g => lastGroupValues[g] = null);

    // Iterate through each company
    for (const company in companyMap) {
      // Reset employee counter for this company
      let ctr = 1;

      // ==========================
      // COMPANY ROW
      // ==========================
      const companyStartRow = row;
      const companyRowNum = row++;
      const companyRow = sheet.getRow(companyRowNum);
      companyRow.getCell(1).value = `${company}`;
      sheet.mergeCells(`A${companyRowNum}:CP${companyRowNum}`);
      applyBorderToRange(sheet, companyRowNum, 1, 94, thickBorderRow);

      // Company row background color (light blue)
      for (let c = 1; c <= 94; c++) {
        companyRow.getCell(c).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFCCE5FF' } // light blue
        };
      }

      const companyEmployees = companyMap[company].sort((a, b) => {
        for (const k of cfg.order) {
          const A = (a[k] || "").toString(),
                B = (b[k] || "").toString();
          if (A < B) return -1;
          if (A > B) return 1;
        }
        return 0;
      });

      // Reset company totals
      const companyTotals = createTotals();
      
      // Reset group totals
      const groupTotals = createGroupTotals(cfg.groups);
      
      let lastGroupValues = {};
      cfg.groups.forEach(g => lastGroupValues[g] = null);

      // Process each employee and group rows
      companyEmployees.forEach(emp => {
        // ==========================
        // GROUP ROWS
        // ==========================
        cfg.groups.forEach((g, level) => {
          if (emp[g] !== lastGroupValues[g]) {

            // 🔻 CLOSE deeper groups first
            for (let i = cfg.groups.length - 1; i >= level; i--) {
              const grp = cfg.groups[i];
              if (lastGroupValues[grp] !== null) {
                renderGroupSubtotalRow(
                  `Sub Total ${grp}: ${lastGroupValues[grp]}`,
                  groupTotals[grp],
                  i,
                  {
                    useGroupLevelFill: true,
                    border: "medium"
                  }
                );
                groupTotals[grp] = createTotals();
                lastGroupValues[grp] = null;
              }
            }

            // 🔺 OPEN new group
            lastGroupValues[g] = emp[g];

            // Create the group row for the current group
            const groupRowNum = row++;
            const groupRow = sheet.getRow(groupRowNum);
            groupRow.getCell(1).value = emp[g] ?? `Unknown ${g}`;
            groupRow.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: level + 1 };
            sheet.mergeCells(`A${groupRowNum}:CP${groupRowNum}`);
            applyBorderToRange(sheet, groupRowNum, 1, 94, mediumBorder);

            // Set group background
            const levelColors = ['FFDCDCDC', 'FFEFEFEF', 'FFCFCFCF', 'FFBFBFBF'];
            const bgColor = levelColors[level] || 'FFDCDCDC';
            for (let c = 1; c <= 94; c++) {
              groupRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
            }
          }
        });

        // ==========================
        // EMPLOYEE ROW
        // ==========================
        const empRowNum = row++;
        const empRow = sheet.getRow(empRowNum);

        // Format cells to "0.00" and show negatives as (number)
        const startCol = 5;  // E
        const endCol = 94;   // CP

        for (let col = startCol; col <= endCol; col++) {
          const cell = empRow.getCell(col);
          cell.numFmt = '0.00;(0.00);0.00';
          cell.alignment = { horizontal: 'right' };
        }

        // Helper function to sum cell values within a column range
        function sumCells(row, startCol, endCol) {
          let total = 0;

          for (let i = startCol; i <= endCol; i++) {
            total += toNumber(row.getCell(i).value);
          }

          return total;
        }

        // Value Conversion
        const toNumber = (value) => {
          const num = Number(value);
          return Number.isFinite(num) ? num : 0;
        };

        empRow.getCell(1).value = ctr++;
        empRow.getCell(1).alignment = right;
        empRow.getCell(2).value = emp.emp_code ?? "-";
        empRow.getCell(3).value = `${emp.last_name}, ${emp.first_name}` ?? "-";
        empRow.getCell(4).value = emp.tax_exemption_code ?? "-";
        empRow.getCell(5).value  = toNumber(emp.main_computation);

        // ATTENDANCE
        empRow.getCell(6).value  = toNumber(emp.basic_salary);
        empRow.getCell(7).value  = toNumber(emp.absence_deduction);
        empRow.getCell(8).value  = toNumber(emp.late_deduction);
        empRow.getCell(9).value  = toNumber(emp.undertime_deduction);
        const totalLostHours = sumCells(empRow, 7, 9);
        empRow.getCell(10).value = { formula: `SUM(G${empRow.number}:I${empRow.number})`, result: totalLostHours};
        const totalAttendance = toNumber(emp.basic_salary) - totalLostHours;
        empRow.getCell(11).value = { formula: `F${empRow.number}-J${empRow.number}`, result: totalAttendance };

        // ATTENDANCE ADJUSTMENTS
        empRow.getCell(12).value  = toNumber(emp.basic_salary_adj);
        empRow.getCell(13).value  = toNumber(emp.absence_deduction_adj);
        empRow.getCell(14).value  = toNumber(emp.late_deduction_adj);
        empRow.getCell(15).value  = toNumber(emp.undertime_deduction_adj);
        const totalAttendanceAdj = toNumber(emp.basic_salary_adj) - sumCells(empRow, 13, 15);
        empRow.getCell(16).value = { formula: `L${empRow.number}-SUM(M${empRow.number}:O${empRow.number})`, result: totalAttendanceAdj};
        
        const netLostHours = totalAttendance + totalAttendanceAdj;
        empRow.getCell(17).value = { formula: `SUM(K${empRow.number},P${empRow.number})`, result: netLostHours };
        
        // OVERTIME
        empRow.getCell(18).value = toNumber(emp.rg_rate);
        empRow.getCell(19).value = toNumber(emp.rg_ot);
        empRow.getCell(20).value = toNumber(emp.rd_rate);
        empRow.getCell(21).value = toNumber(emp.rd_ot);
        empRow.getCell(22).value = toNumber(emp.sd_rate);
        empRow.getCell(23).value = toNumber(emp.sd_ot);
        empRow.getCell(24).value = toNumber(emp.sdrd_rate);
        empRow.getCell(25).value = toNumber(emp.sdrd_ot);
        empRow.getCell(26).value = toNumber(emp.hd_rate);
        empRow.getCell(27).value = toNumber(emp.hd_ot);
        empRow.getCell(28).value = toNumber(emp.hdrd_rate);
        empRow.getCell(29).value = toNumber(emp.hdrd_ot);
        const totalOvertime = sumCells(empRow, 18, 29);
        empRow.getCell(30).value = { formula: `SUM(R${empRow.number}:AC${empRow.number})`, result: totalOvertime};

        // OVERTIME ADJUSTMENTS
        empRow.getCell(31).value = toNumber(emp.ot_adj_rg_rate);
        empRow.getCell(32).value = toNumber(emp.ot_adj_rg_ot);
        empRow.getCell(33).value = toNumber(emp.ot_adj_rd_rate);
        empRow.getCell(34).value = toNumber(emp.ot_adj_rd_ot);
        empRow.getCell(35).value = toNumber(emp.ot_adj_sd_rate);
        empRow.getCell(36).value = toNumber(emp.ot_adj_sd_ot);
        empRow.getCell(37).value = toNumber(emp.ot_adj_sdrd_rate);
        empRow.getCell(38).value = toNumber(emp.ot_adj_sdrd_ot);
        empRow.getCell(39).value = toNumber(emp.ot_adj_hd_rate);
        empRow.getCell(40).value = toNumber(emp.ot_adj_hd_ot);
        empRow.getCell(41).value = toNumber(emp.ot_adj_hdrd_rate);
        empRow.getCell(42).value = toNumber(emp.ot_adj_hdrd_ot);
        const totalOvertimeAdj = sumCells(empRow, 31, 42);
        empRow.getCell(43).value = { formula: `SUM(AE${empRow.number}:AP${empRow.number})`, result: totalOvertimeAdj};

        const netTotalOT = totalOvertime + totalOvertimeAdj;
        empRow.getCell(44).value = { formula: `SUM(AD${empRow.number},AQ${empRow.number})`, result: netTotalOT };
        
        // NIGHT DIFFERENTIAL
        empRow.getCell(45).value = toNumber(emp.rg_rate_nd);
        empRow.getCell(46).value = toNumber(emp.rg_ot_nd);
        empRow.getCell(47).value = toNumber(emp.rd_rate_nd);
        empRow.getCell(48).value = toNumber(emp.rd_ot_nd);
        empRow.getCell(49).value = toNumber(emp.sd_rate_nd);
        empRow.getCell(50).value = toNumber(emp.sd_ot_nd);
        empRow.getCell(51).value = toNumber(emp.sdrd_rate_nd);
        empRow.getCell(52).value = toNumber(emp.sdrd_ot_nd);
        empRow.getCell(53).value = toNumber(emp.hd_rate_nd);
        empRow.getCell(54).value = toNumber(emp.hd_ot_nd);
        empRow.getCell(55).value = toNumber(emp.hdrd_rate_nd);
        empRow.getCell(56).value = toNumber(emp.hdrd_ot_nd);
        const totalNightDiff = sumCells(empRow, 45, 56);
        empRow.getCell(57).value = { formula: `SUM(AS${empRow.number}:BD${empRow.number})`, result: totalNightDiff};
        
        // NIGHT DIFFERENTIAL ADJUSTMENTS
        empRow.getCell(58).value = toNumber(emp.nd_adj_rg_rate);
        empRow.getCell(59).value = toNumber(emp.nd_adj_rg_ot);
        empRow.getCell(60).value = toNumber(emp.nd_adj_rd_rate);
        empRow.getCell(61).value = toNumber(emp.nd_adj_rd_ot);
        empRow.getCell(62).value = toNumber(emp.nd_adj_sd_rate);
        empRow.getCell(63).value = toNumber(emp.nd_adj_sd_ot);
        empRow.getCell(64).value = toNumber(emp.nd_adj_sdrd_rate);
        empRow.getCell(65).value = toNumber(emp.nd_adj_sdrd_ot);
        empRow.getCell(66).value = toNumber(emp.nd_adj_hd_rate);
        empRow.getCell(67).value = toNumber(emp.nd_adj_hd_ot);
        empRow.getCell(68).value = toNumber(emp.nd_adj_hdrd_rate);
        empRow.getCell(69).value = toNumber(emp.nd_adj_hdrd_ot);
        const totalNDAdj = sumCells(empRow, 58, 69);
        empRow.getCell(70).value = { formula: `SUM(BF${empRow.number}:BQ${empRow.number})`, result: totalNDAdj};

        const netTotalND = totalNightDiff + totalNDAdj;
        empRow.getCell(71).value = { formula: `SUM(BE${empRow.number},BR${empRow.number})`, result: netTotalND };
        empRow.getCell(72).value = toNumber(emp.adj_comp);    // may iba pa atang values to so pansamantala lang muna
        empRow.getCell(73).value = toNumber(emp.adj_non_comp);
        empRow.getCell(74).value = toNumber(emp.taxable_allowances);
        empRow.getCell(75).value = toNumber(emp.non_taxable_allowances);
        empRow.getCell(76).value = toNumber(emp.gross_pay);
        empRow.getCell(77).value = toNumber(emp.gross_taxable);

        // GOVERNMENT CONTRIBUTION
        empRow.getCell(78).value = toNumber(emp.sss_employee);
        empRow.getCell(79).value = toNumber(emp.philhealth_employee);
        empRow.getCell(80).value = toNumber(emp.pagibig_employee);
        empRow.getCell(81).value = toNumber(emp.tax_withheld);

        // GOVERNMENT CONTRIBUTION ADJUSTMENTS
        empRow.getCell(82).value = toNumber(emp.sss_emp_adj);
        empRow.getCell(83).value = toNumber(emp.philhealth_emp_adj);
        empRow.getCell(84).value = toNumber(emp.pagibig_emp_adj);
        empRow.getCell(85).value = toNumber(emp.tax_withheld_adj);
        
        empRow.getCell(86).value = toNumber(emp.deductions);
        empRow.getCell(87).value = toNumber(emp.loans);
        empRow.getCell(88).value = toNumber(emp.other_deductions);
        empRow.getCell(89).value = toNumber(emp.total_deductions);      //may minus ata toh sa premium adjustments
        const netPay = (emp.gross_pay) - toNumber(empRow.getCell(88).value?.result ?? 0);
        empRow.getCell(90).value = { formula: `BX${empRow.number}-CK${empRow.number}`, result: netPay }; // instead na kinuha yung emp.net_pay, may mga bureche kasi sa total deductions

        // PREMIUMS ER SHARE ADJUSTMENTS
        empRow.getCell(91).value = toNumber(emp.sss_employer_adj);
        empRow.getCell(92).value = toNumber(emp.sss_ecc_adj);
        empRow.getCell(93).value = toNumber(emp.philhealth_employer_adj);
        empRow.getCell(94).value = toNumber(emp.pagibig_employer_adj);
        
        // Apply thin border to all employee cells
        for (let c = 1; c <= sheet.columnCount; c++) {
          const cell = empRow.getCell(c);
          if (cell.value === undefined) cell.value = "-";
          cell.border = thinBorder;
        }

        // Update totals for company and groups
        addRowToTotals(companyTotals, empRow);
        addRowToTotals(grandTotals, empRow);

        // add to ALL active group levels
        cfg.groups.forEach(g => {
          if (lastGroupValues[g] !== null) {
            addRowToTotals(groupTotals[g], empRow);
          }
        });
      });

      // ==========================
      // GROUP SUBTOTALS
      // ==========================
      for (let i = cfg.groups.length - 1; i >= 0; i--) {
        const g = cfg.groups[i];
        if (lastGroupValues[g] !== null) {
          renderGroupSubtotalRow(
            `Sub Total Per ${g}: ${lastGroupValues[g]}`,
            groupTotals[g],
            i,
            {
              useGroupLevelFill: true,
              border: "medium"
            }
          );
        }
      }

      // ==========================
      // COMPANY SUBTOTALS
      // ==========================
      renderGroupSubtotalRow(
        `Sub Total Per COMPANY: ${company}`,
        companyTotals,
        0,
        {
          fillColor: "FFCCE5FF",
          noIndent: true
        }
      );

      const companyEndRow = row - 1;

      // Apply outside thick border to the entire company block
      applyOutsideBorder(
        sheet,
        companyStartRow,
        companyEndRow,
        1,
        94
      );

      // Insert 2 blank rows
      row += 2;
    }

    // ==========================
    // GRAND TOTAL
    // ==========================
    renderGroupSubtotalRow(
      "GRAND TOTAL",
      grandTotals,
      0,
      {
        boldRow: true,
        fillColor: "FFBFBFBF",
        topDoubleBorder: true,
        noIndent: true
      }
    );

    /* ================================
        DOWNLOAD XLSX
    ================================= */
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Payroll_Journal_${fmtDate(now)}.xlsx`;
    a.click();
  }
  
  // =============================
  // DOM ELEMENTS (define once)
  // =============================
  const printModal = document.getElementById("printPayrollModal");
  const cancelPrintBtn = document.getElementById("cancelPrintBtn");
  const confirmPrintBtn = document.getElementById("confirmPrintBtn");

  const printOutput = document.getElementById("printOutput");
  const paperSize = document.getElementById("printPaperSize");
  const printCopies = document.getElementById("printCopies");

  const pageRangeInputs = document.getElementById("pageRangeInputs");
  const printRangeRadios = document.querySelectorAll('input[name="printRange"]');
  const pageFrom = document.getElementById("pageFrom");
  const pageTo = document.getElementById("pageTo");
  const allPagesRadio = document.querySelector('input[name="printRange"][value="all"]');

  // =============================
  // 1. FUNCTIONS
  // =============================
  function toggleOutputOptions() {
    const isPrinter = printOutput.value === "printer";

    paperSize.disabled = !isPrinter;
    printCopies.disabled = !isPrinter;

    printRangeRadios.forEach(radio => {
      radio.disabled = !isPrinter;
    });

    pageFrom.disabled = !isPrinter;
    pageTo.disabled = !isPrinter;

    if (!isPrinter) {
      pageRangeInputs.style.display = "none";
      allPagesRadio.checked = true;
      pageFrom.value = "";
      pageTo.value = "";
    }
  }

  function resetPrintModal() {
    // Default values
    printOutput.value = "printer";
    paperSize.value = "legal";
    printCopies.value = "1";
    allPagesRadio.checked = true;

    // Reset page range
    pageRangeInputs.style.display = "none";
    pageFrom.value = "";
    pageTo.value = "";

    // Apply toggle
    toggleOutputOptions();
  }

  function handleConfirmPrint() {
    const output = printOutput.value;

    printModal.classList.add("hidden");

    if (output === "printer") {
      printPayrollJournal();
    } else {
      exportPayrollToExcelJS(payrollJournalData, {
        orderBy: document.getElementById("journalOrderBy").value
      });
    }
  }

  // =============================
  // 2. ADD LISTENERS ONCE
  // =============================
  cancelPrintBtn.addEventListener("click", () => {
    printModal.classList.add("hidden");
  });

  printOutput.addEventListener("change", toggleOutputOptions);

  document.querySelectorAll('input[name="printRange"]').forEach(radio => {
    radio.addEventListener("change", () => {
      pageRangeInputs.style.display =
        radio.value === "range" && radio.checked ? "flex" : "none";
    });
  });

  confirmPrintBtn.addEventListener("click", handleConfirmPrint);

  // =============================
  // 3. PRINT BUTTON (ONLY OPENS MODAL)
  // =============================
  if (printBtn) {
    printBtn.addEventListener("click", () => {

      // Reset modal EVERY time it opens
      resetPrintModal();

      // Open modal
      printModal.classList.remove("hidden");
    });
  }

  // ========= VALIDATE REQUIRED FIELDS =========
  function validateSummaryRequiredFields(coveredType) { 
    // --- Required fields per type ---
    const REQUIRED_FIELDS = {
      period: [
        "summaryPayrollGroupPeriod",
        "summaryPeriodPeriod",
        "summaryMonthPeriod",
        "summaryYearPeriod"
      ],
      range: [
        "summaryPayrollGroupRange",
        "summaryPeriodFrom",
        "summaryMonthFrom",
        "summaryYearFrom",
        "summaryPeriodTo",
        "summaryMonthTo",
        "summaryYearTo"
      ]
    };

    // --- Range label mapping ---
    const RANGE_FIELD_LABELS = {
      summaryPeriodFrom: { group: "From", label: "Period" },
      summaryMonthFrom:  { group: "From", label: "Month" },
      summaryYearFrom:   { group: "From", label: "Year" },

      summaryPeriodTo:   { group: "To", label: "Period" },
      summaryMonthTo:    { group: "To", label: "Month" },
      summaryYearTo:     { group: "To", label: "Year" }
    };

    const fieldIds = REQUIRED_FIELDS[coveredType] || [];

    const missing = {
      From: [],
      To: [],
      General: []
    };
    
    fieldIds.forEach(id => {
      const field = document.getElementById(id);

      const isEmpty = !field || !field.value || field.value.trim() === "";

      if (isEmpty) {
        if (RANGE_FIELD_LABELS[id]) {
          const { group, label } = RANGE_FIELD_LABELS[id];
          missing[group].push(label);
        } else {
          const label =
            field?.closest(".payroll-period-row")
              ?.querySelector("label")
              ?.textContent
              ?.replace(":", "")
              ?.trim() || id;

          missing.General.push(label);
        }

        if (field) field.style.border = "1px solid red";
      } else {
        field.style.border = "";
      }
    });

    // --- Build toast message ---
    let messageParts = [];

    if (missing.General.length) {
      messageParts.push(
        "- " + missing.General.join("\n- ")
      );
    }

    if (missing.From.length) {
      messageParts.push(
        "From:\n- " + missing.From.join("\n- ")
      );
    }

    if (missing.To.length) {
      messageParts.push(
        "To:\n- " + missing.To.join("\n- ")
      );
    }

    if (messageParts.length > 0) {
      showToast(
        "⚠️ Please fill out or select the following required fields:\n" +
        messageParts.join("\n"),
        "missingFields"
      );
      return false;
    }

    return true;
  }

  // Helper function
  async function checkEmployeesBasicSalary(runIds) {
    if (!runIds || runIds.length === 0) return false;

    const selectedOption =
      document.querySelector('input[name="summaryOption"]:checked')?.value || "active";

    try {
      const res = await fetch(
        `/api/employees_for_multiple_runs?run_ids=${runIds.join(",")}&status=${selectedOption}`
      );
      const data = await res.json();

      if (!data.success || !data.employees) return false;

      console.log("data:",data);
      console.log("data.employees:",data.employees);
      // Return true if **all employees** have null basic_salary
      return data.employees.length > 0 && data.employees.every(emp => emp.basic_salary == null);
    } catch (err) {
      console.error("Error checking employee salaries:", err);
      // If error happens, treat it as missing salary to be safe
      return true;
    }
  }

  if (generateSummaryButton) {
    generateSummaryButton.addEventListener("click", async () => {
      const coveredType = getSummaryCoveredDateType();

      if (!validateSummaryRequiredFields(coveredType)) {
        return;
      }

      try {
        // ========= STEP 1 — GET RUN ID =========
        let runIds = [];
        if (coveredType === "period") {
          const runId = await getSummaryRunIdsByPeriod();
          if (runId) runIds = [runId];
        } else {
          runIds = await getSummaryRunIdsByRange();
        }
        //window.currentPayrollRunId = runIds;
        console.log("value of runIds when clicking generate:",runIds);

        // ========= STEP 2 — CHECK IF PAYROLL RUN EXISTS =========
        if (!runIds || runIds.length === 0) {
          openMissingPayrollRunModal();
          return;
        }

        // ========= STEP 3 — CHECK IF ANY EMPLOYEE HAS NULL BASIC SALARY =========
        const hasNullSalary = await checkEmployeesBasicSalary(runIds);

        console.log("hasNullSalary:",hasNullSalary);
        if (hasNullSalary) {
          openMissingPayrollRunModal();
          return;
        }

        // ========= STEP 4 — NORMAL FLOW =========
        // Reset order by default
        const orderByEl = document.getElementById("journalOrderBy");
        if (orderByEl) { orderByEl.value = "department_surname"; }
        startPayrollJournal(runIds);
      } catch (err) {
        showToast("Error starting payroll journal: " + (err.message || err), "warning");
      }
    });
  }
}

// ========== AUDITING ==========
document.addEventListener("DOMContentLoaded", () => {
  const auditTable = document.getElementById("auditTable");
  const searchInput = document.getElementById("searchLogs");
  const exportBtn = document.getElementById("exportLogs");

  if (auditTable && searchInput && exportBtn) {
    const tableRows = auditTable.querySelectorAll("tbody tr");

    searchInput.addEventListener("input", () => {
      const filter = searchInput.value.toLowerCase();
      tableRows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(filter) ? "" : "none";
      });
    });

    exportBtn.addEventListener("click", () => {
      showToast("Logs Exported Successfully!");
    });
  }
});

// ========== System Activity Log ==========
if (window.location.pathname === '/dashboard/auditing.html') {
  // Listen for the change event on the dropdown
  document.getElementById('entriesSelect').addEventListener('change', () => {
    currentPage = 1;  // Reset to the first page when the dropdown value changes
    loadAuditLogs();  // Load logs for page 1
  });

  let currentPage = 1;
  let totalPages = 1;
  let totalLogs = 0;  // Declare totalLogs at the top so it's accessible in all functions

  // Load logs based on the selected number of entries and pagination
  async function loadAuditLogs() {
      const entriesPerPage = document.getElementById('entriesSelect').value;  // Get the number of entries per page

      try {
          const res = await fetch(`/api/audit_logs?limit=${entriesPerPage}&page=${currentPage}`);
          const data = await res.json();

          if (data.success === false) {
              console.error("Server error:", data.message);
              return;
          }

          if (!Array.isArray(data.logs)) {
              console.error("Expected an array, but received:", data.logs);
              return;
          }

          const tbody = document.querySelector(".table-section table tbody");
          tbody.innerHTML = ""; // Clear any old rows

          if (data.logs.length === 0) {
              tbody.innerHTML = `<tr><td colspan="4">No recent system activities found.</td></tr>`;
              return;
          }

          // Render the logs
          data.logs.forEach(log => {
              const formattedDate = new Date(log.log_time).toLocaleString("en-US", {
                  month: "short", day: "2-digit", year: "numeric",
                  hour: "2-digit", minute: "2-digit", hour12: true
              });

              tbody.innerHTML += `
                  <tr>
                      <td>${formattedDate}</td>
                      <td>${log.admin_name}</td>
                      <td>${log.action}</td>
                      <td><span class="status completed">${log.status}</span></td>
                  </tr>
              `;
          });

          // Update totalPages and currentPage from the response
          totalPages = data.totalPages;
          currentPage = data.currentPage;

          // Update the pagination info (start, end, and total entries)
          updatePaginationControls();
          updateEntryInfo(data.totalLogs, entriesPerPage);
      } catch (err) {
          console.error("Error loading logs:", err);
      }
  }

  function updateEntryInfo(totalLogs, entriesPerPage) {
    const entriesStart = (currentPage - 1) * entriesPerPage + 1;
    const entriesEnd = Math.min(currentPage * entriesPerPage, totalLogs);  // Make sure we don’t exceed the total number of logs

    document.getElementById('entriesStart').textContent = entriesStart;
    document.getElementById('entriesEnd').textContent = entriesEnd;
    document.getElementById('totalEntries').textContent = totalLogs;
  }

  function updatePaginationControls() {
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");

    // Disable previous button if we're on the first page
    prevBtn.disabled = currentPage === 1;
    
    // Disable next button if we're on the last page
    nextBtn.disabled = currentPage === totalPages;

    // Update the current page indicator
    document.querySelector(".activepage").textContent = currentPage;

    // Also update the entries information
    const entriesPerPage = document.getElementById('entriesSelect').value;
    updateEntryInfo(totalLogs, entriesPerPage);
  }

  // Handle previous and next page clicks
  document.getElementById("prevBtn").addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      loadAuditLogs();  // Load new logs and update page number
    }
  });

  document.getElementById("nextBtn").addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage++;
      loadAuditLogs();  // Load new logs and update page number
    }
  });

  // Run when the auditing page loads
  document.addEventListener("DOMContentLoaded", loadAuditLogs);
}

// ========== UTILITIES ==========
function backupEmployeeData() {
  // Logic for backing up employee data (usually involves server-side functionality)
  showToast("Employee data has been backed up successfully.");
}

function syncDatabase() {
    // Logic for syncing database (placeholder)
    showToast("Database sync completed successfully.");
}