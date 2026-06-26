function getProfileAvatarStorageKey() {
  const userId = sessionStorage.getItem('user_id') || 'guest';
  return `profile_avatar_${userId}`;
}

function renderProfileAvatar(button) {
  const imageData = localStorage.getItem(getProfileAvatarStorageKey());
  if (imageData) {
    button.innerHTML = `<img src="${imageData}" alt="Profile picture">`;
    return;
  }

  button.innerHTML = '<span class="profile-avatar-placeholder">Upload your picture here</span>';
}

function saveProfileAvatarFile(file, buttons) {
  if (!file || !file.type.startsWith('image/')) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    localStorage.setItem(getProfileAvatarStorageKey(), reader.result);
    buttons.forEach(renderProfileAvatar);
    window.dispatchEvent(new CustomEvent('profile-avatar-updated', { detail: reader.result }));
  };
  reader.readAsDataURL(file);
}

function getAccountSettingsHref() {
  const role = String(sessionStorage.getItem('role') || '').toLowerCase();
  return role === 'employee' ? 'employee_profile_edit.html' : 'utilities/system_settings.html';
}

function getAccountInitials(name) {
  return String(name || 'Admin')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || 'A';
}

function updateTopAccountProfile(user = {}) {
  const menu = document.querySelector('.page-account-menu');
  if (!menu) return;

  const name = user.full_name || sessionStorage.getItem('admin_name') || 'Admin';
  const role = user.role || sessionStorage.getItem('role') || 'Administrator';
  menu.querySelectorAll('[data-account-name]').forEach(node => {
    node.textContent = name;
  });
  menu.querySelectorAll('[data-account-role]').forEach(node => {
    node.textContent = role;
  });
  menu.querySelectorAll('[data-account-initials]').forEach(node => {
    node.textContent = getAccountInitials(name);
  });
}

function renderTopAccountAvatar(src) {
  document.querySelectorAll('.page-account-avatar').forEach(avatar => {
    avatar.innerHTML = '';
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'Account profile picture';
      avatar.appendChild(img);
      return;
    }

    const fallback = document.createElement('span');
    fallback.dataset.accountInitials = '';
    avatar.appendChild(fallback);
  });
  updateTopAccountProfile();
}

function setupTopAccountMenu() {
  const section = document.querySelector('.section');
  if (!section || section.querySelector('.page-account-menu')) return;

  const menu = document.createElement('details');
  menu.className = 'page-account-menu';
  menu.innerHTML = `
    <summary aria-label="Open account menu">
      <span class="page-account-avatar"></span>
      <span class="page-account-text">
        <strong data-account-name>Admin</strong>
        <small data-account-role>Administrator</small>
      </span>
    </summary>
    <div class="page-account-dropdown">
      <div class="page-account-card">
        <span class="page-account-avatar page-account-avatar-large"></span>
        <div>
          <strong data-account-name>Admin</strong>
          <small data-account-role>Administrator</small>
        </div>
      </div>
      <input type="file" accept="image/*" class="page-account-file" aria-label="Change account picture">
      <button type="button" class="page-account-action page-account-change">Change Picture</button>
      <a class="page-account-action" href="${getAccountSettingsHref()}">Account Settings</a>
      <button type="button" class="page-account-action danger account-menu-logout">Sign Out</button>
    </div>
  `;

  section.insertBefore(menu, section.firstChild);
  renderTopAccountAvatar(localStorage.getItem(getProfileAvatarStorageKey()));

  const input = menu.querySelector('.page-account-file');
  const changeButton = menu.querySelector('.page-account-change');
  changeButton.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    saveProfileAvatarFile(input.files[0], [
      ...document.querySelectorAll('.sidebar .profile .profile-avatar-button')
    ]);
    input.value = '';
  });

  menu.querySelector('.account-menu-logout').addEventListener('click', (event) => {
    event.preventDefault();
    window.location.href = '../../login/login.html';
  });

  window.addEventListener('profile-avatar-updated', (event) => {
    renderTopAccountAvatar(String(event.detail || localStorage.getItem(getProfileAvatarStorageKey()) || ''));
  });
}

function setupProfileAvatar() {
  const profile = document.querySelector('.sidebar .profile');
  const nameNode = profile ? profile.querySelector('h3') : null;
  if (!profile || !nameNode || profile.querySelector('.profile-avatar-button')) {
    return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.className = 'profile-avatar-input';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'profile-avatar-button';
  button.setAttribute('aria-label', 'Upload profile picture');

  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => saveProfileAvatarFile(input.files[0], [button]));

  renderProfileAvatar(button);
  profile.insertBefore(input, nameNode);
  profile.insertBefore(button, nameNode);
}

function setupProfilePictureManager() {
  const panel = document.getElementById('profilePicturePanel');
  if (!panel) return;

  const input = panel.querySelector('#profilePictureInput');
  const preview = panel.querySelector('#profilePicturePreview');
  const changeButton = panel.querySelector('#profilePictureChange');
  if (!input || !preview || !changeButton) return;

  const buttons = [preview];
  const sidebarButton = document.querySelector('.sidebar .profile .profile-avatar-button');
  if (sidebarButton) buttons.push(sidebarButton);

  changeButton.addEventListener('click', () => input.click());
  preview.addEventListener('click', () => input.click());
  input.addEventListener('change', () => saveProfileAvatarFile(input.files[0], buttons));
  renderProfileAvatar(preview);
}

function setupSidebarDropdownClicks() {
  document.querySelectorAll('.sidebar .dropdown > .dropdown-toggle').forEach((toggle) => {
    const dropdown = toggle.closest('.dropdown');
    dropdown?.classList.remove('open');
    toggle.removeAttribute('data-click-toggle-ready');
  });
}

function setupLogoutHandler() {
  document.querySelectorAll('#logout').forEach((logout) => {
    if (logout.dataset.logoutReady === 'true') return;

    logout.dataset.logoutReady = 'true';
    logout.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.href = '../../login/login.html';
    });
  });
}

function removeSidebarLogoutLinks() {
  document.querySelectorAll('.sidebar #logout').forEach((logout) => {
    logout.closest('li')?.remove();
  });
}

async function loadBasicProfile() {
  const userId = sessionStorage.getItem('user_id');
  if (!userId) return;

  try {
    const res = await fetch(`/api/profile?user_id=${userId}`);
    const data = await res.json();
    if (!data.success || !data.user) return;

    const profile = document.querySelector('.sidebar .profile');
    if (profile) {
      const name = profile.querySelector('h3');
      const role = profile.querySelector('p');
      if (name) name.textContent = data.user.full_name;
      if (role) role.textContent = data.user.role;
    }
    updateTopAccountProfile(data.user);
  } catch (err) {
    console.error('Error loading profile:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupProfileAvatar();
  setupProfilePictureManager();
  setupTopAccountMenu();
  removeSidebarLogoutLinks();
  setupSidebarDropdownClicks();
  setupLogoutHandler();
  loadBasicProfile();
});
