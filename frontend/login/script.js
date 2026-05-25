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

const loginPanel = document.getElementById("loginPanel");
const registerPanel = document.getElementById("registerPanel");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const loginMessage = document.getElementById("loginMessage");
const registerMessage = document.getElementById("registerMessage");
const showRegisterBtn = document.getElementById("showRegisterBtn");
const showLoginBtn = document.getElementById("showLoginBtn");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");

function setPanel(mode) {
  const showLogin = mode === "login";

  loginPanel.classList.toggle("is-hidden", !showLogin);
  registerPanel.classList.toggle("is-hidden", showLogin);

  loginMessage.textContent = "";
  registerMessage.textContent = "";
}

function setButtonState(button, isLoading, defaultLabel, loadingLabel) {
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingLabel : defaultLabel;
}

function setMessage(target, message, color = "#d92d20") {
  target.textContent = message;
  target.style.color = color;
}

function togglePassword(inputId, toggleButton) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  toggleButton.textContent = isPassword ? "Hide" : "Show";
}

// ========== LOGIN ==========
async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  setMessage(loginMessage, "");

  if (!username || !password) {
    setMessage(loginMessage, "Please enter both username and password.");
    return;
  }

  try {
    setButtonState(loginBtn, true, "Login", "Signing in...");

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
      setMessage(loginMessage, data.message || data.error || "Server error. Please try again later.");
      return;
    }

    if (data.success) {
      setMessage(loginMessage, "Login successful! Redirecting...", "#1f7a1f");
      showToast("Login successful!", "success");
      sessionStorage.setItem("user_id", data.user_id);
      sessionStorage.setItem("admin_name", data.full_name);
      sessionStorage.setItem("role", data.role || "");

      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1000);
    } else {
      setMessage(loginMessage, data.message || "Invalid username or password.");
    }
  } catch (err) {
    console.error("Login fetch error:", err);
    setMessage(loginMessage, "Unable to connect to the server. Please try again later.");
  } finally {
    setButtonState(loginBtn, false, "Login", "Signing in...");
  }
}

async function register() {
  const fullName = document.getElementById("registerFullName").value.trim();
  const username = document.getElementById("registerUsername").value.trim();
  const role = document.getElementById("registerRole").value;
  const password = document.getElementById("registerPassword").value;
  const confirmPassword = document.getElementById("registerConfirmPassword").value;

  setMessage(registerMessage, "");

  if (!fullName || !username || !role || !password || !confirmPassword) {
    setMessage(registerMessage, "Please complete all registration fields.");
    return;
  }

  if (password.length < 6) {
    setMessage(registerMessage, "Password must be at least 6 characters long.");
    return;
  }

  if (password !== confirmPassword) {
    setMessage(registerMessage, "Passwords do not match.");
    return;
  }

  try {
    setButtonState(registerBtn, true, "Create Account", "Creating...");

    const res = await fetch("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        full_name: fullName,
        username,
        password,
        role
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMessage(registerMessage, data.message || "Unable to register right now.");
      return;
    }

    showToast("Registration successful! Please log in.", "success");
    registerForm.reset();
    document.getElementById("username").value = username;
    document.getElementById("password").value = "";
    setPanel("login");
    setMessage(loginMessage, "Registration successful! Please log in.", "#1f7a1f");
  } catch (err) {
    console.error("Registration fetch error:", err);
    setMessage(registerMessage, "Unable to connect to the server. Please try again later.");
  } finally {
    setButtonState(registerBtn, false, "Create Account", "Creating...");
  }
}

loginForm.addEventListener("submit", function (e) {
  e.preventDefault();
  login();
});

registerForm.addEventListener("submit", function (e) {
  e.preventDefault();
  register();
});

showRegisterBtn.addEventListener("click", () => setPanel("register"));
showLoginBtn.addEventListener("click", () => setPanel("login"));

forgotPasswordBtn.addEventListener("click", () => {
  showToast("Please contact your administrator or HR to reset your password.", "warning");
});

document.querySelectorAll("[data-toggle-password]").forEach(toggle => {
  toggle.addEventListener("click", () => {
    togglePassword(toggle.dataset.togglePassword, toggle);
  });
});