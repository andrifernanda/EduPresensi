import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ScrollView, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDb } from '../../database/db';
import useStore from '../../store/useStore';

export default function PeriodSetupScreen({ navigation }) {
  const [tahunAjaran, setTahunAjaran] = useState('');
  const [loading, setLoading] = useState(false);
  const user = useStore((state) => state.user);
  const setActivePeriod = useStore((state) => state.setActivePeriod);

  const handleSave = async () => {
    const regexTahun = /^\d{4}\/\d{4}$/;
    if (!regexTahun.test(tahunAjaran.trim())) {
      Alert.alert('Format Salah', 'Format tahun ajaran harus "YYYY/YYYY".\nContoh: 2026/2027');
      return;
    }

    setLoading(true);
    try {
      const db = await getDb();

      // Cek apakah tahun ajaran sudah pernah ditambahkan user ini
      const existing = await db.getFirstAsync(
        'SELECT id_periode FROM periode_ajaran WHERE id_pengguna = ? AND tahun_ajaran = ?',
        [user.id_pengguna, tahunAjaran.trim()]
      );
      if (existing) {
        Alert.alert('Sudah Ada', `Tahun ajaran ${tahunAjaran.trim()} sudah terdaftar. Pilih tahun ajaran lain atau ubah semester aktif melalui Pengaturan.`);
        return;
      }

      // Nonaktifkan semua periode user ini
      await db.runAsync(
        'UPDATE periode_ajaran SET is_active = 0 WHERE id_pengguna = ?',
        [user.id_pengguna]
      );

      // Otomatis buat Semester 1 DAN Semester 2
      const res1 = await db.runAsync(
        'INSERT INTO periode_ajaran (id_pengguna, tahun_ajaran, semester, is_active) VALUES (?, ?, 1, 1)',
        [user.id_pengguna, tahunAjaran.trim()]
      );
      await db.runAsync(
        'INSERT INTO periode_ajaran (id_pengguna, tahun_ajaran, semester, is_active) VALUES (?, ?, 2, 0)',
        [user.id_pengguna, tahunAjaran.trim()]
      );

      const newPeriod = {
        id_periode: res1.lastInsertRowId,
        id_pengguna: user.id_pengguna,
        tahun_ajaran: tahunAjaran.trim(),
        semester: 1,
        is_active: 1,
      };

      setActivePeriod(newPeriod);
      navigation.replace('Dashboard');
    } catch (error) {
      console.error(error);
      Alert.alert('Gagal', 'Terjadi kesalahan saat menyimpan periode.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.headerSection}>
          <View style={styles.logoContainer}>
            <Ionicons name="calendar" size={44} color="#fff" />
          </View>
          <Text style={styles.appName}>EduPresensi</Text>
          <Text style={styles.tagline}>
            {user?.nama_lengkap ? `Halo, ${user.nama_lengkap}!` : 'Selamat Datang!'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Atur Tahun Ajaran 📅</Text>
          <Text style={styles.cardSubtitle}>
            Masukkan tahun ajaran untuk memulai. Semester 1 dan Semester 2 akan dibuat secara otomatis.
          </Text>

          {/* Info Box */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#2563eb" />
            <Text style={styles.infoText}>
              Menambah satu tahun ajaran akan otomatis membuat{' '}
              <Text style={{ fontWeight: 'bold' }}>Semester 1</Text> dan{' '}
              <Text style={{ fontWeight: 'bold' }}>Semester 2</Text>. Semester 1 akan langsung aktif.
            </Text>
          </View>

          {/* Input Tahun Ajaran */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Tahun Ajaran</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="calendar-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Contoh: 2026/2027"
                placeholderTextColor="#94a3b8"
                value={tahunAjaran}
                onChangeText={setTahunAjaran}
                keyboardType="default"
              />
            </View>
          </View>

          {/* Preview yang akan dibuat */}
          {tahunAjaran.length > 0 && (
            <View style={styles.previewBox}>
              <Text style={styles.previewTitle}>Yang akan dibuat:</Text>
              <View style={styles.previewItem}>
                <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                <Text style={styles.previewText}>{tahunAjaran} — Semester 1 (aktif)</Text>
              </View>
              <View style={styles.previewItem}>
                <Ionicons name="checkmark-circle" size={16} color="#94a3b8" />
                <Text style={[styles.previewText, { color: '#94a3b8' }]}>{tahunAjaran} — Semester 2</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            <Ionicons name="rocket-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.buttonText}>{loading ? 'Menyimpan...' : 'Mulai Sekarang'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.footer}>© 2026 EduPresensi • Offline & Aman</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1d4ed8' },
  scrollContainer: { flexGrow: 1 },
  headerSection: { alignItems: 'center', paddingTop: 60, paddingBottom: 36, paddingHorizontal: 24 },
  logoContainer: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  appName: { fontSize: 30, fontWeight: 'bold', color: '#ffffff', letterSpacing: 1 },
  tagline: { fontSize: 15, color: '#bfdbfe', marginTop: 8, textAlign: 'center' },
  card: {
    backgroundColor: '#ffffff', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 28, paddingTop: 32, flex: 1,
  },
  cardTitle: { fontSize: 22, fontWeight: 'bold', color: '#0f172a', marginBottom: 8 },
  cardSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 20, lineHeight: 21 },
  infoBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, marginBottom: 24,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  infoText: { flex: 1, fontSize: 13, color: '#1e40af', lineHeight: 19 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: '#0f172a', fontWeight: '600' },
  previewBox: {
    backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  previewTitle: { fontSize: 12, fontWeight: '700', color: '#166534', marginBottom: 8 },
  previewItem: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  previewText: { fontSize: 14, color: '#166534', fontWeight: '500' },
  button: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#2563eb', padding: 16, borderRadius: 12,
    shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  buttonDisabled: { backgroundColor: '#93c5fd' },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  footer: { textAlign: 'center', color: '#bfdbfe', fontSize: 12, paddingVertical: 16, backgroundColor: '#1d4ed8' },
});
