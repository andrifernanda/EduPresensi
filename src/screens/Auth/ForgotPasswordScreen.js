import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ScrollView, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDb } from '../../database/db';
import * as Crypto from 'expo-crypto';

export default function ForgotPasswordScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [userRecord, setUserRecord] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCheckUsername = async () => {
    if (!username) {
      Alert.alert('Gagal', 'Masukkan NIK/NIP terlebih dahulu.');
      return;
    }
    setLoading(true);
    try {
      const db = await getDb();
      const user = await db.getFirstAsync('SELECT * FROM pengguna WHERE username = ?', [username]);
      if (user) {
        setUserRecord(user);
        setSecurityQuestion(user.pertanyaan_keamanan);
        setStep(2);
      } else {
        Alert.alert('Tidak Ditemukan', 'NIK/NIP tidak terdaftar di aplikasi.');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Gagal', 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAnswer = () => {
    if (!answer) {
      Alert.alert('Gagal', 'Masukkan jawaban keamanan.');
      return;
    }
    if (answer.toLowerCase().trim() === userRecord.jawaban_keamanan.toLowerCase().trim()) {
      setStep(3);
    } else {
      Alert.alert('Jawaban Salah', 'Jawaban keamanan yang Anda masukkan tidak tepat. Coba lagi.');
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 5) {
      Alert.alert('Gagal', 'Password baru minimal 5 karakter.');
      return;
    }
    setLoading(true);
    try {
      const db = await getDb();
      const passwordHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        newPassword
      );
      await db.runAsync(
        'UPDATE pengguna SET password_hash = ? WHERE id_pengguna = ?',
        [passwordHash, userRecord.id_pengguna]
      );
      Alert.alert('Berhasil! ✅', 'Password Anda telah berhasil direset. Silakan masuk dengan password baru.', [
        { text: 'Masuk Sekarang', onPress: () => navigation.replace('Login') }
      ]);
    } catch (error) {
      console.error(error);
      Alert.alert('Gagal', 'Terjadi kesalahan saat mereset password.');
    } finally {
      setLoading(false);
    }
  };

  const STEPS = ['Identitas', 'Keamanan', 'Password Baru'];

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
            <Text style={styles.backText}>Kembali</Text>
          </TouchableOpacity>
          <View style={styles.logoContainer}>
            <Ionicons name="key" size={40} color="#fff" />
          </View>
          <Text style={styles.appName}>Lupa Password</Text>
          <Text style={styles.tagline}>Ikuti langkah untuk memulihkan akun</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>

          {/* Step Indicator */}
          <View style={styles.stepContainer}>
            {STEPS.map((label, idx) => (
              <React.Fragment key={idx}>
                <View style={styles.stepItem}>
                  <View style={[styles.stepCircle, step > idx + 1 && styles.stepCircleDone, step === idx + 1 && styles.stepCircleActive]}>
                    {step > idx + 1
                      ? <Ionicons name="checkmark" size={14} color="#fff" />
                      : <Text style={[styles.stepNum, step === idx + 1 && styles.stepNumActive]}>{idx + 1}</Text>
                    }
                  </View>
                  <Text style={[styles.stepLabel, step === idx + 1 && styles.stepLabelActive]}>{label}</Text>
                </View>
                {idx < STEPS.length - 1 && (
                  <View style={[styles.stepLine, step > idx + 1 && styles.stepLineDone]} />
                )}
              </React.Fragment>
            ))}
          </View>

          {/* === LANGKAH 1: NIK/NIP === */}
          {step === 1 && (
            <View>
              <Text style={styles.stepTitle}>Cari Akun Anda</Text>
              <Text style={styles.stepDesc}>Masukkan NIK/NIP yang terdaftar di EduPresensi.</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>NIK / NIP</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="card-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Masukkan NIK/NIP Anda"
                    placeholderTextColor="#94a3b8"
                    value={username}
                    onChangeText={(text) => setUsername(text.replace(/\s/g, ''))}
                    autoCapitalize="none"
                  />
                </View>
              </View>
              <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleCheckUsername} disabled={loading}>
                <Text style={styles.buttonText}>{loading ? 'Mencari...' : 'Lanjut'}</Text>
                {!loading && <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />}
              </TouchableOpacity>
            </View>
          )}

          {/* === LANGKAH 2: Pertanyaan Keamanan === */}
          {step === 2 && (
            <View>
              <Text style={styles.stepTitle}>Verifikasi Identitas</Text>
              <Text style={styles.stepDesc}>Jawab pertanyaan keamanan yang Anda buat saat mendaftar.</Text>

              <View style={styles.questionBox}>
                <Ionicons name="help-circle" size={22} color="#2563eb" style={{ marginRight: 10 }} />
                <Text style={styles.questionText}>{securityQuestion}</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Jawaban Anda</Text>
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
              </View>
              <TouchableOpacity style={styles.button} onPress={handleVerifyAnswer}>
                <Text style={styles.buttonText}>Verifikasi</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep(1)} style={styles.backStepBtn}>
                <Text style={styles.backStepText}>← Ganti NIK/NIP</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* === LANGKAH 3: Reset Password === */}
          {step === 3 && (
            <View>
              <View style={styles.successBanner}>
                <Ionicons name="shield-checkmark" size={28} color="#10b981" />
                <Text style={styles.successText}>Identitas terverifikasi!</Text>
              </View>
              <Text style={styles.stepTitle}>Buat Password Baru</Text>
              <Text style={styles.stepDesc}>Buat password baru yang kuat dan mudah Anda ingat.</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password Baru</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Minimal 5 karakter"
                    placeholderTextColor="#94a3b8"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showNewPassword}
                  />
                  <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} style={styles.eyeBtn}>
                    <Ionicons name={showNewPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleResetPassword} disabled={loading}>
                <Ionicons name="save-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.buttonText}>{loading ? 'Menyimpan...' : 'Simpan Password Baru'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <Text style={styles.footer}>© 2026 EduPresensi • Offline & Aman</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1d4ed8',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  headerSection: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
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
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  appName: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 14,
    color: '#bfdbfe',
    marginTop: 6,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 28,
    paddingTop: 32,
    flex: 1,
    minHeight: 500,
  },
  // Step Indicator
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  stepItem: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepCircleActive: {
    backgroundColor: '#2563eb',
  },
  stepCircleDone: {
    backgroundColor: '#10b981',
  },
  stepNum: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#94a3b8',
  },
  stepNumActive: {
    color: '#fff',
  },
  stepLabel: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '500',
  },
  stepLabelActive: {
    color: '#2563eb',
    fontWeight: '700',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#e2e8f0',
    marginBottom: 18,
    marginHorizontal: 6,
  },
  stepLineDone: {
    backgroundColor: '#10b981',
  },
  // Content
  stepTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 6,
  },
  stepDesc: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 24,
    lineHeight: 20,
  },
  questionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  questionText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '600',
    lineHeight: 20,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  successText: {
    fontSize: 15,
    color: '#166534',
    fontWeight: '700',
    marginLeft: 10,
  },
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    color: '#0f172a',
  },
  eyeBtn: {
    padding: 4,
  },
  button: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: '#93c5fd',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  backStepBtn: {
    alignItems: 'center',
    marginTop: 16,
  },
  backStepText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    textAlign: 'center',
    color: '#bfdbfe',
    fontSize: 12,
    paddingVertical: 16,
    backgroundColor: '#1d4ed8',
  },
});
