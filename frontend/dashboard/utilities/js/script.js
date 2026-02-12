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
  } catch (err) {
    console.error("Error loading profile:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadProfile();
});

// ========== LIST MANAGER ==========
if (window.location.pathname === '/dashboard/utilities/list_manager.html') {
  const listType = document.getElementById("listType");

  // UI sections
  const standardList = document.getElementById("standardList");
  const allowanceList = document.getElementById("allowanceList");
  const deductionList = document.getElementById("deductionList");
  
  const allButtons = document.querySelectorAll("#actionButtons button");
  const addSection = document.querySelectorAll(".form-row");

  const listBody = document.getElementById("listItemsBody");
  const newItemInput = document.getElementById("newListItem");

  allButtons.forEach(button => button.classList.add('hidden'));
  
  // Add default first option
  if (listType) {
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.disabled = true;
    defaultOption.selected = true;
    defaultOption.textContent = "-- Choose List Type --";

    if (!listType.querySelector('option[value=""]')) {
      listType.insertBefore(defaultOption, listType.firstChild);
    }
  }

  // ===============================
  // UI SWITCHER WHEN LIST TYPE CHANGES
  // ===============================
  function showSection(section) {
    standardList.classList.add("hidden");
    allowanceList.classList.add("hidden");
    deductionList.classList.add("hidden");

    if (section) {
      section.classList.remove("hidden");
      allButtons.forEach(button => button.classList.add('hidden'));
      addSection.forEach(container => container.classList.remove('hidden'));
    }
  }

  window.loadListItems = async function () {
    const category = listType.value;

    // Allowance special UI
    if (category === "allowances") {
      showSection(allowanceList);
      loadAllowances();
      return;
    }

    // Deduction special UI
    if (category === "deductions") {
      showSection(deductionList);
      loadDeductions();
      return;
    }

    // Standard List UI
    showSection(standardList);

    if (!category) return;

    try {
      const res = await fetch(`/api/system_lists?category=${category}`);
      const data = await res.json();
      const inputElement = document.getElementById("newListItem");

      listBody.innerHTML = "";
    
      // Reset its value
      inputElement.value = "";

      if (data.length === 0) {
        listBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#888;">No items found for "${category}"</td></tr>`;
      } else {
        data.forEach((item) => {
          const row = document.createElement("tr");
          row.innerHTML = `
            <td>${item.value}</td>
            <td>
              <button class="btn" onclick="deleteListItem(${item.id}, '${category}')">🗑️ Delete</button>
            </td>`;
          listBody.appendChild(row);
        });
      }
    } catch (err) {
      console.error("Error loading list:", err);
      alert("❌ Error loading list items.");
    }
  };

  // ===============================
  // STANDARD LIST ADD
  // ===============================
  window.addListItem = async function () {
    const category = listType.value;
    const value = newItemInput.value.trim();

    if (!category) showToast("⚠️ Please select a list type first.", "warning");
    if (!value) showToast("⚠️ Please enter a value to add.", "warning");

    try {
      const res = await fetch("/api/system_lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, value }),
      });
      const result = await res.json();

      if (result.success) {
        alert("✅ Item added successfully!");
        newItemInput.value = "";
        loadListItems();
      } else {
        alert("⚠️ Failed to add item.");
      }
    } catch (err) {
      console.error("Error adding list item:", err);
      alert("❌ Server error while adding item.");
    }
  };

  // ===============================
  // DELETE ITEM
  // ===============================
  window.deleteListItem = async function (id, category) {
    if (!confirm("🗑️ Are you sure you want to delete this item?")) return;

    try {
      const res = await fetch(`/api/system_lists/${id}`, { method: "DELETE" });
      const result = await res.json();

      if (result.success) {
        alert("✅ Item deleted successfully!");
        loadListItems();
      } else {
        alert("⚠️ Failed to delete item.");
      }
    } catch (err) {
      console.error("Error deleting list item:", err);
      alert("❌ Server error while deleting item.");
    }
  };

  // ===============================
  // ALLOWANCES AND DEDUCTIONS HANDLER
  // ===============================
  const allowanceType = document.getElementById("allowanceTaxable");
  let selectedId = null;
  let editingRow = null; // Keep track of the row currently being edited
  let originalRowData = null; // Store original cell values

  // Helper function to format numbers with commas and two decimal places
  function formatNumberWithCommas(value) {
    if (value === null || value === undefined || value === "") {
      return "";
    }
    // Convert to a number first if it's a string, then format as a locale-specific string
    return parseFloat(value).toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  }

  function renderRows({
    tbody,
    data,
    columns,
    emptyMessage,
    onRowClick // callback when a row is clicked
  }) {
    tbody.innerHTML = "";

    if (!data || data.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${columns.length}" style="text-align:center; color:#888;">
            ${emptyMessage}
          </td>
        </tr>`;
      return;
    }

    data.forEach(item => {
      const tr = document.createElement("tr");

      tr.innerHTML = columns
        .map(col => {
          const value = typeof col === "function" ? col(item) : item[col];
          return `<td>${value ?? ""}</td>`;
        })
        .join("");

      // attach click listener
      tr.addEventListener("click", (event) => {
        const clickedElement = event.target;
        const tagName = clickedElement.tagName;

        // 1. Restore any previously editing row
        if (editingRow && editingRow !== tr) {
          editingRow.innerHTML = originalRowData.map(val => `<td>${val}</td>`).join("");
          editingRow = null;
          originalRowData = null;
        }
        
        // 2. Clear selection from all rows
        document.querySelectorAll("#allowanceTable tbody tr, #deductionTable tbody tr").forEach(r => r.classList.remove("selected-row"));

        // 3. Show appropriate buttons for this row
        // Check if the clicked element is a form control type
        if (tagName === 'INPUT' || editingRow === tr) {
          tr.classList.add("selected-row");
          console.log("Clicked the editing row or inside an input, preventing to hide some buttons.");
          // Stop executing the rest of the row selection logic
          return; 
        } else {
          const showButtons = ["editButton", "deleteButton"];
          allButtons.forEach(button => button.classList.add('hidden'));
          showButtons.forEach(id => {
            const button = document.getElementById(id);
            if (button) button.classList.remove('hidden');
          });
          addSection.forEach(container => container.classList.remove('hidden'));
        }

        // 4. Mark this row as selected
        tr.classList.add("selected-row");

        // execute callback
        if (typeof onRowClick === "function") {
          onRowClick(item, tr);
        }

        selectedId = item.id;
      });

      tbody.appendChild(tr);
    });
  }
  
  function resetInputFields() {
    const fields = [
      "allowanceName",
      "allowanceTaxable",
      "allowanceAmount",
      "deductionName",
      "deductionAmount"
    ];

    fields.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.value = "";
    });
  }

  // Insert default option if missing
  if (!allowanceType.querySelector('option[value=""]')) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.disabled = true;
    opt.selected = true;
    opt.textContent = "-- Choose Allowance Type --";
    allowanceType.insertBefore(opt, allowanceType.firstChild);
  }

  // Load allowances
  async function loadAllowances() {
    const tbody = document.getElementById("allowanceListBody");

    const res = await fetch("/api/allowances");
    const data = await res.json();

    addSection.forEach(container => container.classList.remove('hidden'));
    allButtons.forEach(button => button.classList.add("hidden"));
    
    resetInputFields();

    renderRows({
      tbody,
      data,
      columns: [
        a => a.name,
        a => a.taxable ? "Taxable" : "Non-Taxable",
        a => formatNumberWithCommas(a.amount)
      ],
      emptyMessage: "No allowance types found.",
      onRowClick: (item, row) => {
        // Store selected row ID
        selectedId = item.allowance_id;

        console.log("Selected allowance:", item);
      }
    });
  }

  // Load deductions    
  async function loadDeductions() {
    const tbody = document.getElementById("deductionListBody");

    const res = await fetch("/api/deductions");
    const data = await res.json();

    addSection.forEach(container => container.classList.remove('hidden'));
    allButtons.forEach(button => button.classList.add("hidden"));
    
    resetInputFields();

    renderRows({
      tbody,
      data,
      columns: [
        d => d.name,
        d => formatNumberWithCommas(d.amount)
      ],
      emptyMessage: "No deduction types found.",
      onRowClick: (item, row) => {
        // Store selected row ID
        selectedId = item.deduction_id;
        
        console.log("Selected deduction:", item);
      }
    });
  }
  
  // === Button Handlers ===
  document.addEventListener("click", async (e) => {
    const id = e.target.id;
    const type = listType.value;

    // =====================================================
    // BACK BUTTON
    // =====================================================
    if (e.target && e.target.id === "backButton") {
      window.location.href = "../utilities.html";
    }

    // =====================================================
    // ADD BUTTON
    // =====================================================
    if (e.target && e.target.id === "addButton") {
      if (type === "allowances") {
        const name = document.getElementById("allowanceName").value.trim();
        let amount = document.getElementById("allowanceAmount").value.trim();
        const taxable = document.getElementById("allowanceTaxable").value === "1";

        if (!name || amount === "")
          showToast("⚠️ Please complete all allowance fields.", "warning");

        amount = parseFloat(amount);
        if (isNaN(amount) || amount < 0)
          showToast("⚠️ Amount must be a valid non-negative number.", "warning");

        try {
          await fetch("/api/allowances", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, taxable, amount }),
          });

          showToast(`✅ Allowance type added successfully!`);
          loadAllowances();
          return;
        } catch (err) {
          console.error("Error adding allowance type:", err);
          showToast("❌ Failed to add allowance type. Check console for details.", "error");
        }
      }

      if (type === "deductions") {
        const name = document.getElementById("deductionName").value.trim();
        let amount = document.getElementById("deductionAmount").value.trim();

        if (!name || amount === "")
          showToast("⚠️ Please complete all deduction fields.", "warning");

        amount = parseFloat(amount);
        if (isNaN(amount) || amount < 0)
          showToast("⚠️ Amount must be a valid non-negative number.", "warning");

        try {
          await fetch("/api/deductions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, amount }),
          });

          showToast(`✅ Deduction type added successfully!`);
          loadDeductions();
          return;
        } catch (err) {
          console.error("Error adding deduction type:", err);
          showToast("❌ Failed to add deduction type. Check console for details.", "error");
        }
      }
    }

    // =====================================================
    // EDIT BUTTON
    // =====================================================
    if (e.target && e.target.id === "editButton") {
      const showButtons = ["saveButton", "cancelButton"];
      const selectedRow = document.querySelector(".selected-row");
      if (!selectedRow) showToast("⚠️ Please select a row to edit.", "warning");

      allButtons.forEach(button => button.classList.add('hidden'));
      addSection.forEach(container => container.classList.add('hidden'));
      showButtons.forEach(id => {
        const button = document.getElementById(id);
        if (button) button.classList.remove('hidden');
      });
      
      resetInputFields();

      // Turn row into editable inputs
      const cells = selectedRow.children;

      originalRowData = Array.from(selectedRow.children).map(td => td.textContent);

      if (type === "allowances") {
        const name = cells[0].innerText;
        const taxable = cells[1].innerText === "Taxable" ? "1" : "0";
        const amount = cells[2].innerText.replace(/,/g, "");

        editingRow = selectedRow;
        
        selectedRow.innerHTML = `
          <td><input type="text" value="${name}"></td>
          <td>
            <select id="allowanceTaxable">
              <option value="1" ${taxable === "1" ? "selected" : ""}>Taxable</option>
              <option value="0" ${taxable === "0" ? "selected" : ""}>Non-Taxable</option>
            </select>
          </td>
          <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${amount}"></td>
        `;
        
        // Get the select element that just inserted
        const allowanceType = selectedRow.querySelector("#allowanceTaxable");

        // Insert default option if missing
        if (!allowanceType.querySelector('option[value=""]')) {
          const opt = document.createElement("option");
          opt.value = "";
          opt.disabled = true;
          opt.textContent = "-- Choose Allowance Type --";
          allowanceType.insertBefore(opt, allowanceType.firstChild);
        }

        return;
      }

      if (type === "deductions") {
        const name = cells[0].innerText;
        const amount = cells[1].innerText.replace(/,/g, "");

        editingRow = selectedRow;
        
        selectedRow.innerHTML = `
          <td><input type="text" value="${name}"></td>
          <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${amount}"></td>
        `;

        return;
      }
    }

    // =====================================================
    // SAVE BUTTON
    // =====================================================
    const saveModal = document.getElementById("saveModal");

    // Open Save Confirmation Modal
    if (e.target && e.target.id === "saveButton") {
      saveModal.classList.remove("hidden");
    }

    // Confirm Save button
    if (e.target && e.target.id === "confirmSaveBtn") {
      saveModal.classList.add("hidden");

      if (type === "allowances") {
        if (!selectedId) showToast("⚠️ No allowance selected.", "warning");
        
        const name = document.getElementById("editAllowanceName").value.trim();
        const taxable = document.getElementById("editAllowanceTaxable").value === "1";
        let amount = parseFloat(document.getElementById("editAllowanceAmount").value.trim());

        if (!name || isNaN(amount))
          showToast("⚠️ Please complete all fields properly.", "warning");

        await fetch(`/api/allowances/${selectedId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, taxable, amount }),
        });

        showToast(`✅ Allowance type updated successfully!`);
        loadAllowances();
        return;
      }

      if (type === "deductions") {
        if (!selectedId) showToast("⚠️ No deduction selected.", "warning");

        const name = document.getElementById("editDeductionName").value.trim();
        let amount = parseFloat(document.getElementById("editDeductionAmount").value.trim());

        if (!name || isNaN(amount))
          rshowToast("⚠️ Please complete all fields properly.", "warning");

        await fetch(`/api/deductions/${selectedId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, amount }),
        });

        showToast(`✅ Deduction type updated successfully!`);
        loadDeductions();
        return;
      }
    }

    // Close Save Confirmation Modal
    if (e.target && e.target.id === "cancelSaveBtn") {
      saveModal.classList.add("hidden");
    }

    // =====================================================
    // DELETE BUTTON
    // =====================================================
    const deleteModal = document.getElementById("deleteModal");

    // Open Delete Confirmation Modal
    if (e.target && e.target.id === "deleteButton") {
      deleteModal.classList.remove("hidden");
    }
    
    // Confirm Delete Button
    if (e.target && e.target.id === "confirmDeleteBtn") {
      const selectedRow = document.querySelector(".selected-row");

      deleteModal.classList.add("hidden");
      
      if (!selectedRow) showToast("⚠️ Please select a row to delete.", "warning");

      if (type === "allowances") {
        if (!selectedId) showToast("⚠️ No allowance selected.", "warning");

        try {
          const user_id = sessionStorage.getItem("user_id");
          const admin_name = sessionStorage.getItem("admin_name");
          
          // Send delete request to backend
          const res = await fetch(`/api/allowances/${selectedId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id, admin_name }),
          });

          showToast(`✅ Allowance type deleted successfully!`);
          loadAllowances();
        } catch (err) {
          console.error("Error deleting Allowance type:", err);
          showToast("❌ Server error while deleting Allowance type.", "error");
        }
      }

      if (type === "deductions") {
        if (!selectedId) showToast("⚠️ No deduction selected.", "warning");

        try {
          const user_id = sessionStorage.getItem("user_id");
          const admin_name = sessionStorage.getItem("admin_name");
          
          // Send delete request to backend
          const res = await fetch(`/api/deductions/${selectedId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id, admin_name }),
          });

          showToast(`✅ Deduction type deleted successfully!`);
          loadDeductions();
        } catch (err) {
          console.error("Error deleting Deduction type:", err);
          showToast("❌ Server error while deleting Deduction type.", "error");
        }
      }
    }

    // Close Delete Confirmation Modal
    if (e.target && e.target.id === "cancelDeleteBtn") {
      deleteModal.classList.add("hidden");
    }
    
    // =====================================================
    // CANCEL BUTTON
    // =====================================================
    const cancelModal = document.getElementById("cancelModal");

    // Open Cancel Confirmation Modal
    if (e.target && e.target.id === "cancelButton") {
      cancelModal.classList.remove("hidden");
    }

    // Confirm Cancel button
    if (e.target && e.target.id === "confirmCancelBtn") {
      cancelModal.classList.add("hidden");

      // === Allowances Table ===
      if (type === "allowances") {
        loadAllowances();
      }

      // === Deductions Table ===
      if (type === "deductions") {
        loadDeductions();
      }
    }

    // Close Cancel Confirmation Modal
    if (e.target && e.target.id === "cancelCancelBtn") {
      cancelModal.classList.add("hidden");
    }
  });
}

// ========== EMPLOYEE BENEFITS ==========
if (window.location.pathname.includes('employee_benefits.html')) {
  const listType = document.getElementById("listType");
  const contributionsListContainer = document.getElementById("contributionsListContainer");
  const taxExemptionsContainer = document.getElementById("taxExemptionsContainer");
  const taxContainer = document.getElementById("taxContainer");
  const regionalWageContainer = document.getElementById("regionalWageContainer");
  const allButtons = document.querySelectorAll("#actionButtons button");
  const inputFields = document.querySelectorAll(".form-row");

  allButtons.forEach(button => button.classList.add('hidden'));

  let selectedId = null;
  let editingRow = null; // Keep track of the row currently being edited
  let originalRowData = null; // Store original cell values

  // Insert default option if missing
  if (!listType.querySelector('option[value=""]')) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.disabled = true;
    opt.selected = true;
    opt.textContent = "-- Choose List Type --";
    listType.insertBefore(opt, listType.firstChild);
  }

  async function loadDropdownData(payPeriodEl, statusEl) {
    try {
      const res = await fetch("/api/tax_exemptions_lists");
      const json = await res.json();

      if (!json.success) throw new Error("Failed to fetch status data");

      const { tax_exemptions } = json;

      // If no elements provided, default to original IDs
      payPeriodEl = payPeriodEl || document.getElementById('payPeriodSelect');
      statusEl = statusEl || document.getElementById('statusSelect');

      // Populate pay period dropdown
      payPeriodEl.innerHTML = '<option value="" disabled selected>-- SELECT --</option>';
      ["Daily", "Weekly", "Semi-Monthly", "Monthly"].forEach(period => {
        const opt = document.createElement("option");
        opt.value = period;
        opt.textContent = period;
        payPeriodEl.appendChild(opt);
      });

      // Populate status dropdown
      statusEl.innerHTML = '<option value="" disabled selected>-- SELECT --</option>';
      tax_exemptions.forEach(item => {
        const opt = document.createElement("option");
        opt.value = item.code;
        opt.textContent = item.code;
        statusEl.appendChild(opt);
      });

    } catch (err) {
      console.error("Error loading status data:", err);
    }
  }

  // Switcher
  function showSection(section) {
    contributionsListContainer.classList.add("hidden");
    taxExemptionsContainer.classList.add("hidden");
    taxContainer.classList.add("hidden");
    regionalWageContainer.classList.add("hidden");

    if (section) {
      section.classList.remove("hidden");
      allButtons.forEach(button => button.classList.add('hidden'));
      inputFields.forEach(container => container.classList.remove('hidden'))
    }
  }

  const TABLE_COLUMNS = {
    sss: [
      { key: "salary_low", label: "Low" },
      { key: "salary_high", label: "High" },
      { key: "ee_share", label: "Employee" },
      { key: "er_share", label: "Employer" },
      { key: "ecc", label: "ECC" },
      { key: "date_effective", label: "Date Effective" }
    ],
    pagibig: [
      { key: "salary_low", label: "Low" },
      { key: "salary_high", label: "High" },
      { key: "ee_share", label: "Employee" },
      { key: "er_share", label: "Employer" },
      { key: "date_effective", label: "Date Effective" }
    ],
    philhealth: [
      { key: "salary_low", label: "Low" },
      { key: "salary_high", label: "High" },
      { key: "ee_share", label: "Employee" },
      { key: "er_share", label: "Employer" },
      { key: "date_effective", label: "Date Effective" }
    ],
    taxExemptions: [
      { key: "code", label: "Code" },
      { key: "description", label: "Description" },
      { key: "amount", label: "Amount" }
    ],
    taxTable: [
      { key: "pay_period", label: "Pay Period" },
      { key: "status", label: "Status" },
      { key: "tax_low", label: "Low" },
      { key: "tax_high", label: "High" },
      { key: "percent_over", label: "%Over" },
      { key: "amount", label: "Amount" }
    ],
    regionalMinimumWageRate: [
      { key: "region_code", label: "Region Code" },
      { key: "region_name", label: "Region Name" },
      { key: "wage_rate", label: "Wage Rate" }
    ]
  };

  function renderTableHeader(type) {
    const columns = TABLE_COLUMNS[type];
    let thead;
    
    if (type === "sss" || type === "pagibig" || type === "philhealth") {
      thead = document.querySelector("#contributionsTable thead");
    } else if (type === "taxExemptions") {
      thead = document.querySelector("#taxExemptionsTable thead");
    } else if (type === "taxTable") {
      thead = document.querySelector("#taxTable thead");
    } else if (type === "regionalMinimumWageRate") {
      thead = document.querySelector("#regionalWageTable thead");
    }

    thead.innerHTML = `
      <tr>
        ${columns.map(col => `<th>${col.label}</th>`).join("")}
      </tr>
    `;
  }

  // Helper function to format numbers with commas and two decimal places
  function formatNumberWithCommas(value) {
    if (value === null || value === undefined || value === "") {
      return "";
    }
    // Convert to a number first if it's a string, then format as a locale-specific string
    return parseFloat(value).toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  }

  function renderRows(data, type) {
    const columns = TABLE_COLUMNS[type];
    let tbody;
    
    if (type === "sss" || type === "pagibig" || type === "philhealth") {
      tbody = document.querySelector("#contributionsTable tbody");
    } else if (type === "taxExemptions") {
      tbody = document.querySelector("#taxExemptionsTable tbody");
    } else if (type === "taxTable") {
      tbody = document.querySelector("#taxTable tbody");
    } else if (type === "regionalMinimumWageRate") {
      tbody = document.querySelector("#regionalWageTable tbody");
    }

    tbody.innerHTML = "";

    data.forEach(row => {
      const tr = document.createElement("tr");

      tr.innerHTML = columns
        .map(col => {
          // Check if the current column key corresponds to a monetary value
          const isMonetary = ["salary_low", "salary_high", "ee_share", "er_share", "ecc", "amount", "tax_low", "tax_high", "percent_over", "wage_rate"].includes(col.key);
          
          let cellValue = row[col.key] ?? "";
          
          if (isMonetary && cellValue !== "") {
            cellValue = formatNumberWithCommas(cellValue);
          }
          
          return `<td>${cellValue}</td>`;
        })
        .join("");

      tr.addEventListener("click", (event) => {
        // --- THE CHECKER ---
        // event.target is the specific element that was clicked (e.g., a TD, an INPUT, a BUTTON)
        const clickedElement = event.target;
        const tagName = clickedElement.tagName; // Returns uppercase tag name (e.g., "INPUT", "DIV", "TD")

        // 1. Restore any previously editing row
        if (editingRow && editingRow !== tr) {
          editingRow.innerHTML = originalRowData.map(val => `<td>${val}</td>`).join("");
          editingRow = null;
          originalRowData = null;
        }

        // 2. Clear selection from all rows
        document.querySelectorAll("#contributionsTable tbody tr, #taxExemptionsTable tbody tr, #taxTable tbody tr, #regionalWageTable tbody tr").forEach(r => r.classList.remove("selected-row"));

        // 3. Show appropriate buttons for this row
        // Check if the clicked element is a form control type
        if (tagName === 'INPUT' || editingRow === tr) {
          tr.classList.add("selected-row");
          console.log("Clicked the editing row or inside an input, preventing to hide some buttons.");
          // Stop executing the rest of the row selection logic
          return; 
        } else {
          const showButtons = ["editButton", "deleteButton"];
          allButtons.forEach(button => button.classList.add('hidden'));
          showButtons.forEach(id => {
            const button = document.getElementById(id);
            if (button) button.classList.remove('hidden');
          });
          inputFields.forEach(container => container.classList.remove('hidden'));
        }

        // 4. Mark this row as selected
        tr.classList.add("selected-row");

        if (listType.value == "sss") {
          tr.dataset.id = row.sss_id;
          selectedId = row.sss_id;
        } else if (listType.value == "pagibig") {
          tr.dataset.id = row.pagibig_id;
          selectedId = row.pagibig_id;
        } else if (listType.value == "philhealth")  {
          tr.dataset.id = row.philhealth_id;
          selectedId = row.philhealth_id;
        } else if (listType.value == "taxExemptions") {
          tr.dataset.id = row.tax_exemption_id;
          selectedId = row.tax_exemption_id;
        } else if (listType.value == "taxTable") {
          tr.dataset.id = row.withholding_tax_id;
          selectedId = row.withholding_tax_id;
        } else if (listType.value == "regionalMinimumWageRate") {
          tr.dataset.id = row.regional_minimum_wage_rate_id;
          selectedId = row.regional_minimum_wage_rate_id;
        }
      });

      tbody.appendChild(tr);
    });
  }

  const eccInputGroup = document.querySelector("#eccInput").closest(".input-group");

  function updateInputVisibility(type) {
    if (type === "pagibig" || type === "philhealth") {
      eccInputGroup.style.display = "none";
    } else {
      eccInputGroup.style.display = "block";
    }
  }
  
  function resetInputFields() {
    const fields = [
      "lowSalaryInput",
      "highSalaryInput",
      "eeInput",
      "erInput",
      "eccInput",
      "dateEffective",
      "codeInput",
      "descriptionInput",
      "taxExemptionInput",
      "payPeriodSelect",
      "statusSelect",
      "lowTaxInput",
      "highTaxInput",
      "percentOver",
      "withholdingTaxInput",
      "regionCodeInput",
      "regionNameInput",
      "wageRateInput"
    ];

    fields.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.value = "";
    });
  }

  // Function to fetch data and render the table based on current listType selection
  async function refreshTableData() {
    const type = listType.value;
    if (!type) return;

    let apiUrl = "";
    let dataKey = "";
    let headerText = "";

    // Determine API endpoint and data key based on the selected type
    if (type === "sss") {
      apiUrl = "/api/sss_contributions_lists";
      dataKey = "sss";
      headerText = "List of SSS Contributions";
    } else if (type === "pagibig") {
      apiUrl = "/api/pagibig_contributions_lists";
      dataKey = "pagibig";
      headerText = "List of Pag-IBIG Contributions";
    } else if (type === "philhealth") {
      apiUrl = "/api/philhealth_contributions_lists";
      dataKey = "philhealth";
      headerText = "List of PhilHealth Contributions";
    } else if (type === "taxExemptions") {
      apiUrl = "/api/tax_exemptions_lists";
      dataKey = "tax_exemptions";
      headerText = "List of Tax Exemptions Contributions";
    } else if (type === "taxTable") {
      apiUrl = "/api/withholding_tax_lists";
      dataKey = "withholding_tax";
      headerText = "Withholding Tax Table";
    } else if (type === "regionalMinimumWageRate") {
      apiUrl = "/api/regional_minimum_wage_rates";
      dataKey = "regional_wage_rates";
      headerText = "Regional Minimum Wage Rates";
    }

    try {
      const res = await fetch(apiUrl);
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      if (type === "sss" || type === "pagibig" || type === "philhealth") {
        const headerElement = document.getElementById("contributionsHeader");
        headerElement.textContent = headerText;
        showSection(contributionsListContainer);
      } else if (type === "taxExemptions") {
        const headerElement = document.getElementById("taxExemptionsHeader");
        headerElement.textContent = headerText;
        showSection(taxExemptionsContainer);
      } else if (type === "taxTable") {
        const headerElement = document.getElementById("taxTableHeader");
        headerElement.textContent = headerText;
        showSection(taxContainer);
      } else if (type === "regionalMinimumWageRate") {
        const headerElement = document.getElementById("regionalWageTableHeader");
        headerElement.textContent = headerText;
        showSection(regionalWageContainer);
      }

      renderTableHeader(type);
      renderRows(data[dataKey], type);
      updateInputVisibility(type);
      resetInputFields();
    } catch (err) {
      console.error(`Error loading ${type}:`, err);
      showToast(`❌ Failed to load ${type} data.`, "error");
    }
  }

  // Load Contributions Table When Selected
  listType.addEventListener("change", async () => {
    refreshTableData();

    // === SSS Table ===
    if (listType.value === "sss") {
      try {
        const res = await fetch("/api/sss_contributions_lists");
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        const headerElement = document.getElementById("contributionsHeader");
        headerElement.textContent = "List of SSS Contributions";

        renderTableHeader("sss");
        renderRows(data.sss, "sss");
        updateInputVisibility("sss");
      } catch (err) {
        console.error("Error loading SSS:", err);
      }

      showSection(contributionsListContainer);
    }
    
    // === Pag-IBIG Table ===
    else if (listType.value === "pagibig") {
      try {
        const res = await fetch("/api/pagibig_contributions_lists");
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        
        const headerElement = document.getElementById("contributionsHeader");
        headerElement.textContent = "List of Pag-IBIG Contributions";

        renderTableHeader("pagibig");
        renderRows(data.pagibig, "pagibig");
        updateInputVisibility("pagibig");
      } catch (err) {
        console.error("Error loading Pag-IBIG:", err);
      }

      showSection(contributionsListContainer);
    }

    // === PhilHealth Table ===
    else if (listType.value === "philhealth") {
      try {
        const res = await fetch("/api/philhealth_contributions_lists");
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        
        const headerElement = document.getElementById("contributionsHeader");
        headerElement.textContent = "List of PhilHealth Contributions";

        renderTableHeader("philhealth");
        renderRows(data.philhealth, "philhealth");
        updateInputVisibility("philhealth");
      } catch (err) {
        console.error("Error loading PhilHealth:", err);
      }

      showSection(contributionsListContainer);
    }
    
    // === Tax Exemptions Table ===
    else if (listType.value === "taxExemptions") {
      try {
        const res = await fetch("/api/tax_exemptions_lists");
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        
        const headerElement = document.getElementById("taxExemptionsHeader");
        headerElement.textContent = "List of Tax Exemptions";

        renderTableHeader("taxExemptions");
        renderRows(data.tax_exemptions, "taxExemptions");
      } catch (err) {
        console.error("Error loading Tax Exemptions:", err);
      }

      showSection(taxExemptionsContainer);
    }
    
    // === Tax Table ===
    else if (listType.value === "taxTable") {
      try {
        const res = await fetch("/api/withholding_tax_lists");
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        
        const headerElement = document.getElementById("taxTableHeader");
        headerElement.textContent = "Withholding Tax Table";

        loadDropdownData();
        renderTableHeader("taxTable");
        renderRows(data.withholding_tax, "taxTable");
      } catch (err) {
        console.error("Error loading Withholding Tax:", err);
      }

      showSection(taxContainer);
    }
    
    // === Regional Minimum Wage Table ===
    else if (listType.value === "regionalMinimumWageRate") {
      try {
        const res = await fetch("/api/regional_minimum_wage_rates");
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        
        const headerElement = document.getElementById("regionalWageTableHeader");
        headerElement.textContent = "Regional Minimum Wage Rates";

        loadDropdownData();
        renderTableHeader("regionalMinimumWageRate");
        renderRows(data.regional_wage_rates, "regionalMinimumWageRate");
      } catch (err) {
        console.error("Error loading Regional Minimum Wage Rates:", err);
      }

      showSection(regionalWageContainer);
    }
  });

  // === Button Handlers ===
  document.addEventListener("click", async (e) => {
    // === BACK BUTTON ===
    if (e.target && e.target.id === "backButton") {
      window.location.href = "../utilities.html";
    }
    
    // === ADD BUTTON ===
    if (e.target && e.target.id === "addButton") {
      allButtons.forEach(button => button.classList.add('hidden'));
      
      if (!contributionsListContainer.classList.contains("hidden")) {
        let low = document.getElementById("lowSalaryInput").value.trim();
        let high = document.getElementById("highSalaryInput").value.trim();
        let ee = document.getElementById("eeInput").value.trim();
        let er = document.getElementById("erInput").value.trim();
        let ecc = document.getElementById("eccInput").value.trim();
        const date = document.getElementById("dateEffective").value.trim();

        if (eccInputGroup.style.display == "none") {
          if (low === "" || high === "" || ee === "" || er === "" || !date) return showToast("⚠️ Please complete all contribution fields.", "warning");
        } else {
          if (low === "" || high === "" || ee === "" || er === "" || ecc === "" || !date) return showToast("⚠️ Please complete all contribution fields.", "warning");
        }

        // Convert amount to number and validate
        low = parseFloat(low);
        high = parseFloat(high);
        ee = parseFloat(ee);
        er = parseFloat(er);
        ecc = parseFloat(ecc);

        if (eccInputGroup.style.display == "none") {
          if (isNaN(low) || low < 0 || isNaN(high) || high < 0 || isNaN(ee) || ee < 0 || isNaN(er) || er < 0 ) return showToast("⚠️ Input must be a valid non-negative number.", "warning");
        } else {
          if (isNaN(low) || low < 0 || isNaN(high) || high < 0 || isNaN(ee) || ee < 0 || isNaN(er) || er < 0 || isNaN(ecc) || ecc < 0 ) return showToast("⚠️ Input must be a valid non-negative number.", "warning");
        }

        // === SSS Table ===
        if (listType.value === "sss") {
          try {
            await fetch("/api/add_sss_contributions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ low, high, ee, er, ecc, date }),
            });

            showToast(`✅ SSS contribution added successfully!`);
            await refreshTableData(); 
          } catch (err) {
            console.error("Error adding sss contribution:", err);
            showToast("❌ Failed to add sss contribution. Check console for details.", "error");
          }
        }
        
        // === Pag-IBIG Table ===
        else if (listType.value === "pagibig") {
          try {
            await fetch("/api/add_pagibig_contributions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ low, high, ee, er, date }),
            });

            showToast(`✅ Pag-IBIG contribution added successfully!`);
            await refreshTableData();
          } catch (err) {
            console.error("Error adding pagibig contribution:", err);
            showToast("❌ Failed to add pagibig contribution. Check console for details.", "error");
          }
        }

        // === PhilHealth Table ===
        if (listType.value === "philhealth") {
          try {
            await fetch("/api/add_philhealth_contributions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ low, high, ee, er, date }),
            });

            showToast(`✅ PhilHealth contribution added successfully!`);
            await refreshTableData();
          } catch (err) {
            console.error("Error adding philhealth contribution:", err);
            showToast("❌ Failed to add philhealth contribution. Check console for details.", "error");
          }
        }
      } else if (!taxExemptionsContainer.classList.contains("hidden")) {
        let code = document.getElementById("codeInput").value.trim();
        let description = document.getElementById("descriptionInput").value.trim();
        let amount = document.getElementById("taxExemptionInput").value.trim();

        if (!code || !description || amount === "") return showToast("⚠️ Please complete all tax exemption fields.", "warning");

        // Convert amount to number and validate
        amount = parseFloat(amount);

        if (isNaN(amount) || amount < 0) return showToast("⚠️ Amount must be a valid non-negative number.", "warning");
        
        try {
          await fetch("/api/add_tax_exemptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, description, amount }),
          });

          showToast(`✅ Tax exemption added successfully!`);
          await refreshTableData();
        } catch (err) {
          console.error("Error adding tax exemption:", err);
          showToast("❌ Failed to add tax exemption. Check console for details.", "error");
        }
      } else if (!taxContainer.classList.contains("hidden")) {
        let pay_period = document.getElementById("payPeriodSelect").value.trim();
        let status = document.getElementById("statusSelect").value.trim();
        let tax_low = document.getElementById("lowTaxInput").value.trim();
        let tax_high = document.getElementById("highTaxInput").value.trim();
        let percent_over = document.getElementById("percentOver").value.trim();
        let amount = document.getElementById("withholdingTaxInput").value.trim();

        if (!pay_period || !status || tax_low === ""|| tax_high === ""|| percent_over === ""|| amount === "") return showToast("⚠️ Please complete all tax exemption fields.", "warning");

        // Convert amount to number and validate
        tax_low = parseFloat(tax_low);
        tax_high = parseFloat(tax_high);
        percent_over = parseFloat(percent_over);
        amount = parseFloat(amount);

        if (isNaN(tax_low) || tax_low < 0 || isNaN(tax_high) || tax_high < 0 || isNaN(percent_over) || percent_over < 0 || isNaN(amount) || amount < 0) return showToast("⚠️ Input must be a valid non-negative number.", "warning");
        
        try {
          await fetch("/api/add_withholding_tax", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pay_period, status, tax_low, tax_high, percent_over, amount }),
          });

          showToast(`✅ Withholding Tax added successfully!`);
          await refreshTableData();
        } catch (err) {
          console.error("Error adding withholding Tax:", err);
          showToast("❌ Failed to add withholding Tax. Check console for details.", "error");
        }
      }else if (!regionalWageContainer.classList.contains("hidden")) {
        let region_code = document.getElementById("regionCodeInput").value.trim();
        let region_name = document.getElementById("regionNameInput").value.trim();
        let wage_rate = document.getElementById("wageRateInput").value.trim();

        // Check if all fields are filled
        if (!region_code || !region_name || wage_rate === "") 
          return showToast("⚠️ Please complete all minimum wage fields.", "warning");

        // Convert wage_rate to number and validate
        wage_rate = parseFloat(wage_rate);

        if (isNaN(wage_rate) || wage_rate < 0) 
          return showToast("⚠️ Wage rate must be a valid non-negative number.", "warning");

        try {
          await fetch("/api/add_regional_minimum_wage_rate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ region_code, region_name, wage_rate }),
          });

          showToast("✅ Minimum Wage added successfully!");
          await refreshTableData();
        } catch (err) {
          console.error("Error adding minimum wage:", err);
          showToast("❌ Failed to add minimum wage. Check console for details.", "error");
        }
      }
    };
    
    // === EDIT BUTTON ===
    if (e.target && e.target.id === "editButton") {
      const showButtons = ["saveButton", "cancelButton"];
      allButtons.forEach(button => button.classList.add('hidden'));
      inputFields.forEach(container => container.classList.add('hidden'));
      resetInputFields();

      showButtons.forEach(id => {
        const button = document.getElementById(id);
        if (button) button.classList.remove('hidden');
      });

      let tr;

      if (listType.value === "sss" || listType.value === "pagibig" || listType.value === "philhealth") {
        tr =  document.querySelector(`#contributionsTable tbody tr.selected-row`);
      } else if (listType.value === "taxExemptions") {
        tr = document.querySelector(`#taxExemptionsTable tbody tr.selected-row`);
      } else if (listType.value === "taxTable") {
        tr = document.querySelector(`#taxTable tbody tr.selected-row`);
      } else if (listType.value === "regionalMinimumWageRate") {
        tr = document.querySelector(`#regionalWageTable tbody tr.selected-row`);
      }

      // Save original data
      originalRowData = Array.from(tr.children).map(td => td.textContent);

      // Remove commas for numeric inputs
      const cleanValues = originalRowData.map((val, index) => {
        // First 6 columns are numeric in the tables
        if (index >= 0 && index <= 5) {
          return val.replace(/,/g, ''); // Remove commas
        }
        return val; // For date or non-numeric columns
      });

      // === SSS Table ===
      if (listType.value == "sss") {
        // Make the selected row editable
        if (selectedId) {
          if (tr) {
            editingRow = tr;

            tr.innerHTML = `
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[0]}"></td>
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[1]}"></td>
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[2]}"></td>
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[3]}"></td>
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[4]}"></td>
              <td><input type="date" value="${cleanValues[5]}"></td>
            `;
          }
        }
      }

      // === Pag-IBIG Table ===
      else if (listType.value == "pagibig") {
        // Make the selected row editable
        if (selectedId) {
          if (tr) {
            editingRow = tr;

            tr.innerHTML = `
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[0]}"></td>
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[1]}"></td>
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[2]}"></td>
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[3]}"></td>
              <td><input type="date" value="${cleanValues[4]}"></td>
            `;
          }
        }
      }

      // === PhilHealth Table ===
      else if (listType.value == "philhealth") {
        // Make the selected row editable
        if (selectedId) {
          if (tr) {
            editingRow = tr;

            tr.innerHTML = `
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[0]}"></td>
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[1]}"></td>
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[2]}"></td>
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[3]}"></td>
              <td><input type="date" value="${cleanValues[4]}"></td>
            `;
          }
        }
      }

      // === Tax Exemptions Table ===
      else if (listType.value == "taxExemptions") {
        // Make the selected row editable
        if (selectedId) {
          if (tr) {
            editingRow = tr;

            tr.innerHTML = `
              <td><input type="text" placeholder="Tax code..." value="${cleanValues[0]}"></td>
              <td><input type="text" placeholder="Tax description..." value="${cleanValues[1]}"></td>
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[2]}"></td>
            `;
          }
        }
      }

      // === Withholding Tax Table ===
      else if (listType.value == "taxTable") {
        // Make the selected row editable
        if (selectedId) {
          if (tr) {
            editingRow = tr;

            tr.innerHTML = `
              <td><select id="editPayPeriod"></select></td>
              <td><select id="editStatus"></select></td>
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[2]}"></td>
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[3]}"></td>
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[4]}"></td>
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[5]}"></td>
            `;

            // Reuse your dropdown loader!
            const editPayPeriod = tr.querySelector('#editPayPeriod');
            const editStatus = tr.querySelector('#editStatus');

            await loadDropdownData(editPayPeriod, editStatus);

            // Optional: auto-select previous values
            editPayPeriod.value = cleanValues[0];
            editStatus.value = cleanValues[1];
          }
        }
      }
      
      // === Minimum Wage Table ===
      else if (listType.value == "regionalMinimumWageRate") {
        // Make the selected row editable
        if (selectedId) {
          if (tr) {
            editingRow = tr;

            tr.innerHTML = `
              <td><input type="text" maxlength="15" placeholder="e.g., NCR" value="${cleanValues[0]}"></td>
              <td><input type="text" maxlength="50" ceholder="e.g., National Capital Region" value="${cleanValues[1]}"></td>
              <td><input type="number" step="0.01" min="0" placeholder="0.00" value="${cleanValues[2]}"></td>
            `;
          }
        }
      }
    }

    // === DELETE BUTTON ===
    const deleteModal = document.getElementById("deleteModal");

    // Open Delete Confirmation Modal
    if (e.target && e.target.id === "deleteButton") {
      deleteModal.classList.remove("hidden");
    }

    // Confirm Delete Button
    if (e.target && e.target.id === "confirmDeleteBtn") {
      deleteModal.classList.add("hidden");
      allButtons.forEach(button => button.classList.add('hidden'));

      // === SSS Table ===
      if (listType.value == "sss") {
        const tr = document.querySelector(`#contributionsTable tbody tr.selected-row`);

        if (!tr) {
          showToast("⚠️ No SSS contribution selected!", "warning");
          return;
        }

        try {
          const user_id = sessionStorage.getItem("user_id");
          const admin_name = sessionStorage.getItem("admin_name");

          // Send delete request to backend
          const res = await fetch(`/api/sss_contributions_lists/${selectedId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id, admin_name }),
          });

          // Parse response JSON
          const data = await res.json();

          if (!res.ok || !data.success) {
            showToast(`⚠️ Failed to delete SSS contribution || "Unknown error"}`, "warning");
            deleteModal.classList.add("hidden");
            return;
          }

          showToast(`✅ SSS contribution deleted successfully!`);
          refreshTableData();
        } catch (err) {
          console.error("Error deleting SSS contribution:", err);
          showToast("❌ Server error while deleting SSS contribution.", "error");
        }
      }
      
      // === Pag-IBIG Table ===
      else if (listType.value == "pagibig") {
        const tr = document.querySelector(`#contributionsTable tbody tr.selected-row`);

        if (!tr) {
          showToast("⚠️ No Pag-IBIG contribution selected!", "warning");
          return;
        }

        try {
          const user_id = sessionStorage.getItem("user_id");
          const admin_name = sessionStorage.getItem("admin_name");

          // Send delete request to backend
          const res = await fetch(`/api/pagibig_contributions_lists/${selectedId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id, admin_name }),
          });

          // Parse response JSON
          const data = await res.json();

          if (!res.ok || !data.success) {
            showToast(`⚠️ Failed to delete Pag-IBIG contribution || "Unknown error"}`, "warning");
            deleteModal.classList.add("hidden");
            return;
          }

          showToast(`✅ Pag-IBIG contribution deleted successfully!`);
          await refreshTableData(); 
          } catch (err) {
          console.error("Error deleting Pag-IBIG contribution:", err);
          showToast("❌ Server error while deleting Pag-IBIG contribution.", "error");
        }
      }
      
      // === PhilHealth Table ===
      else if (listType.value == "philhealth") {
        const tr = document.querySelector(`#contributionsTable tbody tr.selected-row`);

        if (!tr) {
          showToast("⚠️ No PhilHealth contribution selected!", "warning");
          return;
        }

        try {
          const user_id = sessionStorage.getItem("user_id");
          const admin_name = sessionStorage.getItem("admin_name");

          // Send delete request to backend
          const res = await fetch(`/api/philhealth_contributions_lists/${selectedId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id, admin_name }),
          });

          // Parse response JSON
          const data = await res.json();

          if (!res.ok || !data.success) {
            showToast(`⚠️ Failed to delete PhilHealth contribution || "Unknown error"}`, "warning");
            deleteModal.classList.add("hidden");
            return;
          }

          showToast(`✅ PhilHealth contribution deleted successfully!`);
          await refreshTableData(); 
          } catch (err) {
          console.error("Error deleting PhilHealth contribution:", err);
          showToast("❌ Server error while deleting PhilHealth contribution.", "error");
        }
      }
      
      // === Tax Exemptions Table ===
      else if (listType.value == "taxExemptions") {
        const tr = document.querySelector(`#taxExemptionsTable tbody tr.selected-row`);

        if (!tr) {
          showToast("⚠️ No Tax Exemption selected!", "warning");
          return;
        }

        try {
          const user_id = sessionStorage.getItem("user_id");
          const admin_name = sessionStorage.getItem("admin_name");

          // Send delete request to backend
          const res = await fetch(`/api/tax_exemptions_lists/${selectedId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id, admin_name }),
          });

          // Parse response JSON
          const data = await res.json();

          if (!res.ok || !data.success) {
            showToast(`⚠️ Failed to delete Tax Exemption || "Unknown error"}`, "warning");
            deleteModal.classList.add("hidden");
            return;
          }

          showToast(`✅ Tax Exemption deleted successfully!`);
          await refreshTableData(); 
          } catch (err) {
          console.error("Error deleting Tax Exemption:", err);
          showToast("❌ Server error while deleting Tax Exemption.", "error");
        }
      }
      
      // === Withholding Tax Table ===
      else if (listType.value == "taxTable") {
        const tr = document.querySelector(`#taxTable tbody tr.selected-row`);

        if (!tr) {
          showToast("⚠️ No Withholding Tax selected!", "warning");
          return;
        }

        try {
          const user_id = sessionStorage.getItem("user_id");
          const admin_name = sessionStorage.getItem("admin_name");

          // Send delete request to backend
          const res = await fetch(`/api/withholding_tax_lists/${selectedId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id, admin_name }),
          });

          // Parse response JSON
          const data = await res.json();

          if (!res.ok || !data.success) {
            showToast(`⚠️ Failed to delete Withholding Tax || "Unknown error"}`, "warning");
            deleteModal.classList.add("hidden");
            return;
          }

          showToast(`✅ Withholding Tax deleted successfully!`);
          await refreshTableData(); 
          } catch (err) {
          console.error("Error deleting Withholding Tax:", err);
          showToast("❌ Server error while deleting Withholding Tax.", "error");
        }
      }

      // === Minimum Wage Table ===
      else if (listType.value == "regionalMinimumWageRate") {
        const tr = document.querySelector(`#regionalWageTable tbody tr.selected-row`);

        if (!tr) {
          showToast("⚠️ No Minimum Wage selected!", "warning");
          return;
        }

        try {
          const user_id = sessionStorage.getItem("user_id");
          const admin_name = sessionStorage.getItem("admin_name");

          // Send delete request to backend
          const res = await fetch(`/api/regional_minimum_wage_rates/${selectedId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id, admin_name }),
          });

          // Parse response JSON
          const data = await res.json();

          if (!res.ok || !data.success) {
            showToast(`⚠️ Failed to delete Minimum Wage || "Unknown error"}`, "warning");
            deleteModal.classList.add("hidden");
            return;
          }

          showToast(`✅ Minimum Wage deleted successfully!`);
          await refreshTableData();
        } catch (err) {
          console.error("Error deleting Minimum Wage:", err);
          showToast("❌ Server error while deleting Minimum Wage.", "error");
        }
      }
    }

    // Close Delete Confirmation Modal
    if (e.target && e.target.id === "cancelDeleteBtn") {
      deleteModal.classList.add("hidden");
    }
    
    // === SAVE BUTTON ===
    const saveModal = document.getElementById("saveModal");

    // Open Save Confirmation Modal
    if (e.target && e.target.id === "saveButton") {
      saveModal.classList.remove("hidden");
    }

    // Confirm Save button
    if (e.target && e.target.id === "confirmSaveBtn") {
      if (!editingRow || !selectedId) return;

      saveModal.classList.add("hidden");
      allButtons.forEach(button => button.classList.add('hidden'));
      inputFields.forEach(container => container.classList.remove('hidden'));

      // === SSS Table ===
      if (listType.value == "sss") {
        // Get updated values from inputs
        const inputs = editingRow.querySelectorAll("input");
        const updated = {
          salary_low: inputs[0].value,
          salary_high: inputs[1].value,
          ee_share: inputs[2].value,
          er_share: inputs[3].value,
          ecc: inputs[4].value,
          date_effective: inputs[5].value
        };
        
        try {
          // Send update request to backend
          const res = await fetch(`/api/sss_contributions_lists/${selectedId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated)
          });

          const data = await res.json();

          // Replace row with updated values
          editingRow.innerHTML = `
            <td>${updated.salary_low}</td>
            <td>${updated.salary_high}</td>
            <td>${updated.ee_share}</td>
            <td>${updated.er_share}</td>
            <td>${updated.ecc}</td>
            <td>${updated.date_effective}</td>
          `;

          editingRow.classList.remove("selected-row");
          editingRow = null;
          originalRowData = null;

          if (!res.ok || !data.success) {
            showToast(`⚠️ Failed to update SSS contribution || "Unknown error"}`, "warning");
            saveModal.classList.add("hidden");
            return;
          }

          showToast(`✅ SSS contribution updated successfully!`);
          refreshTableData();
          } catch (err) {
          console.error("Error saving SSS contribution:", err);
          showToast("❌ Server error while saving SSS contribution.", "error");
        }
      }
      
      // === Pag-IBIG Table ===
      else if (listType.value == "pagibig") {
        // Get updated values from inputs
        const inputs = editingRow.querySelectorAll("input");
        const updated = {
          salary_low: inputs[0].value,
          salary_high: inputs[1].value,
          ee_share: inputs[2].value,
          er_share: inputs[3].value,
          date_effective: inputs[4].value
        };
        
        try {
          // Send update request to backend
          const res = await fetch(`/api/pagibig_contributions_lists/${selectedId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated)
          });

          const data = await res.json();

          // Replace row with updated values
          editingRow.innerHTML = `
            <td>${updated.salary_low}</td>
            <td>${updated.salary_high}</td>
            <td>${updated.ee_share}</td>
            <td>${updated.er_share}</td>
            <td>${updated.date_effective}</td>
          `;

          editingRow.classList.remove("selected-row");
          editingRow = null;
          originalRowData = null;

          if (!res.ok || !data.success) {
            showToast(`⚠️ Failed to update Pag-IBIG contribution || "Unknown error"}`, "warning");
            saveModal.classList.add("hidden");
            return;
          }

          showToast(`✅ Pag-IBIG contribution updated successfully!`);
          refreshTableData();
          } catch (err) {
          console.error("Error saving Pag-IBIG contribution:", err);
          showToast("❌ Server error while saving Pag-IBIG contribution.", "error");
        }
      }
      
      // === PhilHealth Table ===
      else if (listType.value == "philhealth") {
        // Get updated values from inputs
        const inputs = editingRow.querySelectorAll("input");
        const updated = {
          salary_low: inputs[0].value,
          salary_high: inputs[1].value,
          ee_share: inputs[2].value,
          er_share: inputs[3].value,
          date_effective: inputs[4].value
        };
        
        try {
          // Send update request to backend
          const res = await fetch(`/api/philhealth_contributions_lists/${selectedId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated)
          });

          const data = await res.json();

          // Replace row with updated values
          editingRow.innerHTML = `
            <td>${updated.salary_low}</td>
            <td>${updated.salary_high}</td>
            <td>${updated.ee_share}</td>
            <td>${updated.er_share}</td>
            <td>${updated.date_effective}</td>
          `;

          editingRow.classList.remove("selected-row");
          editingRow = null;
          originalRowData = null;

          if (!res.ok || !data.success) {
            showToast(`⚠️ Failed to update PhilHealth contribution || "Unknown error"}`, "warning");
            saveModal.classList.add("hidden");
            return;
          }

          showToast(`✅ PhilHealth contribution updated successfully!`);
          refreshTableData();
          } catch (err) {
          console.error("Error saving PhilHealth contribution:", err);
          showToast("❌ Server error while saving PhilHealth contribution.", "error");
        }
      }
      
      // === Tax Exemptions Table ===
      else if (listType.value == "taxExemptions") {
        // Get updated values from inputs
        const inputs = editingRow.querySelectorAll("input");
        const updated = {
          code: inputs[0].value,
          description: inputs[1].value,
          amount: inputs[2].value
        };
        
        try {
          // Send update request to backend
          const res = await fetch(`/api/tax_exemptions_lists/${selectedId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated)
          });

          const data = await res.json();

          // Replace row with updated values
          editingRow.innerHTML = `
            <td>${updated.code}</td>
            <td>${updated.description}</td>
            <td>${updated.amount}</td>
          `;

          editingRow.classList.remove("selected-row");
          editingRow = null;
          originalRowData = null;

          if (!res.ok || !data.success) {
            showToast(`⚠️ Failed to update Tax Exemptions || "Unknown error"}`, "warning");
            saveModal.classList.add("hidden");
            return;
          }

          showToast(`✅ Tax Exemptions updated successfully!`);
          refreshTableData();
          } catch (err) {
          console.error("Error saving Tax Exemptions:", err);
          showToast("❌ Server error while saving Tax Exemptions.", "error");
        }
      }
      
      // === Withholding Tax Table ===
      else if (listType.value == "taxTable") {
        // Get updated values from inputs and selects
        const payPeriodSelect = editingRow.querySelector("select#editPayPeriod");
        const statusSelect = editingRow.querySelector("select#editStatus");
        const inputs = editingRow.querySelectorAll("input");
        const updated = {
          pay_period: payPeriodSelect.value,
          status: statusSelect.value,
          tax_low: inputs[0].value,
          tax_high: inputs[1].value,
          percent_over: inputs[2].value,
          amount: inputs[3].value
        };
        
        try {
          // Send update request to backend
          const res = await fetch(`/api/withholding_tax_lists/${selectedId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated)
          });

          const data = await res.json();

          if (!res.ok || !data.success) {
            showToast(`⚠️ Failed to update Withholding Tax || "Unknown error"}`, "warning");
            saveModal.classList.add("hidden");
            return;
          }

          // Replace row with updated values
          editingRow.innerHTML = `
            <td>${updated.pay_period}</td>
            <td>${updated.status}</td>
            <td>${updated.tax_low}</td>
            <td>${updated.tax_high}</td>
            <td>${updated.percent_over}</td>
            <td>${updated.amount}</td>
          `;

          editingRow.classList.remove("selected-row");
          editingRow = null;
          originalRowData = null;

          showToast(`✅ Withholding Tax updated successfully!`);
          refreshTableData();
          } catch (err) {
          console.error("Error saving Withholding Tax:", err);
          showToast("❌ Server error while saving Withholding Tax.", "error");
        }
      }

      // === Minimum Wage Table ===
      else if (listType.value == "regionalMinimumWageRate") {
        // Get updated values from inputs
        const inputs = editingRow.querySelectorAll("input");
        const updated = {
          region_code: inputs[0].value.trim(),
          region_name: inputs[1].value.trim(),
          wage_rate: parseFloat(inputs[2].value.trim())
        };

        // Validation
        if (!updated.region_code || !updated.region_name || isNaN(updated.wage_rate) || updated.wage_rate < 0) {
          return showToast("⚠️ Please complete all fields with valid values.", "warning");
        }

        try {
          // Send update request to backend
          const res = await fetch(`/api/regional_minimum_wage_rates/${selectedId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated)
          });

          const data = await res.json();

          if (!res.ok || !data.success) {
            showToast(`⚠️ Failed to update Minimum Wage || "Unknown error"}`, "warning");
            saveModal.classList.add("hidden");
            return;
          }

          // Replace row with updated values
          editingRow.innerHTML = `
            <td>${updated.region_code}</td>
            <td>${updated.region_name}</td>
            <td>${updated.wage_rate.toFixed(2)}</td>
          `;

          editingRow.classList.remove("selected-row");
          editingRow = null;
          originalRowData = null;

          showToast(`✅ Minimum Wage updated successfully!`);
          refreshTableData();
        } catch (err) {
          console.error("Error saving Minimum Wage:", err);
          showToast("❌ Server error while saving Minimum Wage.", "error");
        }
      }
    }

    // Close Save Confirmation Modal
    if (e.target && e.target.id === "cancelSaveBtn") {
      saveModal.classList.add("hidden");
    }

    // === CANCEL BUTTON ===
    const cancelModal = document.getElementById("cancelModal");

    // Open Cancel Confirmation Modal
    if (e.target && e.target.id === "cancelButton") {
      cancelModal.classList.remove("hidden");
    }

    // Confirm Cancel button
    if (e.target && e.target.id === "confirmCancelBtn") {
      cancelModal.classList.add("hidden");
      inputFields.forEach(container => container.classList.remove('hidden'));
      allButtons.forEach(button => button.classList.add("hidden"));

      // === SSS Table ===
      if (listType.value == "sss") {
        if (editingRow) {
          // Revert the row to its original data
          editingRow.innerHTML = originalRowData.map(val => `<td>${val}</td>`).join("");

          // Clear editing state
          editingRow = null;
          originalRowData = null;

          // Deselect all rows
          document.querySelectorAll("#contributionsTable tbody tr").forEach(r => r.classList.remove("selected-row"));

          selectedId = null; // No row is selected now
        }
      }

      // === Pag-IBIG Table ===
      else if (listType.value == "pagibig") {
        if (editingRow) {
          // Revert the row to its original data
          editingRow.innerHTML = originalRowData.map(val => `<td>${val}</td>`).join("");

          // Clear editing state
          editingRow = null;
          originalRowData = null;

          // Deselect all rows
          document.querySelectorAll("#contributionsTable tbody tr").forEach(r => r.classList.remove("selected-row"));

          selectedId = null; // No row is selected now
        }
      }
      
      // === PhilHealth Table ===
      else if (listType.value == "philhealth") {
        if (editingRow) {
          // Revert the row to its original data
          editingRow.innerHTML = originalRowData.map(val => `<td>${val}</td>`).join("");

          // Clear editing state
          editingRow = null;
          originalRowData = null;

          // Deselect all rows
          document.querySelectorAll("#contributionsTable tbody tr").forEach(r => r.classList.remove("selected-row"));

          selectedId = null; // No row is selected now
        }
      }
      
      // === Tax Exemptions Table ===
      else if (listType.value == "taxExemptions") {
        if (editingRow) {
          // Revert the row to its original data
          editingRow.innerHTML = originalRowData.map(val => `<td>${val}</td>`).join("");

          // Clear editing state
          editingRow = null;
          originalRowData = null;

          // Deselect all rows
          document.querySelectorAll("#taxExemptionsTable tbody tr").forEach(r => r.classList.remove("selected-row"));

          selectedId = null; // No row is selected now
        }
      }
      
      // === Withholding Tax Table ===
      else if (listType.value == "taxTable") {
        if (editingRow) {
          // Revert the row to its original data
          editingRow.innerHTML = originalRowData.map(val => `<td>${val}</td>`).join("");

          // Clear editing state
          editingRow = null;
          originalRowData = null;

          // Deselect all rows
          document.querySelectorAll("#taxTable tbody tr").forEach(r => r.classList.remove("selected-row"));

          selectedId = null; // No row is selected now
        }
      }

      // === Minimum Wage Table ===
      else if (listType.value == "regionalMinimumWageRate") {
        if (editingRow) {
          // Revert the row to its original data
          editingRow.innerHTML = originalRowData.map(val => `<td>${val}</td>`).join("");

          // Clear editing state
          editingRow = null;
          originalRowData = null;

          // Deselect all rows
          document.querySelectorAll("#regionalWageTable tbody tr").forEach(r => r.classList.remove("selected-row"));

          selectedId = null; // No row is selected now
        }
      }
    }

    // Close Cancel Confirmation Modal
    if (e.target && e.target.id === "cancelCancelBtn") {
      cancelModal.classList.add("hidden");
    }
  });
}

// ========== UTILITIES ==========
function showUtilitiesSection(sectionId) {
  window.location.href = "../utilities.html";
}

function saveSystemSettings() {
  // Logic for backing up employee data (usually involves server-side functionality)
  alert("System settings has been saved successfully.");
}