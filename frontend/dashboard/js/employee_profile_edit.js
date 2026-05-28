function formatDateInput(value) {
  if (!value) return '';
  const valueText = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(valueText)) {
    return valueText;
  }

  const date = new Date(valueText.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function parseApiJson(res, fallbackMessage) {
  const raw = await res.text();
  let data;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(fallbackMessage || 'Invalid server response. Please refresh and try again.');
  }

  if (!res.ok) {
    throw new Error((data && data.message) || fallbackMessage || 'Request failed.');
  }

  return data;
}

function setMessage(message, ok = false) {
  const node = document.getElementById('profileEditMessage');
  if (!node) return;
  node.textContent = message || '';
  node.className = ok ? 'time-message tag-success' : 'time-message tag-warn';
}

function setInputValue(id, value) {
  const node = document.getElementById(id);
  if (!node) return;

  const nextValue = value || '';
  if (node.tagName === 'SELECT' && nextValue) {
    const hasOption = Array.from(node.options).some((option) => option.value === nextValue);
    if (!hasOption) {
      const customOption = document.createElement('option');
      customOption.value = nextValue;
      customOption.textContent = nextValue;
      node.appendChild(customOption);
    }
  }

  node.value = nextValue;
}

function getInputValue(id) {
  const node = document.getElementById(id);
  return node ? node.value : '';
}

function renderEditableProfile(profile) {
  const personal = profile.personal || {};
  const government = profile.government_ids || {};
  const employment = profile.employment || {};
  const documents = profile.documents || {};

  setInputValue('editFirstName', personal.first_name);
  setInputValue('editMiddleName', personal.middle_name);
  setInputValue('editLastName', personal.last_name);
  setInputValue('editNickname', personal.nickname);
  setInputValue('editGender', personal.gender);
  setInputValue('editCivilStatus', personal.civil_status);
  setInputValue('editBirthDate', formatDateInput(personal.birth_date));
  setInputValue('editMobileNo', personal.mobile_no);
  setInputValue('editEmail', personal.email);
  setInputValue('editStreet', personal.street);
  setInputValue('editCity', personal.city);
  setInputValue('editCountry', personal.country);
  setInputValue('editZipCode', personal.zip_code);

  setInputValue('editSssNo', government.sss_no);
  setInputValue('editPhilhealthNo', government.philhealth_no);
  setInputValue('editPagibigNo', government.pagibig_no);
  setInputValue('editTinNo', government.tin_no);

  setInputValue('editDateHired', formatDateInput(employment.date_hired));
  setInputValue('editEmploymentStatus', employment.status);
  setInputValue('editDepartment', employment.department);
  setInputValue('editDesignation', employment.designation);

  setInputValue('editFiles201', documents.files_201);
  setInputValue('editContracts', documents.contracts);
  setInputValue('editCertifications', documents.certifications);
}

function collectEditableProfilePayload() {
  return {
    employee_id: Number(sessionStorage.getItem('employee_id') || 0) || null,
    personal: {
      first_name: getInputValue('editFirstName'),
      middle_name: getInputValue('editMiddleName'),
      last_name: getInputValue('editLastName'),
      nickname: getInputValue('editNickname'),
      gender: getInputValue('editGender'),
      civil_status: getInputValue('editCivilStatus'),
      birth_date: getInputValue('editBirthDate'),
      mobile_no: getInputValue('editMobileNo'),
      email: getInputValue('editEmail'),
      street: getInputValue('editStreet'),
      city: getInputValue('editCity'),
      country: getInputValue('editCountry'),
      zip_code: getInputValue('editZipCode')
    },
    government_ids: {
      sss_no: getInputValue('editSssNo'),
      philhealth_no: getInputValue('editPhilhealthNo'),
      pagibig_no: getInputValue('editPagibigNo'),
      tin_no: getInputValue('editTinNo')
    },
    employment: {
      date_hired: getInputValue('editDateHired'),
      status: getInputValue('editEmploymentStatus'),
      department: getInputValue('editDepartment'),
      designation: getInputValue('editDesignation')
    },
    documents: {
      files_201: getInputValue('editFiles201'),
      contracts: getInputValue('editContracts'),
      certifications: getInputValue('editCertifications')
    }
  };
}

async function fetchEmployeeDashboardHeader(userId) {
  const res = await fetch(`/api/employee_dashboard?user_id=${encodeURIComponent(userId)}`);
  const data = await parseApiJson(res, 'Unable to load employee details.');

  if (!data.success) {
    throw new Error(data.message || 'Failed to load employee details.');
  }

  const user = data.user || {};
  const employee = data.employee || {};
  const displayName = user.full_name || employee.employee_name || 'Employee';

  document.getElementById('empName').textContent = displayName;
  document.getElementById('empRole').textContent = user.role || 'Employee';
}

async function fetchEditableProfile(userId) {
  const res = await fetch(`/api/employee_profile_mgmt?user_id=${encodeURIComponent(userId)}`);
  const data = await parseApiJson(res, 'Unable to load editable profile.');

  if (!data.success) {
    throw new Error(data.message || 'Unable to load editable profile.');
  }

  return data.profile || {};
}

async function saveEditableProfile(userId, payload) {
  const res = await fetch('/api/employee_profile_mgmt', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, ...payload })
  });

  const data = await parseApiJson(res, 'Unable to save profile changes.');
  if (!data.success) {
    throw new Error(data.message || 'Unable to save profile changes.');
  }

  return data;
}

let lastLoadedProfile = null;

async function loadProfilePage() {
  const userId = sessionStorage.getItem('user_id');
  if (!userId) {
    window.location.href = '../login/login.html';
    return;
  }

  try {
    await fetchEmployeeDashboardHeader(userId);
    const profile = await fetchEditableProfile(userId);
    if (profile.employee_id) {
      sessionStorage.setItem('employee_id', String(profile.employee_id));
    }
    lastLoadedProfile = JSON.parse(JSON.stringify(profile));
    renderEditableProfile(profile);
    setMessage('');
  } catch (err) {
    console.error(err);
    setMessage(err.message || 'Failed to load profile data.');
  }
}

document.getElementById('profileEditForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const userId = sessionStorage.getItem('user_id');
  if (!userId) {
    window.location.href = '../login/login.html';
    return;
  }

  try {
    const payload = collectEditableProfilePayload();
    const result = await saveEditableProfile(userId, payload);
    setMessage(result.message || 'Profile updated successfully.', true);

    const refreshed = await fetchEditableProfile(userId);
    if (refreshed.employee_id) {
      sessionStorage.setItem('employee_id', String(refreshed.employee_id));
    }
    lastLoadedProfile = JSON.parse(JSON.stringify(refreshed));
    renderEditableProfile(refreshed);
  } catch (err) {
    console.error(err);
    setMessage(err.message || 'Failed to save profile changes.');
  }
});

document.getElementById('btnResetProfile').addEventListener('click', () => {
  if (!lastLoadedProfile) {
    setMessage('No saved profile snapshot available.');
    return;
  }

  renderEditableProfile(lastLoadedProfile);
  setMessage('Form has been reset to last saved data.', true);
});

document.getElementById('logout').addEventListener('click', (event) => {
  event.preventDefault();
  sessionStorage.removeItem('user_id');
  sessionStorage.removeItem('admin_name');
  sessionStorage.removeItem('role');
  window.location.href = '../login/login.html';
});

document.addEventListener('DOMContentLoaded', loadProfilePage);
