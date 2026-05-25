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

      setTimeout(() => {
        window.location.href = "../dashboard/dashboard.html";
      }, 1000);
    } else {
      msgDiv.textContent = data.message || "Invalid username or password.";
    }
  } catch (err) {
    console.error("Login fetch error:", err);
    msgDiv.textContent = "Unable to connect to the server. Please try again later.";
  }
}

// ========== REGISTER ==========
async function register() {
  const full_name = document.getElementById("registerFullName").value.trim();
  const username = document.getElementById("registerUsername").value.trim();
  const password = document.getElementById("registerPassword").value;
  const role = document.getElementById("registerRole").value;
  const msgDiv = document.getElementById("registerMessage");

  msgDiv.textContent = "";
  msgDiv.style.color = "red";

  if (!full_name || !username || !password || !role) {
    msgDiv.textContent = "Please complete all register fields.";
    return;
  }

  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ full_name, username, password, role })
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok || !data.success) {
      msgDiv.textContent = data.message || "Unable to register account.";
      return;
    }

    msgDiv.style.color = "green";
    msgDiv.textContent = "Registration successful. You can now login.";
    showToast("Account created successfully!", "success");
    document.getElementById("registerForm").reset();
  } catch (err) {
    console.error("Register fetch error:", err);
    msgDiv.textContent = "Unable to connect to the server. Please try again later.";
  }
}

// Prevent form reload
document.getElementById("loginForm").addEventListener("submit", function (e) {
  e.preventDefault();
  login();
});

document.getElementById("registerForm").addEventListener("submit", function (e) {
  e.preventDefault();
  register();
});
