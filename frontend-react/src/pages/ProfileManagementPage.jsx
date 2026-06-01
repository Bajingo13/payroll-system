import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getApiMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

function toDateInput(value) {
  if (!value) return '';
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function makeEmptyProfile() {
  return {
    employee_id: null,
    personal: {
      first_name: '',
      last_name: '',
      middle_name: '',
      nickname: '',
      gender: '',
      civil_status: '',
      birth_date: '',
      mobile_no: '',
      email: '',
      street: '',
      city: '',
      country: '',
      zip_code: ''
    },
    government_ids: {
      sss_no: '',
      philhealth_no: '',
      pagibig_no: '',
      tin_no: ''
    },
    employment: {
      date_hired: '',
      status: '',
      department: '',
      designation: ''
    },
    documents: {
      files_201: '',
      contracts: '',
      certifications: ''
    }
  };
}

function normalizeProfile(rawProfile) {
  const empty = makeEmptyProfile();
  const source = rawProfile || {};

  return {
    employee_id: source.employee_id || null,
    personal: {
      ...empty.personal,
      ...(source.personal || {}),
      birth_date: toDateInput(source.personal?.birth_date)
    },
    government_ids: {
      ...empty.government_ids,
      ...(source.government_ids || {})
    },
    employment: {
      ...empty.employment,
      ...(source.employment || {}),
      date_hired: toDateInput(source.employment?.date_hired)
    },
    documents: {
      ...empty.documents,
      ...(source.documents || {})
    }
  };
}

export default function ProfileManagementPage() {
  const { user } = useAuth();
  const role = String(user?.role || '').trim().toLowerCase();
  const isEmployee = role === 'employee';
  const inputRef = useRef(null);
  const avatarStorageKey = user?.user_id ? `profile_avatar_${user.user_id}` : 'profile_avatar';
  const [avatar, setAvatar] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(makeEmptyProfile);
  const [savedProfile, setSavedProfile] = useState(makeEmptyProfile);

  useEffect(() => {
    setAvatar(localStorage.getItem(avatarStorageKey) || '');
  }, [avatarStorageKey]);

  useEffect(() => {
    if (!isEmployee || !user?.user_id) return;

    async function loadProfile() {
      setLoading(true);
      setMessage('Loading your profile...');
      try {
        const { data } = await api.get('/employee_profile_mgmt', {
          params: { user_id: user.user_id }
        });

        if (!data.success) {
          throw new Error(data.message || 'Unable to load profile.');
        }

        const normalized = normalizeProfile(data.profile);
        setProfile(normalized);
        setSavedProfile(normalized);
        setMessage('');
      } catch (err) {
        setMessage(getApiMessage(err, 'Unable to load profile.'));
      } finally {
        setLoading(false);
      }
    }

    loadProfile().catch(() => {});
  }, [isEmployee, user?.user_id]);

  const hasChanges = useMemo(() => {
    return JSON.stringify(profile) !== JSON.stringify(savedProfile);
  }, [profile, savedProfile]);

  function updateSection(section, field, value) {
    setProfile((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: value
      }
    }));
  }

  function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage('Please select an image file.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      localStorage.setItem(avatarStorageKey, result);
      setAvatar(result);
      window.dispatchEvent(new CustomEvent('profile-avatar-updated', { detail: result }));
      setMessage('Profile picture updated.');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    if (!user?.user_id) return;

    setSaving(true);
    setMessage('Saving profile changes...');
    try {
      const payload = {
        user_id: user.user_id,
        employee_id: profile.employee_id,
        personal: profile.personal,
        government_ids: profile.government_ids,
        employment: profile.employment,
        documents: profile.documents
      };

      const { data } = await api.put('/employee_profile_mgmt', payload);
      if (!data.success) {
        throw new Error(data.message || 'Unable to save profile.');
      }

      const nextSaved = normalizeProfile(profile);
      setSavedProfile(nextSaved);
      setMessage(data.message || 'Profile updated successfully.');
    } catch (err) {
      setMessage(getApiMessage(err, 'Unable to save profile.'));
    } finally {
      setSaving(false);
    }
  }

  function handleResetProfile() {
    setProfile(savedProfile);
    setMessage('Reverted to the last saved profile.');
  }

  if (!isEmployee) {
    return (
      <>
        <header className="header">
          <h2>Profile Management</h2>
          <p>Update the picture shown in your dashboard and sidebar.</p>
        </header>

        <section className="table-section profile-picture-panel">
          <button
            type="button"
            className="profile-avatar-button profile-picture-preview"
            onClick={() => inputRef.current?.click()}
            title="Change profile picture"
          >
            {avatar ? (
              <img src={avatar} alt={`${user?.full_name || 'User'} profile`} />
            ) : (
              <span className="profile-avatar-placeholder">Upload your picture here</span>
            )}
          </button>

          <div>
            <h3>{user?.full_name || 'Employee'}</h3>
            <p className="muted">{user?.role || 'Employee'}</p>
            <button type="button" className="btn secondary" onClick={() => inputRef.current?.click()}>
              Change Picture
            </button>
            <input
              ref={inputRef}
              className="profile-avatar-input"
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
            />
            <p className="message">{message}</p>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <header className="header">
        <h2>Personal Management</h2>
        <p>Update your personal details, government IDs, and document references.</p>
      </header>

      <section className="table-section profile-edit-section">
        <div className="profile-edit-toolbar">
          <span className="muted">Government IDs are encrypted at rest</span>
          <div className="row-actions">
            <button type="button" className="btn secondary" onClick={handleResetProfile} disabled={loading || saving || !hasChanges}>
              Reset to Last Saved
            </button>
          </div>
        </div>
        <div className="profile-picture-panel">
          <button
            type="button"
            className="profile-avatar-button profile-picture-preview"
            onClick={() => inputRef.current?.click()}
            title="Change profile picture"
          >
            {avatar ? (
              <img src={avatar} alt={`${user?.full_name || 'User'} profile`} />
            ) : (
              <span className="profile-avatar-placeholder">Upload your picture here</span>
            )}
          </button>

          <div>
            <h3>{user?.full_name || 'Employee'}</h3>
            <p className="muted">{user?.role || 'Employee'}</p>
            <button type="button" className="btn secondary" onClick={() => inputRef.current?.click()}>
              Change Picture
            </button>
            <input
              ref={inputRef}
              className="profile-avatar-input"
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
            />
          </div>
        </div>

        <form className="profile-edit-form" onSubmit={handleSaveProfile}>
          <div className="edit-group">
            <h4>Personal Details</h4>
            <div className="employee-form-grid">
              <label>First Name<input value={profile.personal.first_name} onChange={(e) => updateSection('personal', 'first_name', e.target.value)} /></label>
              <label>Middle Name<input value={profile.personal.middle_name} onChange={(e) => updateSection('personal', 'middle_name', e.target.value)} /></label>
              <label>Last Name<input value={profile.personal.last_name} onChange={(e) => updateSection('personal', 'last_name', e.target.value)} /></label>
              <label>Nickname<input value={profile.personal.nickname} onChange={(e) => updateSection('personal', 'nickname', e.target.value)} /></label>
              <label>
                Gender
                <select value={profile.personal.gender} onChange={(e) => updateSection('personal', 'gender', e.target.value)}>
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label>
                Civil Status
                <select value={profile.personal.civil_status} onChange={(e) => updateSection('personal', 'civil_status', e.target.value)}>
                  <option value="">Select civil status</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Separated">Separated</option>
                  <option value="Widowed">Widowed</option>
                </select>
              </label>
              <label>Birth Date<input type="date" value={profile.personal.birth_date} onChange={(e) => updateSection('personal', 'birth_date', e.target.value)} /></label>
              <label>Mobile No<input value={profile.personal.mobile_no} onChange={(e) => updateSection('personal', 'mobile_no', e.target.value)} /></label>
              <label>Email<input type="email" value={profile.personal.email} onChange={(e) => updateSection('personal', 'email', e.target.value)} /></label>
              <label>Street<input value={profile.personal.street} onChange={(e) => updateSection('personal', 'street', e.target.value)} /></label>
              <label>City<input value={profile.personal.city} onChange={(e) => updateSection('personal', 'city', e.target.value)} /></label>
              <label>Country<input value={profile.personal.country} onChange={(e) => updateSection('personal', 'country', e.target.value)} /></label>
              <label>ZIP Code<input value={profile.personal.zip_code} onChange={(e) => updateSection('personal', 'zip_code', e.target.value)} /></label>
            </div>
          </div>

          <div className="edit-group">
            <h4>Government IDs (Encrypted)</h4>
            <div className="employee-form-grid">
              <label>SSS<input value={profile.government_ids.sss_no} onChange={(e) => updateSection('government_ids', 'sss_no', e.target.value)} /></label>
              <label>PhilHealth<input value={profile.government_ids.philhealth_no} onChange={(e) => updateSection('government_ids', 'philhealth_no', e.target.value)} /></label>
              <label>Pag-IBIG<input value={profile.government_ids.pagibig_no} onChange={(e) => updateSection('government_ids', 'pagibig_no', e.target.value)} /></label>
              <label>TIN<input value={profile.government_ids.tin_no} onChange={(e) => updateSection('government_ids', 'tin_no', e.target.value)} /></label>
            </div>
          </div>

          <div className="edit-group">
            <h4>Employment Details</h4>
            <div className="employee-form-grid">
              <label>Hire Date<input type="date" value={profile.employment.date_hired} onChange={(e) => updateSection('employment', 'date_hired', e.target.value)} /></label>
              <label>
                Employee Status
                <select value={profile.employment.status} onChange={(e) => updateSection('employment', 'status', e.target.value)}>
                  <option value="">Select employee status</option>
                  <option value="Active">Active</option>
                  <option value="Probationary">Probationary</option>
                  <option value="Regular">Regular</option>
                  <option value="Contractual">Contractual</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Resigned">Resigned</option>
                  <option value="Terminated">Terminated</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>
              <label>Department<input value={profile.employment.department} onChange={(e) => updateSection('employment', 'department', e.target.value)} /></label>
              <label>Designation<input value={profile.employment.designation} onChange={(e) => updateSection('employment', 'designation', e.target.value)} /></label>
            </div>
          </div>

          <div className="edit-group">
            <h4>Document References</h4>
            <div className="employee-form-grid">
              <label className="employee-form-wide">
                201 Files (links or notes)
                <textarea rows="3" value={profile.documents.files_201} onChange={(e) => updateSection('documents', 'files_201', e.target.value)} />
              </label>
              <label className="employee-form-wide">
                Contracts (links or notes)
                <textarea rows="3" value={profile.documents.contracts} onChange={(e) => updateSection('documents', 'contracts', e.target.value)} />
              </label>
              <label className="employee-form-wide">
                Certifications (links or notes)
                <textarea rows="3" value={profile.documents.certifications} onChange={(e) => updateSection('documents', 'certifications', e.target.value)} />
              </label>
            </div>
          </div>

          <div className="row-actions">
            <button type="submit" className="btn" disabled={saving || loading || !hasChanges}>Save Changes</button>
          </div>
        </form>

        <p className="message">{message}</p>
      </section>
    </>
  );
}
