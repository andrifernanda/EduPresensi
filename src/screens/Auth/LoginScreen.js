import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ScrollView, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDb } from '../../database/db';
import * as Crypto from 'expo-crypto';
import useStore from '../../store/useStore';

export default function LoginScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const setUser = useStore((state) => state.setUser);
  const setActivePeriod = useStore((state) => state.setActivePeriod);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Gagal', 'NIK/NIP dan Password harus diisi.');
      return;
    }
    setLoading(true);
    try {
      const db = await getDb();
      const passwordHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        password
      );
      const user = await db.getFirstAsync(
        'SELECT * FROM pengguna WHERE username = ? AND password_hash = ?',
        [username, passwordHash]
      );
      if (user) {
        setUser({
          id_pengguna: user.id_pengguna,
          username: user.username,
          nama_lengkap: user.nama_lengkap,
          mata_pelajaran: user.mata_pelajaran || '',
        });
        // Cek periode aktif milik user ini
        const activePeriod = await db.getFirstAsync(
          'SELECT * FROM periode_ajaran WHERE id_pengguna = ? AND is_active = 1',
          [user.id_pengguna]
        );
        if (activePeriod) {
          setActivePeriod(activePeriod);
          navigation.replace('Dashboard');
        } else {
          navigation.replace('PeriodSetup');
        }
      } else {
        Alert.alert('Masuk Gagal', 'NIK/NIP atau Password salah. Periksa kembali data Anda.');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Gagal', 'Terjadi kesalahan saat login.');
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
        <View style={styles.headerSection}>
          <View style={styles.logoContainer}>
            <Ionicons name="school" size={44} color="#fff" />
          </View>
          <Text style={styles.appName}>EduPresensi</Text>
          <Text style={styles.tagline}>Sistem Manajemen Absensi & Nilai</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Selamat Datang 👋</Text>
          <Text style={styles.cardSubtitle}>Masuk untuk melanjutkan</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>NIK / NIP</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Masukkan NIK/NIP Anda"
                placeholderTextColor="#94a3b8"
                value={username}
                onChangeText={(text) => setUsername(text.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Masukkan password"
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

          <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgotBtn}>
            <Text style={styles.forgotText}>Lupa Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Memproses...' : 'Masuk'}</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>atau</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity onPress={() => navigation.replace('Register')} style={styles.registerBtn}>
            <Text style={styles.registerText}>
              Belum punya akun? <Text style={styles.registerTextBold}>Buat Akun</Text>
            </Text>
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
  headerSection: { alignItems: 'center', paddingTop: 64, paddingBottom: 40, paddingHorizontal: 24 },
  logoContainer: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  appName: { fontSize: 32, fontWeight: 'bold', color: '#ffffff', letterSpacing: 1 },
  tagline: { fontSize: 14, color: '#bfdbfe', marginTop: 6 },
  card: {
    backgroundColor: '#ffffff', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 28, paddingTop: 32, flex: 1, minHeight: 460,
  },
  cardTitle: { fontSize: 24, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
  cardSubtitle: { fontSize: 15, color: '#64748b', marginBottom: 28 },
  inputGroup: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8, letterSpacing: 0.3 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 13, fontSize: 15, color: '#0f172a' },
  eyeBtn: { padding: 4 },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 20, marginTop: -6 },
  forgotText: { color: '#2563eb', fontSize: 13, fontWeight: '600' },
  button: {
    backgroundColor: '#2563eb', padding: 16, borderRadius: 12, alignItems: 'center',
    shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  buttonDisabled: { backgroundColor: '#93c5fd' },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', letterSpacing: 0.5 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  dividerText: { marginHorizontal: 12, color: '#94a3b8', fontSize: 13 },
  registerBtn: { alignItems: 'center' },
  registerText: { color: '#64748b', fontSize: 14 },
  registerTextBold: { color: '#2563eb', fontWeight: 'bold' },
  footer: { textAlign: 'center', color: '#bfdbfe', fontSize: 12, paddingVertical: 16, backgroundColor: '#1d4ed8' },
});
