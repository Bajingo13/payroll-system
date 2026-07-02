import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const sections = [
  ['Information We Collect', ['Employee identity and contact information', 'Location and camera data used for attendance verification', 'Payroll, compensation, bank, and government identification information', 'Device information, app usage data, and crash reports']],
  ['How We Use Your Information', ['Verify attendance and maintain employment records', 'Calculate payroll, deductions, benefits, and salary payments', 'Prepare required SSS, PhilHealth, Pag-IBIG, and BIR reports', 'Secure accounts, support users, and improve the service']],
  ['Data Security and Retention', ['Data is transmitted through encrypted connections and access is limited to authorized personnel.', 'Records and backups are retained only for operational, employment, and legal requirements.']],
  ['Your Privacy Rights', ['Under the Philippine Data Privacy Act of 2012 (RA 10173), you may request access or correction, object to processing, request erasure or blocking where applicable, and file a complaint with the National Privacy Commission.']],
  ['Third-Party Services', ['The system may use service providers for hosting, secure file storage, mobile distribution, notifications, and app-store delivery. They process information only for the services they provide.']],
];

export default function PrivacyPolicyModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <View><Text style={s.title}>Privacy Policy</Text><Text style={s.updated}>Last updated: July 2, 2026</Text></View>
          <TouchableOpacity onPress={onClose} style={s.close} accessibilityLabel="Close privacy policy"><Ionicons name="close" size={22} color="#334155" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <Text style={s.intro}>Astreablue HRIS & Payroll System is committed to protecting your privacy. This policy explains how personal information is collected, used, stored, and protected.</Text>
          {sections.map(([heading, items]) => (
            <View key={heading} style={s.section}>
              <Text style={s.heading}>{heading}</Text>
              {items.map(item => <View key={item} style={s.row}><Text style={s.bullet}>•</Text><Text style={s.body}>{item}</Text></View>)}
            </View>
          ))}
          <View style={s.section}><Text style={s.heading}>Contact Us</Text><Text style={s.body}>Privacy concerns and requests may be sent to hris@astreablue.com.</Text></View>
          <Text style={s.foot}>© 2026 Astreablue Intelligence Inc. All rights reserved.</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  title: { color: '#0f172a', fontSize: 22, fontWeight: '900' }, updated: { color: '#64748b', fontSize: 12, marginTop: 3 },
  close: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' },
  content: { padding: 20, paddingBottom: 40 }, intro: { color: '#475569', fontSize: 15, lineHeight: 23, marginBottom: 22 },
  section: { padding: 18, marginBottom: 14, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  heading: { color: '#1e40af', fontSize: 17, fontWeight: '800', marginBottom: 10 }, row: { flexDirection: 'row', marginBottom: 8 },
  bullet: { width: 18, color: '#3b82f6', fontSize: 16 }, body: { flex: 1, color: '#475569', fontSize: 14, lineHeight: 21 },
  foot: { color: '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: 8 },
});
