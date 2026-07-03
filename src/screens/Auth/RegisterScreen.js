import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ScrollView, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDb } from '../../database/db';
import * as Crypto from 'expo-crypto';

const SECURITY_QUESTIONS = [
  'Apa makanan favorit Anda?',
  'Apa minuman favorit Anda?',
  'Apa warna favorit Anda?',
  'Apa hobi favorit Anda?',
  'Apa olahraga favorit Anda?',
];

export default function RegisterScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [namaLengkap, setNamaLengkap] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mataPelajaran, setMataPelajaran] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [question, setQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [answer, setAnswer] = useState('');
  const [showQuestionDropdown, setShowQuestionDropdown] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!username || !namaLengkap || !password || !confirmPassword || !mataPelajaran || !question || !answer) {
      Alert.alert('Gagal', 'Semua kolom harus diisi.');
      return;
    }
    if (username.includes(' ') || isNaN(username)) {
      Alert.alert('Gagal', 'NIK/NIP harus berupa angka tanpa spasi.');
      return;
    }
    if (password.length < 5) {
      Alert.alert('Gagal', 'Password minimal 5 karakter.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Gagal', 'Konfirmasi password tidak cocok.');
      return;
    }

    setLoading(true);
    try {
      const db = await getDb();
      const passwordHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        password
      );
      const existingUser = await db.getFirstAsync(
        'SELECT id_pengguna FROM pengguna WHERE username = ?', [username]
      );
      if (existingUser) {
        Alert.alert('Gagal', 'NIK/NIP sudah terdaftar. Gunakan NIK/NIP lain.');
        return;
      }
      await db.runAsync(
        'INSERT INTO pengguna (username, nama_lengkap, password_hash, mata_pelajaran, pertanyaan_keamanan, jawaban_keamanan) VALUES (?, ?, ?, ?, ?, ?)',
        [username, namaLengkap.trim(), passwordHash, mataPelajaran.trim(), question, answer]
      );
      Alert.alert('Berhasil! 🎉', 'Akun berhasil dibuat. Silakan masuk dengan akun baru Anda.', [
        { text: 'Masuk Sekarang', onPress: () => navigation.replace('Login') }
      ]);
    } catch (error) {
      console.error(error);
      Alert.alert('Gagal', 'Terjadi kesalahan saat menyimpan data.');
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
          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
            <Text style={styles.backText}>Kembali ke Login</Text>
          </TouchableOpacity>
          <View style={styles.logoContainer}>
            <Ionicons name="school" size={44} color="#fff" />
          </View>
          <Text style={styles.appName}>EduPresensi</Text>
          <Text style={styles.tagline}>Buat akun guru baru</Text>
        </View>

        {/* Card Form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pendaftaran Guru</Text>
          <Text style={styles.cardSubtitle}>Isi data Anda dengan lengkap dan benar</Text>

          {/* NIK/NIP */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>NIK / NIP <Text style={styles.required}>*</Text></Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="card-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Masukkan NIK/NIP (tanpa spasi)"
                placeholderTextColor="#94a3b8"
                value={username}
                onChangeText={(text) => setUsername(text.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Nama Lengkap */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nama Lengkap <Text style={styles.required}>*</Text></Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-circle-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Nama lengkap Anda"
                placeholderTextColor="#94a3b8"
                value={namaLengkap}
                onChangeText={setNamaLengkap}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password <Text style={styles.required}>*</Text></Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Minimal 5 karakter"
                placeholderTextColor="#94a3b8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Konfirmasi Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Konfirmasi Password <Text style={styles.required}>*</Text></Text>
            <View style={[
              styles.inputWrapper,
              confirmPassword.length > 0 && (
                confirmPassword === password ? styles.inputWrapperValid : styles.inputWrapperInvalid
              )
            ]}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Ulangi password Anda"
                placeholderTextColor="#94a3b8"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeBtn}>
                <Ionicons name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            {confirmPassword.length > 0 && confirmPassword !== password && (
              <Text style={styles.errorHint}>Password tidak cocok</Text>
            )}
          </View>

          {/* Mata Pelajaran */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mata Pelajaran <Text style={styles.required}>*</Text></Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="book-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Contoh: Matematika, Bahasa Inggris"
                placeholderTextColor="#94a3b8"
                value={mataPelajaran}
                onChangeText={setMataPelajaran}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* Pertanyaan Keamanan */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Pertanyaan Keamanan <Text style={styles.required}>*</Text></Text>
            <TouchableOpacity
              style={styles.dropdownBtn}
              onPress={() => setShowQuestionDropdown(!showQuestionDropdown)}
            >
              <Ionicons name="help-circle-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <Text style={styles.dropdownBtnText} numberOfLines={1}>{question}</Text>
              <Ionicons name={showQuestionDropdown ? 'chevron-up' : 'chevron-down'} size={18} color="#94a3b8" />
            </TouchableOpacity>
            {showQuestionDropdown && (
              <View style={styles.dropdown}>
                {SECURITY_QUESTIONS.map((q, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.dropdownItem, question === q && styles.dropdownItemActive]}
                    onPress={() => { setQuestion(q); setShowQuestionDropdown(false); }}
                  >
                    <Text style={[styles.dropdownItemText, question === q && styles.dropdownItemTextActive]}>{q}</Text>
                    {question === q && <Ionicons name="checkmark" size={16} color="#2563eb" />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Jawaban */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Jawaban <Text style={styles.required}>*</Text></Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Tuliskan jawaban Anda"
                placeholderTextColor="#94a3b8"
                value={answer}
                onChangeText={setAnswer}
              />
            </View>
            <Text style={styles.hint}>Digunakan untuk memulihkan akun jika lupa password</Text>
          </View>

          {/* Tombol Daftar */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Memproses...' : 'Buat Akun'}</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>atau</Text>
            <View style={styles.dividerLine} />
          </View>
          <TouchableOpacity onPress={() => navigation.replace('Login')} style={styles.loginBtn}>
            <Text style={styles.loginText}>Sudah punya akun? <Text style={styles.loginTextBold}>Masuk</Text></Text>
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
  headerSection: { alignItems: 'center', paddingTop: 40, paddingBottom: 40, paddingHorizontal: 24 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 16,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  backText: {
    color: '#bfdbfe',
    fontSize: 14,
    marginLeft: 4,
    fontWeight: '600',
  },
  logoContainer: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  appName: { fontSize: 32, fontWeight: 'bold', color: '#ffffff', letterSpacing: 1 },
  tagline: { fontSize: 14, color: '#bfdbfe', marginTop: 6 },
  card: {
    backgroundColor: '#ffffff', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 28, paddingTop: 32,
  },
  cardTitle: { fontSize: 22, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 24 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8, letterSpacing: 0.3 },
  required: { color: '#ef4444' },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 14,
  },
  inputWrapperValid: { borderColor: '#10b981', backgroundColor: '#f0fdf4' },
  inputWrapperInvalid: { borderColor: '#ef4444', backgroundColor: '#fef2f2' },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 13, fontSize: 15, color: '#0f172a' },
  eyeBtn: { padding: 4 },
  hint: { fontSize: 11, color: '#94a3b8', marginTop: 5 },
  errorHint: { fontSize: 11, color: '#ef4444', marginTop: 5 },
  dropdownBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  dropdownBtnText: { flex: 1, fontSize: 14, color: '#334155' },
  dropdown: {
    backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, marginTop: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5, overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  dropdownItemActive: { backgroundColor: '#eff6ff' },
  dropdownItemText: { fontSize: 14, color: '#334155', flex: 1 },
  dropdownItemTextActive: { color: '#2563eb', fontWeight: '600' },
  button: {
    backgroundColor: '#2563eb', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8,
    shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  buttonDisabled: { backgroundColor: '#93c5fd' },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', letterSpacing: 0.5 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  dividerText: { marginHorizontal: 12, color: '#94a3b8', fontSize: 13 },
  loginBtn: { alignItems: 'center', marginBottom: 8 },
  loginText: { color: '#64748b', fontSize: 14 },
  loginTextBold: { color: '#2563eb', fontWeight: 'bold' },
  footer: { textAlign: 'center', color: '#bfdbfe', fontSize: 12, paddingVertical: 16, backgroundColor: '#1d4ed8' },
});
