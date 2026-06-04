// ========== TOAST ==========
function showToast(msg, type = "success") {
  const toastId =
    type === "success"
      ? "toastSuccess"
      : type === "warning"
      ? "toastWarning"
      : "toastError";

  const toast = document.getElementById(toastId);
  if (!toast) return;

  toast.textContent = msg;
  toast.classList.add("show");

  setTimeout(() => toast.classList.remove("show"), 3000);
}

// Show any queued logout/session-expired toast after redirecting to login.
(() => {
  const key = "post_logout_toast";
  const raw = localStorage.getItem(key);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    localStorage.removeItem(key);

    if (data && data.message) {
      showToast(String(data.message), String(data.type || "warning"));
    }
  } catch {
    localStorage.removeItem(key);
  }
})();

// ========== TAB SWITCHER ==========
function showTab(tab) {
  const isLogin = tab === "login";
  document.getElementById("loginForm").classList.toggle("hidden", !isLogin);
  document.getElementById("registerForm").classList.toggle("hidden", isLogin);
  document.getElementById("resetForm")?.classList.add("hidden");
  document.getElementById("tabLogin").classList.toggle("active", isLogin);
  document.getElementById("tabRegister").classList.toggle("active", !isLogin);
  document.getElementById("loginMessage").textContent = "";
  document.getElementById("registerMessage").textContent = "";
  const resetMessage = document.getElementById("resetMessage");
  if (resetMessage) resetMessage.textContent = "";
}

// ========== LOGIN ==========
async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const msgDiv = document.getElementById("loginMessage");

  msgDiv.textContent = "";
  msgDiv.style.color = "red";

  if (!username || !password) {
    msgDiv.textContent = "Please enter both username and password.";
    return;
  }

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ username, password })
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      console.error("Login API error:", data);
      msgDiv.textContent = data.message || data.error || "Server error. Please try again later.";
      return;
    }

    if (data.success) {
      msgDiv.style.color = "green";
      msgDiv.textContent = "Login successful! Redirecting...";

      showToast("Login successful!", "success");

      sessionStorage.setItem("user_id", data.user_id);
      sessionStorage.setItem("admin_name", data.full_name);
      sessionStorage.setItem("role", data.role || "");

      setTimeout(() => {
        const role = String(data.role || "").toLowerCase();
        if (role === "employee") {
          window.location.href = "../dashboard/employee_dashboard.html";
        } else if (role === "hr") {
          window.location.href = "../dashboard/hr_dashboard.html";
        } else {
          window.location.href = "../dashboard/dashboard.html";
        }
      }, 1000);
    } else {
      msgDiv.textContent = data.message || "Invalid username or password.";
    }
  } catch (err) {
    console.error("Login fetch error:", err);
    msgDiv.textContent = "Unable to connect to the server. Please try again later.";
  }
}

// Prevent form reload
document.getElementById("loginForm").addEventListener("submit", function (e) {
  e.preventDefault();
  login();
});

document.getElementById("showResetForm")?.addEventListener("click", function () {
  document.getElementById("loginForm").classList.add("hidden");
  document.getElementById("registerForm").classList.add("hidden");
  document.getElementById("resetForm").classList.remove("hidden");
  document.getElementById("tabLogin").classList.add("active");
  document.getElementById("tabRegister").classList.remove("active");
});

document.getElementById("backToLogin")?.addEventListener("click", function () {
  showTab("login");
});

document.getElementById("resetForm")?.addEventListener("submit", async function (e) {
  e.preventDefault();
  const username = document.getElementById("reset_username").value.trim();
  const msgDiv = document.getElementById("resetMessage");

  msgDiv.textContent = "";
  msgDiv.style.color = "red";

  try {
    const res = await fetch("/api/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.success === false) {
      throw new Error(data.message || "Unable to request password reset.");
    }

    msgDiv.style.color = "green";
    msgDiv.textContent = data.message || "Password reset instructions will be sent to the email linked to that username.";
    document.getElementById("resetForm").reset();
  } catch (err) {
    msgDiv.textContent = err.message || "Unable to request password reset.";
  }
});

// ========== REGISTER ==========
async function register() {
  const fullName = document.getElementById("reg_fullname").value.trim();
  const username = document.getElementById("reg_username").value.trim();
  const password = document.getElementById("reg_password").value;
  const confirm = document.getElementById("reg_confirm").value;
  const role = document.getElementById("reg_role").value;
  const msgDiv = document.getElementById("registerMessage");

  msgDiv.textContent = "";
  msgDiv.style.color = "red";

  if (!fullName || !username || !password || !confirm || !role) {
    msgDiv.textContent = "Please fill in all fields.";
    return;
  }

  if (password.length < 8) {
    msgDiv.textContent = "Password must be at least 8 characters.";
    return;
  }

  if (password !== confirm) {
    msgDiv.textContent = "Passwords do not match.";
    return;
  }

  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, full_name: fullName, role })
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (data.success) {
      showToast("Account created! You can now log in.", "success");
      msgDiv.style.color = "green";
      msgDiv.textContent = "Registration successful! Switching to login...";
      document.getElementById("registerForm").reset();
      setTimeout(() => showTab("login"), 1500);
    } else {
      msgDiv.textContent = data.message || "Registration failed. Please try again.";
    }
  } catch (err) {
    console.error("Register fetch error:", err);
    msgDiv.textContent = "Unable to connect to the server. Please try again later.";
  }
}

document.getElementById("registerForm").addEventListener("submit", function (e) {
  e.preventDefault();
  register();
});
