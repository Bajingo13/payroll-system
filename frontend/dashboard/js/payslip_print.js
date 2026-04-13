document.addEventListener("DOMContentLoaded", () => {
  const raw = localStorage.getItem("payslipData");

  if (!raw) {
    alert("No payslip data found. Please generate the payslip again.");
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error("Invalid payslipData:", err);
    alert("Invalid payslip data.");
    return;
  }

  const qs = (selector) => document.querySelector(selector);

  function text(id, value, fallback = "-") {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value === null || value === undefined || value === "" ? fallback : value;
  }

  function peso(value) {
    return Number(value || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function tableRows(tbodyId, rows) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!Array.isArray(rows) || rows.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>No data</td>
        <td class="amount">0.00</td>
      `;
      tbody.appendChild(tr);
      return;
    }

    rows.forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.label || "-"}</td>
        <td class="amount">${peso(row.amount)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function numberToWords(num) {
    const a = [
      "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
      "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
      "Seventeen", "Eighteen", "Nineteen"
    ];
    const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    function inWords(n) {
      if (n < 20) return a[n];
      if (n < 100) return `${b[Math.floor(n / 10)]}${n % 10 ? " " + a[n % 10] : ""}`;
      if (n < 1000) return `${a[Math.floor(n / 100)]} Hundred${n % 100 ? " " + inWords(n % 100) : ""}`;
      if (n < 1000000) return `${inWords(Math.floor(n / 1000))} Thousand${n % 1000 ? " " + inWords(n % 1000) : ""}`;
      if (n < 1000000000) return `${inWords(Math.floor(n / 1000000))} Million${n % 1000000 ? " " + inWords(n % 1000000) : ""}`;
      return `${inWords(Math.floor(n / 1000000000))} Billion${n % 1000000000 ? " " + inWords(n % 1000000000) : ""}`;
    }

    const whole = Math.floor(Number(num || 0));
    const cents = Math.round((Number(num || 0) - whole) * 100);

    const wholeWords = whole === 0 ? "Zero" : inWords(whole);
    return `${wholeWords} Pesos${cents > 0 ? ` and ${cents}/100` : ""} Only`;
  }

  if (data.orientation && String(data.orientation).toLowerCase() === "horizontal") {
    const sheet = qs(".payslip-sheet");
    if (sheet) sheet.classList.add("landscape");
  }

  text("companyName", data.companyName);
  text("dateOfJoining", data.dateOfJoining);
  text("payPeriod", data.payPeriod);
  text("workedDays", data.workedDays);
  text("employeeName", data.employeeName);
  text("designation", data.designation);
  text("department", data.department);

  tableRows("earningsBody", data.earnings || []);
  tableRows("deductionsBody", data.deductions || []);

  text("totalEarnings", peso(data.totalEarnings), "0.00");
  text("totalDeductions", peso(data.totalDeductions), "0.00");
  text("netPay", peso(data.netPay), "0.00");
  text("netPayNumber", peso(data.netPay), "0.00");
  text("netPayWords", numberToWords(data.netPay), "Zero");
});

//====== for dashboard user profile =========

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

    // ✅ THIS PART sets "Admin" and "System Administrator"
    const profileEl = document.querySelector(".sidebar .profile");
    if (profileEl) {
      profileEl.querySelector("h3").textContent = user.full_name;
      profileEl.querySelector("p").textContent = user.role;
    }

    // ✅ THIS PART sets "Welcome, Admin 👋"
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