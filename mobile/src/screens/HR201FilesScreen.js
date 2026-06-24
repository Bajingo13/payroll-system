import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '../context/AuthContext';
import { api, getApiMessage } from '../api/client';
import { API_BASE_URL } from '../config';

const BASE_URL = (API_BASE_URL || '').replace('/api', '');

const T = {
  bg: '#f8fafc', surface: '#ffffff', surfaceAlt: '#f1f5f9',
  border: '#e2e8f0', accent: '#1e40af', accentLight: '#2563eb',
  accentBg: '#dbeafe', textPrimary: '#0f172a', textSub: '#64748b',
  textMuted: '#94a3b8', headerBg: '#1e3a8a',
};

// ── Mirror of the backend CATALOG (must stay in sync) ────────────────────
const CATALOG = [
  {
    key: 'pre_employment', label: 'Pre-Employment', color: '#2563eb',
    docs: [
      { key: 'pds',              name: 'Personal Data Sheet (PDS)',  required: true,  has_expiry: false },
      { key: 'nbi_clearance',    name: 'NBI Clearance',              required: true,  has_expiry: true  },
      { key: 'police_clearance', name: 'Police Clearance',           required: true,  has_expiry: true  },
      { key: 'medical_cert',     name: 'Medical Certificate',        required: true,  has_expiry: true  },
      { key: 'drug_test',        name: 'Drug Test Result',           required: true,  has_expiry: true  },
    ],
  },
  {
    key: 'personal_records', label: 'Personal Records', color: '#16a34a',
    docs: [
      { key: 'birth_cert', name: 'PSA Birth Certificate',  required: true, has_expiry: false },
      { key: 'sss',        name: 'SSS ID / E1 Form',       required: true, has_expiry: false },
      { key: 'philhealth', name: 'PhilHealth ID / MDR',    required: true, has_expiry: false },
      { key: 'pagibig',    name: 'Pag-IBIG MID Card',      required: true, has_expiry: false },
      { key: 'tin',        name: 'TIN / BIR Form 1902',    required: true, has_expiry: false },
    ],
  },
  {
    key: 'employment', label: 'Employment', color: '#d97706',
    docs: [
      { key: 'contract',  name: 'Employment Contract',            required: true, has_expiry: false },
      { key: 'job_offer', name: 'Job Offer / Appointment Letter', required: true, has_expiry: false },
    ],
  },
  {
    key: 'during_employment', label: 'During Employment', color: '#7c3aed',
    docs: [
      { key: 'perf_eval', name: 'Performance Evaluation', required: false, has_expiry: false },
      { key: 'training',  name: 'Training Certificate',   required: false, has_expiry: false },
      { key: 'memo',      name: 'Memo / Incident Report', required: false, has_expiry: false },
    ],
  },
  {
    key: 'separation', label: 'Separation', color: '#dc2626',
    docs: [
      { key: 'resignation', name: 'Resignation Letter',        required: false, has_expiry: false },
      { key: 'clearance',   name: 'Employee Clearance',        required: false, has_expiry: false },
      { key: 'coe',         name: 'Certificate of Employment', required: false, has_expiry: false },
    ],
  },
];

const STATUS_CFG = {
  Missing:  { color: '#94a3b8', bg: '#f1f5f9', icon: 'ellipse-outline' },
  Active:   { color: '#16a34a', bg: '#f0fdf4', icon: 'checkmark-circle' },
  Expiring: { color: '#d97706', bg: '#fffbeb', icon: 'warning' },
  Expired:  { color: '#dc2626', bg: '#fef2f2', icon: 'close-circle' },
};

function formatDate(v) {
  if (!v) return '-';
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Main screen ───────────────────────────────────────────────────────────
export default function HR201FilesScreen({ navigation }) {
  const { user } = useAuth();
  const insets   = useSafeAreaInsets();

  // Employee list
  const [employees,   setEmployees]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [search,      setSearch]      = useState('');
  const [listError,   setListError]   = useState('');

  // Employee document view
  const [selected,      setSelected]      = useState(null);
  const [categoryData,  setCategoryData]  = useState(null); // { categories, overall }
  const [loadingDocs,   setLoadingDocs]   = useState(false);
  const [activeCatIdx,  setActiveCatIdx]  = useState(0);
  const [docError,      setDocError]      = useState('');

  // Upload flow
  const [uploadTarget,     setUploadTarget]     = useState(null); // { category, doc_key, name, has_expiry }
  const [pendingFile,      setPendingFile]       = useState(null); // { base64, fileName }
  const [showSourceSheet,  setShowSourceSheet]   = useState(false);
  const [uploadExpiry,     setUploadExpiry]      = useState('');
  const [showExpiryPicker, setShowExpiryPicker]  = useState(false);
  const [uploading,        setUploading]         = useState(false);

  // Delete flow
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }
  const [deleting,     setDeleting]     = useState(false);

  // Toast
  const [toast, setToast] = useState('');
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  // ── Load employee list ──
  async function loadEmployees(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data } = await api.get('/employees');
      setEmployees(data.employees || []);
      setListError('');
    } catch (err) { setListError(getApiMessage(err, 'Failed to load employees.')); }
    finally { setLoading(false); setRefreshing(false); }
  }

  // ── Load documents for selected employee ──
  async function loadDocuments(emp, isRefresh = false) {
    if (!isRefresh) setLoadingDocs(true);
    setDocError('');
    try {
      const { data } = await api.get('/employee_documents', { params: { employee_id: emp.employee_id } });
      if (!data.success) throw new Error(data.message);
      setCategoryData({ categories: data.categories, overall: data.overall });
    } catch (err) { setDocError(getApiMessage(err, 'Failed to load documents.')); }
    finally { setLoadingDocs(false); }
  }

  useEffect(() => { loadEmployees(); }, []);

  function selectEmployee(emp) {
    setSelected(emp);
    setActiveCatIdx(0);
    setCategoryData(null);
    loadDocuments(emp);
  }

  function goBack() {
    setSelected(null);
    setCategoryData(null);
    setDocError('');
    setActiveCatIdx(0);
  }

  // ── Upload flow ──
  function startUpload(cat, doc) {
    setUploadTarget({ category: cat.key, doc_key: doc.key, name: doc.name, has_expiry: doc.has_expiry });
    setUploadExpiry('');
    setPendingFile(null);
    setShowSourceSheet(true);
  }

  async function pickImage(source) {
    setShowSourceSheet(false);
    try {
      let result;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Please allow camera access.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ quality: 0.8, base64: true });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Please allow access to your photo library.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, base64: true });
      }

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const ext   = (asset.mimeType || 'image/jpeg').split('/')[1] || 'jpg';
      const file  = { base64: asset.base64, fileName: `${uploadTarget.doc_key}_${Date.now()}.${ext}` };

      if (uploadTarget.has_expiry) {
        setPendingFile(file);
        setShowExpiryPicker(true);
      } else {
        await doUpload(file, null);
      }
    } catch (err) {
      Alert.alert('Error', getApiMessage(err, 'Could not pick image.'));
    }
  }

  async function pickDocument() {
    setShowSourceSheet(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset  = result.assets[0];
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const file = { base64, fileName: asset.name || `${uploadTarget.doc_key}_${Date.now()}.pdf` };

      if (uploadTarget.has_expiry) {
        setPendingFile(file);
        setShowExpiryPicker(true);
      } else {
        await doUpload(file, null);
      }
    } catch (err) {
      Alert.alert('Error', getApiMessage(err, 'Could not pick document.'));
    }
  }

  async function doUpload(file, expiryDate) {
    setShowExpiryPicker(false);
    setUploading(true);
    try {
      const { data } = await api.post('/employee_documents', {
        employee_id:   String(selected.employee_id),
        category:      uploadTarget.category,
        doc_key:       uploadTarget.doc_key,
        document_name: uploadTarget.name,
        expiry_date:   expiryDate || null,
        file_name:     file.fileName,
        file_data:     file.base64,
      });
      if (!data.success) throw new Error(data.message);
      showToast(`${uploadTarget.name} uploaded successfully.`);
      setUploadTarget(null);
      setPendingImage(null);
      await loadDocuments(selected, true);
    } catch (err) {
      Alert.alert('Upload Failed', getApiMessage(err, 'Could not upload document.'));
    } finally { setUploading(false); }
  }

  // ── Delete flow ──
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data } = await api.delete(`/employee_documents/${deleteTarget.id}`);
      if (!data.success) throw new Error(data.message);
      showToast('Document deleted.');
      setDeleteTarget(null);
      await loadDocuments(selected, true);
    } catch (err) {
      Alert.alert('Delete Failed', getApiMessage(err, 'Could not delete document.'));
    } finally { setDeleting(false); }
  }

  function viewDocument(fileUrl) {
    const fullUrl = `${BASE_URL}${fileUrl}`;
    Linking.openURL(fullUrl).catch(() => Alert.alert('Error', 'Could not open document.'));
  }

  // ── Derived ──
  const filteredEmployees = employees.filter((e) => {
    const q = search.toLowerCase();
    return !q || (`${e.first_name} ${e.last_name}`).toLowerCase().includes(q) ||
      (e.emp_code || '').toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q);
  });

  const activeCat    = categoryData?.categories?.[activeCatIdx];
  const overall      = categoryData?.overall;

  // ── Render: Employee list ──
  if (!selected) {
    return (
      <View style={s.root}>
        <View style={[s.header, { paddingTop: insets.top + 16 }]}>
          <View style={s.headerRow}>
            <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
              <Ionicons name="chevron-back" size={20} color={T.accentLight} />
            </TouchableOpacity>
            <View style={s.headerText}>
              <Text style={s.headerTitle}>201 Files</Text>
              <Text style={s.headerSub}>Philippine employee document records</Text>
            </View>
          </View>
          <View style={s.searchWrap}>
            <Ionicons name="search-outline" size={15} color={T.textMuted} />
            <TextInput
              style={s.searchInput} value={search} onChangeText={setSearch}
              placeholder="Search employee, ID, department…" placeholderTextColor={T.textMuted}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={15} color={T.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadEmployees(true)} tintColor={T.accentLight} />}
        >
          {loading && <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} />}
          {listError ? <Text style={s.errorText}>{listError}</Text> : null}
          {!loading && filteredEmployees.length === 0 && !listError && (
            <View style={s.empty}>
              <Ionicons name="people-outline" size={52} color={T.textMuted} />
              <Text style={s.emptyTitle}>No employees found</Text>
            </View>
          )}
          {filteredEmployees.map((emp, i) => (
            <TouchableOpacity key={emp.employee_id || i} style={s.empCard} onPress={() => selectEmployee(emp)} activeOpacity={0.75}>
              <View style={s.empAvatar}>
                <Text style={s.empAvatarText}>{(emp.first_name || 'E')[0].toUpperCase()}</Text>
              </View>
              <View style={s.empBody}>
                <Text style={s.empName}>{emp.first_name} {emp.last_name}</Text>
                <Text style={s.empMeta}>{emp.emp_code} · {emp.department || 'No dept'} · {emp.position || 'No position'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── Render: Document view ──
  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={goBack} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={20} color={T.accentLight} />
          </TouchableOpacity>
          <View style={s.headerText}>
            <Text style={s.headerTitle} numberOfLines={1}>{selected.first_name} {selected.last_name}</Text>
            <Text style={s.headerSub}>{selected.emp_code} · {selected.department || 'No dept'}</Text>
          </View>
        </View>

        {/* Completeness bar */}
        {overall && (
          <View style={s.completenessWrap}>
            <View style={s.completenessTop}>
              <Text style={s.completenessLabel}>Document Completeness</Text>
              <Text style={[s.completenessVal, { color: overall.completeness >= 80 ? '#34d399' : overall.completeness >= 50 ? '#fbbf24' : '#f87171' }]}>
                {overall.completeness}% · {overall.submitted_count}/{overall.required_count} required
              </Text>
            </View>
            <View style={s.progressBg}>
              <View style={[s.progressFill, {
                width: `${overall.completeness}%`,
                backgroundColor: overall.completeness >= 80 ? '#34d399' : overall.completeness >= 50 ? '#fbbf24' : '#f87171',
              }]} />
            </View>
          </View>
        )}
      </View>

      {/* Category tabs */}
      {categoryData && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabContent}>
          {categoryData.categories.map((cat, idx) => {
            const active = idx === activeCatIdx;
            return (
              <TouchableOpacity key={cat.key} style={[s.tab, active && { borderBottomColor: cat.color, borderBottomWidth: 2 }]}
                onPress={() => setActiveCatIdx(idx)}>
                <Text style={[s.tabText, active && { color: cat.color, fontWeight: '800' }]}>{cat.label}</Text>
                {cat.required_count > 0 && (
                  <View style={[s.tabBadge, { backgroundColor: cat.submitted_count >= cat.required_count ? '#f0fdf4' : '#fef2f2' }]}>
                    <Text style={[s.tabBadgeText, { color: cat.submitted_count >= cat.required_count ? '#16a34a' : '#dc2626' }]}>
                      {cat.submitted_count}/{cat.required_count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Document list */}
      <ScrollView
        contentContainerStyle={s.docListContent}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => loadDocuments(selected, true)} tintColor={T.accentLight} />}
      >
        {loadingDocs && <ActivityIndicator color={T.accent} style={{ marginVertical: 32 }} />}
        {docError ? <Text style={s.errorText}>{docError}</Text> : null}

        {activeCat && activeCat.documents.map((doc) => {
          const cfg    = STATUS_CFG[doc.status] || STATUS_CFG.Missing;
          const catCfg = categoryData.categories[activeCatIdx];
          return (
            <View key={doc.key} style={[s.docCard, { borderLeftColor: doc.status === 'Missing' ? T.border : cfg.color }]}>
              {/* Doc header */}
              <View style={s.docTop}>
                <View style={s.docLeft}>
                  <Text style={s.docName}>{doc.name}</Text>
                  <View style={s.docTagRow}>
                    {doc.required && (
                      <View style={s.reqTag}><Text style={s.reqTagText}>Required</Text></View>
                    )}
                    {doc.has_expiry && (
                      <View style={s.expiryTag}><Text style={s.expiryTagText}>Has Expiry</Text></View>
                    )}
                  </View>
                </View>
                <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                  <Ionicons name={cfg.icon} size={11} color={cfg.color} />
                  <Text style={[s.statusText, { color: cfg.color }]}>{doc.status}</Text>
                </View>
              </View>

              {/* Uploaded info */}
              {doc.uploaded ? (
                <View style={s.uploadedRow}>
                  <Ionicons name={/\.(pdf|doc|docx)$/i.test(doc.uploaded.file_name || '') ? 'document-text-outline' : 'image-outline'} size={14} color={T.accentLight} />
                  <Text style={s.uploadedFile} numberOfLines={1}>{doc.uploaded.file_name}</Text>
                  {doc.uploaded.expiry_date && (
                    <Text style={[s.uploadedExpiry, doc.status === 'Expired' && { color: '#dc2626' }, doc.status === 'Expiring' && { color: '#d97706' }]}>
                      Exp: {formatDate(doc.uploaded.expiry_date)}
                    </Text>
                  )}
                  <View style={s.uploadedActions}>
                    <TouchableOpacity style={s.iconBtn} onPress={() => viewDocument(doc.uploaded.file_url)} accessibilityLabel="View document">
                      <Ionicons name="eye-outline" size={18} color={T.accentLight} />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.iconBtn} onPress={() => startUpload(catCfg, doc)} accessibilityLabel="Replace document">
                      <Ionicons name="refresh-outline" size={18} color="#d97706" />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.iconBtn} onPress={() => setDeleteTarget({ id: doc.uploaded.id, name: doc.name })} accessibilityLabel="Delete document">
                      <Ionicons name="trash-outline" size={18} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={[s.uploadBtn, { borderColor: catCfg.color + '55' }]} onPress={() => startUpload(catCfg, doc)}>
                  <Ionicons name="cloud-upload-outline" size={15} color={catCfg.color} />
                  <Text style={[s.uploadBtnText, { color: catCfg.color }]}>Upload</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Upload loading overlay */}
      {uploading && (
        <View style={s.uploadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={s.uploadingText}>Uploading…</Text>
        </View>
      )}

      {/* Toast */}
      {toast ? (
        <View style={s.toast}>
          <Ionicons name="checkmark-circle" size={16} color="#34d399" />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* ── Upload source bottom sheet ── */}
      <Modal visible={showSourceSheet} transparent animationType="fade" onRequestClose={() => setShowSourceSheet(false)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setShowSourceSheet(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Upload {uploadTarget?.name}</Text>
            <Text style={s.sheetSub}>Choose the source for this document</Text>

            <TouchableOpacity style={s.sheetOption} onPress={() => pickImage('camera')}>
              <View style={[s.sheetIcon, { backgroundColor: '#dbeafe' }]}>
                <Ionicons name="camera" size={22} color={T.accent} />
              </View>
              <View style={s.sheetOptionBody}>
                <Text style={s.sheetOptionTitle}>Take Photo</Text>
                <Text style={s.sheetOptionSub}>Capture with camera</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={s.sheetOption} onPress={() => pickImage('gallery')}>
              <View style={[s.sheetIcon, { backgroundColor: '#f0fdf4' }]}>
                <Ionicons name="images" size={22} color="#16a34a" />
              </View>
              <View style={s.sheetOptionBody}>
                <Text style={s.sheetOptionTitle}>Choose from Gallery</Text>
                <Text style={s.sheetOptionSub}>Pick from photo library</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={s.sheetOption} onPress={pickDocument}>
              <View style={[s.sheetIcon, { backgroundColor: '#fdf4ff' }]}>
                <Ionicons name="document-text" size={22} color="#9333ea" />
              </View>
              <View style={s.sheetOptionBody}>
                <Text style={s.sheetOptionTitle}>Pick Document</Text>
                <Text style={s.sheetOptionSub}>PDF or Word file</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={[s.sheetOption, { borderBottomWidth: 0, marginTop: 4, backgroundColor: T.surfaceAlt, borderRadius: 14 }]} onPress={() => setShowSourceSheet(false)}>
              <Text style={[s.sheetOptionTitle, { flex: 1, textAlign: 'center', color: T.textSub }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Expiry date picker ── */}
      {showExpiryPicker && (
        <Modal visible transparent animationType="fade" onRequestClose={() => { setShowExpiryPicker(false); }}>
          <Pressable style={s.sheetBackdrop} onPress={() => {}}>
            <Pressable style={s.sheet} onPress={() => {}}>
              <View style={s.sheetHandle} />
              <Text style={s.sheetTitle}>Set Expiry Date</Text>
              <Text style={s.sheetSub}>When does this document expire?</Text>

              <DateTimePicker
                value={uploadExpiry ? new Date(`${uploadExpiry}T00:00:00`) : new Date()}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(event, date) => {
                  if (date) setUploadExpiry(toDateStr(date));
                }}
              />

              <View style={s.expiryActions}>
                <TouchableOpacity style={s.expirySkipBtn} onPress={() => doUpload(pendingFile, null)}>
                  <Text style={s.expirySkipText}>Skip (No Expiry)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.expiryConfirmBtn, !uploadExpiry && { opacity: 0.5 }]}
                  onPress={() => doUpload(pendingFile, uploadExpiry)}
                  disabled={!uploadExpiry}
                >
                  <Text style={s.expiryConfirmText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ── Delete confirmation modal ── */}
      <Modal visible={Boolean(deleteTarget)} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <Pressable style={s.delBackdrop} onPress={() => !deleting && setDeleteTarget(null)}>
          <Pressable style={s.delDialog} onPress={() => {}}>
            <View style={s.delIconWrap}>
              <Ionicons name="trash-outline" size={28} color="#dc2626" />
            </View>
            <Text style={s.delTitle}>Delete Document</Text>
            <Text style={s.delMsg}>
              Are you sure you want to delete{'\n'}
              <Text style={{ fontWeight: '800', color: T.textPrimary }}>"{deleteTarget?.name}"</Text>?{'\n'}
              This cannot be undone.
            </Text>
            <View style={s.delActions}>
              <TouchableOpacity style={s.delCancelBtn} onPress={() => setDeleteTarget(null)} disabled={deleting}>
                <Text style={s.delCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.delConfirmBtn, deleting && { opacity: 0.6 }]} onPress={handleDelete} disabled={deleting}>
                {deleting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.delConfirmText}>Delete</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },

  // Header
  header:     { backgroundColor: T.headerBg, paddingHorizontal: 20, paddingBottom: 14 },
  headerRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  backBtn:    { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle:{ fontSize: 20, fontWeight: '900', color: '#fff' },
  headerSub:  { fontSize: 11, color: '#93c5fd' },

  // Completeness
  completenessWrap: { marginTop: 4 },
  completenessTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  completenessLabel:{ fontSize: 11, color: '#93c5fd', fontWeight: '600' },
  completenessVal:  { fontSize: 12, fontWeight: '800' },
  progressBg:   { height: 5, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },

  // Search
  searchWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 13, color: T.textPrimary, padding: 0 },

  // Category tabs
  tabBar:    { backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: T.border, maxHeight: 48 },
  tabContent:{ paddingHorizontal: 10, gap: 4 },
  tab:       { paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:   { fontSize: 12, fontWeight: '600', color: T.textSub, whiteSpace: 'nowrap' },
  tabBadge:  { borderRadius: 20, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeText: { fontSize: 9, fontWeight: '800' },

  // Employee list
  listContent: { padding: 14, gap: 10, paddingBottom: 40 },
  empCard:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: T.border },
  empAvatar:   { width: 40, height: 40, borderRadius: 12, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  empAvatarText: { color: T.accentLight, fontSize: 15, fontWeight: '900' },
  empBody:     { flex: 1 },
  empName:     { fontSize: 13, fontWeight: '700', color: T.textPrimary },
  empMeta:     { fontSize: 11, color: T.textSub },
  empty:       { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle:  { fontSize: 15, fontWeight: '700', color: T.textSub },
  errorText:   { color: '#f87171', fontSize: 13, textAlign: 'center', padding: 16 },

  // Document list
  docListContent: { padding: 14, gap: 10, paddingBottom: 48 },
  docCard: {
    backgroundColor: T.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: T.border, borderLeftWidth: 3, gap: 10,
  },
  docTop:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  docLeft:   { flex: 1, gap: 5 },
  docName:   { fontSize: 13, fontWeight: '700', color: T.textPrimary },
  docTagRow: { flexDirection: 'row', gap: 5 },
  reqTag:    { backgroundColor: '#eff6ff', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: '#bfdbfe' },
  reqTagText:{ fontSize: 9, fontWeight: '700', color: '#2563eb' },
  expiryTag: { backgroundColor: '#fffbeb', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: '#fde68a' },
  expiryTagText: { fontSize: 9, fontWeight: '700', color: '#d97706' },
  statusBadge:{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: '800' },

  // Uploaded file row
  uploadedRow:    { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: T.surfaceAlt, borderRadius: 10, padding: 9 },
  uploadedFile:   { flex: 1, fontSize: 12, color: T.textSub, fontWeight: '600' },
  uploadedExpiry: { fontSize: 11, color: T.textSub, fontWeight: '600' },
  uploadedActions:{ flexDirection: 'row', gap: 2 },
  iconBtn:        { padding: 6 },

  // Upload button
  uploadBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: T.border, backgroundColor: T.surfaceAlt },
  uploadBtnText: { fontSize: 13, fontWeight: '700' },

  // Uploading overlay
  uploadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', gap: 12, zIndex: 200 },
  uploadingText:    { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Toast
  toast:     { position: 'absolute', bottom: 80, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#bbf7d0', elevation: 6, zIndex: 99 },
  toastText: { color: '#34d399', fontWeight: '700', fontSize: 13 },

  // Upload source sheet
  sheetBackdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: T.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12, borderWidth: 1, borderColor: T.border },
  sheetHandle:    { width: 40, height: 4, backgroundColor: T.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle:     { fontSize: 17, fontWeight: '800', color: T.textPrimary, marginBottom: 4 },
  sheetSub:       { fontSize: 13, color: T.textMuted, marginBottom: 20 },
  sheetOption:    { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.border },
  sheetIcon:      { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetOptionBody:{ flex: 1 },
  sheetOptionTitle:{ fontSize: 15, fontWeight: '700', color: T.textPrimary },
  sheetOptionSub: { fontSize: 12, color: T.textMuted, marginTop: 2 },

  // Expiry picker
  expiryActions:    { flexDirection: 'row', gap: 10, marginTop: 12 },
  expirySkipBtn:    { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: T.surfaceAlt, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  expirySkipText:   { fontSize: 13, fontWeight: '700', color: T.textSub },
  expiryConfirmBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: T.accent, alignItems: 'center' },
  expiryConfirmText:{ fontSize: 13, fontWeight: '800', color: '#fff' },

  // Delete dialog
  delBackdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  delDialog:     { backgroundColor: T.surface, borderRadius: 24, padding: 28, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, elevation: 12 },
  delIconWrap:   { width: 60, height: 60, borderRadius: 20, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  delTitle:      { fontSize: 18, fontWeight: '900', color: T.textPrimary, marginBottom: 10 },
  delMsg:        { fontSize: 14, color: T.textSub, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  delActions:    { flexDirection: 'row', gap: 12, width: '100%' },
  delCancelBtn:  { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: T.surfaceAlt, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  delCancelText: { fontSize: 14, fontWeight: '700', color: T.textSub },
  delConfirmBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: '#dc2626', alignItems: 'center' },
  delConfirmText:{ fontSize: 14, fontWeight: '800', color: '#fff' },
});
