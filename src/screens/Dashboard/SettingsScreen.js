import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ScrollView, Modal, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useStore from '../../store/useStore';
import { getDb } from '../../database/db';
import * as FileSystem from 'expo-file-system/legacy';
import { File as ExpoFile, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';

export default function SettingsScreen({ navigation }) {
  const logout = useStore((state) => state.logout);
  const activePeriod = useStore((state) => state.activePeriod);
  const setActivePeriod = useStore((state) => state.setActivePeriod);
  const user = useStore((state) => state.user);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tahunGroups, setTahunGroups] = useState([]); // [{tahun_ajaran, s1, s2}]
  const [periodModalVisible, setPeriodModalVisible] = useState(false);
  const [newTahunAjaran, setNewTahunAjaran] = useState('');
  const [subjectModalVisible, setSubjectModalVisible] = useState(false);
  const [editSubject, setEditSubject] = useState(user?.mata_pelajaran || '');
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [aboutModalVisible, setAboutModalVisible] = useState(false);
  const setUser = useStore((state) => state.setUser);

  const fetchPeriods = async () => {
    if (!user) return;
    const db = await getDb();
    const rows = await db.getAllAsync(
      'SELECT * FROM periode_ajaran WHERE id_pengguna = ? ORDER BY tahun_ajaran ASC, semester ASC',
      [user.id_pengguna]
    );
    // Kelompokkan per tahun_ajaran
    const groups = {};
    rows.forEach(p => {
      if (!groups[p.tahun_ajaran]) groups[p.tahun_ajaran] = { tahun_ajaran: p.tahun_ajaran, s1: null, s2: null };
      if (p.semester === 1) groups[p.tahun_ajaran].s1 = p;
      if (p.semester === 2) groups[p.tahun_ajaran].s2 = p;
    });
    setTahunGroups(Object.values(groups));
  };

  useFocusEffect(useCallback(() => {
    fetchPeriods();
  }, [user]));

  const handleLogout = () => {
    Alert.alert('Keluar Aplikasi', 'Yakin ingin keluar? Anda perlu login kembali.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Keluar', style: 'destructive',
        onPress: () => { logout(); navigation.replace('Login'); }
      }
    ]);
  };

  const handleAddTahunAjaran = async () => {
    const regexTahun = /^\d{4}\/\d{4}$/;
    if (!regexTahun.test(newTahunAjaran.trim())) {
      Alert.alert('Format Salah', 'Format tahun ajaran harus "YYYY/YYYY".\nContoh: 2026/2027');
      return;
    }
    try {
      const db = await getDb();
      // Cek apakah tahun ajaran ini sudah ada untuk user ini
      const existing = await db.getFirstAsync(
        'SELECT id_periode FROM periode_ajaran WHERE id_pengguna = ? AND tahun_ajaran = ?',
        [user.id_pengguna, newTahunAjaran.trim()]
      );
      if (existing) {
        Alert.alert('Sudah Ada', `Tahun ajaran ${newTahunAjaran.trim()} sudah terdaftar.`);
        return;
      }
      // Otomatis buat Semester 1 DAN Semester 2
      await db.runAsync(
        'INSERT INTO periode_ajaran (id_pengguna, tahun_ajaran, semester, is_active) VALUES (?, ?, 1, 0)',
        [user.id_pengguna, newTahunAjaran.trim()]
      );
      await db.runAsync(
        'INSERT INTO periode_ajaran (id_pengguna, tahun_ajaran, semester, is_active) VALUES (?, ?, 2, 0)',
        [user.id_pengguna, newTahunAjaran.trim()]
      );
      setNewTahunAjaran('');
      setPeriodModalVisible(false);
      fetchPeriods();
      Alert.alert('Berhasil', `Tahun ajaran ${newTahunAjaran.trim()} (Semester 1 & 2) berhasil ditambahkan.\nTap "Aktifkan" untuk mulai menggunakannya.`);
    } catch (error) {
      console.error(error);
      Alert.alert('Gagal', 'Gagal menambahkan periode.');
    }
  };

  const handleActivatePeriod = (period) => {
    Alert.alert(
      'Ganti Periode Aktif?',
      `Ubah ke tahun ajaran ${period.tahun_ajaran} - Semester ${period.semester}?\n\nTampilan data Absensi dan Nilai pada menu lain akan direfresh sesuai periode ini.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ya, Ganti',
          onPress: async () => {
            try {
              const db = await getDb();
              await db.runAsync('UPDATE periode_ajaran SET is_active = 0 WHERE id_pengguna = ?', [user.id_pengguna]);
              await db.runAsync('UPDATE periode_ajaran SET is_active = 1 WHERE id_periode = ?', [period.id_periode]);
              const updated = { ...period, is_active: 1 };
              setActivePeriod(updated);
              fetchPeriods();
            } catch (error) {
              console.error(error);
            }
          }
        }
      ]
    );
  };

  const handleDeleteTahunAjaran = (tahun_ajaran) => {
    const isAktif = activePeriod?.tahun_ajaran === tahun_ajaran;
    if (isAktif) {
      Alert.alert('Tidak Dapat Dihapus', 'Tahun ajaran yang sedang aktif tidak bisa dihapus.\nAktifkan tahun ajaran lain terlebih dahulu.');
      return;
    }
    Alert.alert(
      '⚠️ Hapus Tahun Ajaran?',
      `Hapus ${tahun_ajaran} (Semester 1 & 2)?\n\n• Data nilai dan absensi akan terhapus\n• Kelas di tahun ini akan terhapus\n• Data siswa TIDAK terhapus`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus', style: 'destructive',
          onPress: async () => {
            const db = await getDb();
            // Hapus kelas untuk tahun ini (CASCADE: siswa_kelas)
            await db.runAsync('DELETE FROM kelas WHERE id_pengguna = ? AND tahun_ajaran = ?', [user.id_pengguna, tahun_ajaran]);
            // Hapus periode (CASCADE: kriteria_nilai → nilai, absensi)
            await db.runAsync('DELETE FROM periode_ajaran WHERE id_pengguna = ? AND tahun_ajaran = ?', [user.id_pengguna, tahun_ajaran]);
            fetchPeriods();
          }
        }
      ]
    );
  };

  const handleBackup = async () => {
    Alert.alert(
      'Cadangkan Database',
      'Pilih cara menyimpan file backup:',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: '📤 Bagikan (Share)',
          onPress: () => doBackup('share'),
        },
        {
          text: '💾 Simpan ke Perangkat',
          onPress: () => doBackup('save'),
        },
      ]
    );
  };

  const doBackup = async (mode) => {
    try {
      setIsProcessing(true);
      const db = await getDb();

      const docDir = FileSystem.documentDirectory.replace('file://', '').replace(/\/$/, '');
      const backupDbName = `EduPresensi_Backup_${Date.now()}.db`;
      const backupUri = `${FileSystem.documentDirectory}${backupDbName}`;

      // Buka koneksi database baru di documentDirectory
      const backupDb = await SQLite.openDatabaseAsync(backupDbName, undefined, docDir);

      // Lakukan backup native SQLite
      await SQLite.backupDatabaseAsync({
        sourceDatabase: db,
        destDatabase: backupDb
      });
      await backupDb.closeAsync();

      if (mode === 'save') {
        // Simpan ke folder yang dipilih user (mis. Downloads) via StorageAccessFramework
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permissions.granted) {
          Alert.alert('Izin Ditolak', 'Tidak bisa menyimpan file tanpa izin akses folder.');
          await FileSystem.deleteAsync(backupUri, { idempotent: true });
          return;
        }
        // Baca konten file backup
        const fileContent = await FileSystem.readAsStringAsync(backupUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        // Buat file baru di folder yang dipilih user
        const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          backupDbName,
          'application/octet-stream'
        );
        await FileSystem.writeAsStringAsync(destUri, fileContent, {
          encoding: FileSystem.EncodingType.Base64,
        });
        // Hapus file sementara
        await FileSystem.deleteAsync(backupUri, { idempotent: true });
        Alert.alert('✅ Berhasil Disimpan', `File backup berhasil disimpan ke folder yang Anda pilih:\n${backupDbName}`);
      } else {
        // Share via apps
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(backupUri, { dialogTitle: 'Simpan / Bagikan File Backup', mimeType: 'application/octet-stream' });
        } else {
          Alert.alert('Backup Berhasil', `File backup tersedia di:\n${backupUri}`);
        }
        // Hapus file sementara setelah share selesai
        await FileSystem.deleteAsync(backupUri, { idempotent: true });
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Gagal', 'Terjadi kesalahan saat backup. Coba lagi.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = () => {
    Alert.alert('⚠️ Pulihkan Database?', 'Semua data saat ini akan ditimpa. Lanjutkan?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Lanjutkan', style: 'destructive',
        onPress: async () => {
          try {
            // Gunakan File.pickFileAsync dari expo-file-system baru
            // (menghindari masalah izin baca pada expo-document-picker)
            const pickResult = await ExpoFile.pickFileAsync({ mimeTypes: ['application/octet-stream', '*/*'] });
            if (pickResult.canceled) return;
            setIsProcessing(true);
            const db = await getDb();

            const docDir = FileSystem.documentDirectory.replace('file://', '').replace(/\/$/, '');
            const tempDbName = `temp_restore_${Date.now()}.db`;

            // Baca konten file backup sebagai base64 (File API baru punya izin penuh)
            const pickedFile = pickResult.result;
            const base64Content = await pickedFile.base64();

            // Tulis ke documentDirectory sebagai file sementara
            const tempUri = `${FileSystem.documentDirectory}${tempDbName}`;
            await FileSystem.writeAsStringAsync(tempUri, base64Content, {
              encoding: FileSystem.EncodingType.Base64,
            });

            // Buka database sumber dari file sementara
            const sourceDb = await SQLite.openDatabaseAsync(tempDbName, undefined, docDir);

            // Lakukan restore secara native ke database utama
            await SQLite.backupDatabaseAsync({
              sourceDatabase: sourceDb,
              destDatabase: db
            });

            // Bersihkan file sementara
            await sourceDb.closeAsync();
            await FileSystem.deleteAsync(tempUri, { idempotent: true });

            Alert.alert('✅ Berhasil', 'Database dipulihkan. Aplikasi akan kembali ke halaman login.', [
              { text: 'OK', onPress: () => { logout(); navigation.replace('Login'); } }
            ]);
          } catch (error) {
            console.error(error);
            Alert.alert('Gagal', 'Gagal memulihkan database. Pastikan file yang dipilih adalah file backup EduPresensi yang valid (.db).');
          } finally {
            setIsProcessing(false);
          }
        }
      }
    ]);
  };


  const handleUpdateSubject = async () => {
    if (!editSubject.trim()) {
      Alert.alert('Gagal', 'Mata Pelajaran tidak boleh kosong.');
      return;
    }
    try {
      const db = await getDb();
      await db.runAsync('UPDATE pengguna SET mata_pelajaran = ? WHERE id_pengguna = ?', [editSubject.trim(), user.id_pengguna]);
      setUser({ ...user, mata_pelajaran: editSubject.trim() });
      setSubjectModalVisible(false);
      Alert.alert('Berhasil', 'Mata Pelajaran berhasil diperbarui.');
    } catch (error) {
      console.error(error);
      Alert.alert('Gagal', 'Gagal memperbarui mata pelajaran.');
    }
  };

  const confirmDeleteAccount = () => {
    setDeletePassword('');
    setDeleteModalVisible(true);
  };

  const executeDeleteAccount = async () => {
    if (!deletePassword) {
      Alert.alert('Gagal', 'Masukkan password Anda.');
      return;
    }
    try {
      const db = await getDb();
      const currentUser = await db.getFirstAsync('SELECT password_hash FROM pengguna WHERE id_pengguna = ?', [user.id_pengguna]);
      if (!currentUser) return;
      
      const passwordHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, deletePassword);
      if (passwordHash !== currentUser.password_hash) {
        Alert.alert('Gagal', 'Password salah. Akun tidak dapat dihapus.');
        return;
      }
      
      await db.runAsync('DELETE FROM pengguna WHERE id_pengguna = ?', [user.id_pengguna]);
      setDeleteModalVisible(false);
      Alert.alert('Berhasil', 'Akun dan seluruh data Anda telah dihapus secara permanen.', [
        { text: 'OK', onPress: () => { logout(); navigation.replace('Login'); } }
      ]);
    } catch (error) {
      console.error(error);
      Alert.alert('Gagal', 'Terjadi kesalahan saat menghapus akun.');
    }
  };

  // Ekspor fungsi dihapus dari SettingsScreen

  const MenuButton = ({ icon, label, onPress, color = '#0f172a', bg = '#f1f5f9', disabled }) => (
    <TouchableOpacity style={[styles.menuBtn, { backgroundColor: bg }, disabled && styles.menuBtnDisabled]} onPress={onPress} disabled={disabled}>
      <Ionicons name={icon} size={20} color={disabled ? '#94a3b8' : color} />
      <Text style={[styles.menuBtnText, { color: disabled ? '#94a3b8' : color }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={disabled ? '#cbd5e1' : '#94a3b8'} />
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header Profil */}
      <View style={styles.header}>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>
            {(user?.nama_lengkap || user?.username || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>{user?.nama_lengkap || 'Guru'}</Text>
          <Text style={styles.headerUsername}>NIK/NIP: {user?.username}</Text>
          <Text style={styles.headerSubject}>Mata Pelajaran: {user?.mata_pelajaran || 'Belum Diatur'}</Text>
          {activePeriod && (
            <View style={styles.activePeriodBadge}>
              <Ionicons name="radio-button-on" size={10} color="#10b981" />
              <Text style={styles.activePeriodText}>
                {activePeriod.tahun_ajaran} · Sem {activePeriod.semester}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Seksi Profil & Akun */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="person-outline" size={18} color="#2563eb" />
          <Text style={styles.sectionTitle}>Profil & Akun</Text>
        </View>
        <MenuButton icon="book-outline" label="Ubah Mata Pelajaran" onPress={() => { setEditSubject(user?.mata_pelajaran || ''); setSubjectModalVisible(true); }} color="#2563eb" bg="#eff6ff" disabled={isProcessing} />
        <MenuButton icon="trash-outline" label="Hapus Akun Permanen" onPress={confirmDeleteAccount} color="#b91c1c" bg="#fef2f2" disabled={isProcessing} />
      </View>

      {/* Seksi Tahun Ajaran */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="calendar" size={18} color="#1d4ed8" />
          <Text style={styles.sectionTitle}>Tahun Ajaran</Text>
          <TouchableOpacity style={styles.addPeriodBtn} onPress={() => setPeriodModalVisible(true)}>
            <Ionicons name="add" size={16} color="#2563eb" />
            <Text style={styles.addPeriodBtnText}>Tambah</Text>
          </TouchableOpacity>
        </View>

        {tahunGroups.length === 0 ? (
          <Text style={styles.emptyText}>Belum ada tahun ajaran.</Text>
        ) : (
          tahunGroups.map(group => {
            const isYearActive = activePeriod?.tahun_ajaran === group.tahun_ajaran;
            return (
              <View key={group.tahun_ajaran} style={[styles.yearCard, isYearActive && styles.yearCardActive]}>
                <View style={styles.yearCardHeader}>
                  <Ionicons name="calendar-outline" size={18} color={isYearActive ? '#1d4ed8' : '#64748b'} />
                  <Text style={[styles.yearTitle, isYearActive && styles.yearTitleActive]}>
                    {group.tahun_ajaran}
                  </Text>
                  {!isYearActive && (
                    <TouchableOpacity onPress={() => handleDeleteTahunAjaran(group.tahun_ajaran)} style={styles.deleteYearBtn}>
                      <Ionicons name="trash-outline" size={17} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.semesterRow}>
                  {[group.s1, group.s2].map((p, idx) => {
                    if (!p) return null;
                    const isActive = p.is_active === 1;
                    return (
                      <TouchableOpacity
                        key={p.id_periode}
                        style={[styles.semBtn, isActive && styles.semBtnActive]}
                        onPress={() => !isActive && handleActivatePeriod(p)}
                        disabled={isActive}
                      >
                        {isActive && <Ionicons name="checkmark-circle" size={14} color="#fff" />}
                        <Text style={[styles.semBtnText, isActive && styles.semBtnTextActive]}>
                          Semester {p.semester}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}
      </View>


      {/* Seksi Database */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="server-outline" size={18} color="#9333ea" />
          <Text style={styles.sectionTitle}>Cadangan Database</Text>
        </View>
        <MenuButton icon="cloud-upload-outline" label="Cadangkan Database" onPress={handleBackup} color="#6b21a8" bg="#faf5ff" disabled={isProcessing} />
        <MenuButton icon="cloud-download-outline" label="Pulihkan Database" onPress={handleRestore} color="#9a3412" bg="#fff7ed" disabled={isProcessing} />
      </View>

      {/* Seksi Informasi */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="information-circle-outline" size={18} color="#059669" />
          <Text style={styles.sectionTitle}>Informasi Aplikasi</Text>
        </View>
        <MenuButton icon="help-circle-outline" label="Tentang Aplikasi" onPress={() => setAboutModalVisible(true)} color="#059669" bg="#ecfdf5" disabled={isProcessing} />
      </View>

      {/* Logout */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#fff" />
          <Text style={styles.logoutBtnText}>Keluar (Logout)</Text>
        </TouchableOpacity>
      </View>

      {/* Modal Tambah Tahun Ajaran */}
      <Modal visible={periodModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Tambah Tahun Ajaran</Text>

            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={18} color="#2563eb" />
              <Text style={styles.infoText}>
                Menambah tahun ajaran akan otomatis membuat <Text style={{ fontWeight: 'bold' }}>Semester 1 dan Semester 2</Text>. Tap "Aktifkan" untuk menggunakannya.
              </Text>
            </View>

            <Text style={styles.inputLabel}>Tahun Ajaran</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Contoh: 2026/2027"
              placeholderTextColor="#94a3b8"
              value={newTahunAjaran}
              onChangeText={setNewTahunAjaran}
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setPeriodModalVisible(false); setNewTahunAjaran(''); }}>
                <Text style={styles.cancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddTahunAjaran}>
                <Text style={styles.saveBtnText}>Tambah</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Ubah Mata Pelajaran */}
      <Modal visible={subjectModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Ubah Mata Pelajaran</Text>
            <Text style={styles.inputLabel}>Mata Pelajaran</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Contoh: Matematika"
              placeholderTextColor="#94a3b8"
              value={editSubject}
              onChangeText={setEditSubject}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setSubjectModalVisible(false); }}>
                <Text style={styles.cancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateSubject}>
                <Text style={styles.saveBtnText}>Simpan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Konfirmasi Hapus Akun */}
      <Modal visible={deleteModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: '#ef4444' }]}>Hapus Akun Permanen</Text>
            
            <View style={[styles.infoBox, { backgroundColor: '#fef2f2' }]}>
              <Ionicons name="warning" size={18} color="#dc2626" />
              <Text style={[styles.infoText, { color: '#b91c1c' }]}>
                Peringatan: Seluruh data (kelas, absensi, nilai) akan dihapus secara permanen dan tidak dapat dipulihkan!
              </Text>
            </View>

            <Text style={styles.inputLabel}>Konfirmasi Password</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Masukkan password akun Anda"
              placeholderTextColor="#94a3b8"
              value={deletePassword}
              onChangeText={setDeletePassword}
              secureTextEntry
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeleteModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#ef4444' }]} onPress={executeDeleteAccount}>
                <Text style={styles.saveBtnText}>Hapus Akun</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Tentang Aplikasi */}
      <Modal visible={aboutModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.aboutCard}>
            {/* Header Banner */}
            <View style={styles.aboutBanner}>
              <View style={styles.aboutLogoRing}>
                <Ionicons name="school" size={36} color="#fff" />
              </View>
              <Text style={styles.aboutAppName}>EduPresensi</Text>
              <View style={styles.aboutVersionBadge}>
                <Text style={styles.aboutVersionText}>v 1.0.0</Text>
              </View>
            </View>

            {/* Info Rows */}
            <View style={styles.aboutBody}>
              <View style={styles.aboutInfoRow}>
                <View style={[styles.aboutInfoIcon, { backgroundColor: '#eff6ff' }]}>
                  <Ionicons name="code-slash-outline" size={18} color="#2563eb" />
                </View>
                <View style={styles.aboutInfoText}>
                  <Text style={styles.aboutInfoLabel}>Programmer</Text>
                  <Text style={styles.aboutInfoValue}>Andri Fernanda, S.Pd., Gr.</Text>
                </View>
              </View>

              <View style={styles.aboutDivider} />

              <View style={styles.aboutInfoRow}>
                <View style={[styles.aboutInfoIcon, { backgroundColor: '#f0fdf4' }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#16a34a" />
                </View>
                <View style={styles.aboutInfoText}>
                  <Text style={styles.aboutInfoLabel}>Keamanan Data</Text>
                  <Text style={styles.aboutInfoValue}>Offline & Tersimpan Lokal</Text>
                </View>
              </View>

              <View style={styles.aboutDivider} />

              <View style={styles.aboutInfoRow}>
                <View style={[styles.aboutInfoIcon, { backgroundColor: '#fef9c3' }]}>
                  <Ionicons name="star-outline" size={18} color="#ca8a04" />
                </View>
                <View style={styles.aboutInfoText}>
                  <Text style={styles.aboutInfoLabel}>Fitur Utama</Text>
                  <Text style={styles.aboutInfoValue}>Absensi • Nilai • Analisis • Ekspor</Text>
                </View>
              </View>
            </View>

            {/* Footer */}
            <View style={styles.aboutFooter}>
              <Text style={styles.aboutCopyright}>© 2026 EduPresensi. All rights reserved.</Text>
              <TouchableOpacity style={styles.aboutCloseBtn} onPress={() => setAboutModalVisible(false)}>
                <Text style={styles.aboutCloseBtnText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: '#1d4ed8', padding: 20, paddingTop: 24,
  },
  headerAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center',
  },
  headerAvatarText: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerName: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  headerUsername: { fontSize: 13, color: '#bfdbfe', marginTop: 2 },
  headerSubject: { fontSize: 13, color: '#93c5fd', marginTop: 2, fontStyle: 'italic' },
  activePeriodBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  activePeriodText: { fontSize: 12, color: '#bbf7d0', fontWeight: '600' },
  section: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16,
    borderRadius: 16, padding: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 2,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: 'bold', color: '#0f172a' },
  addPeriodBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#eff6ff', borderRadius: 20,
  },
  addPeriodBtnText: { fontSize: 13, color: '#2563eb', fontWeight: '700' },
  emptyText: { color: '#94a3b8', textAlign: 'center', paddingVertical: 12 },
  yearCard: {
    borderRadius: 12, padding: 14, marginBottom: 12,
    backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  yearCardActive: { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' },
  yearCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  yearTitle: { flex: 1, fontSize: 16, fontWeight: 'bold', color: '#64748b' },
  yearTitleActive: { color: '#1d4ed8' },
  deleteYearBtn: { padding: 4 },
  semesterRow: { flexDirection: 'row', gap: 10 },
  semBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  semBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  semBtnText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  semBtnTextActive: { color: '#fff' },
  menuBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 12, marginBottom: 10,
  },
  menuBtnDisabled: { opacity: 0.6 },
  menuBtnText: { flex: 1, fontSize: 15, fontWeight: '600' },
  logoutBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    backgroundColor: '#ef4444', padding: 16, borderRadius: 12,
  },
  logoutBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingTop: 16,
  },
  modalHandle: { width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a', marginBottom: 14 },
  infoBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  infoText: { flex: 1, fontSize: 13, color: '#1e40af', lineHeight: 19 },
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8 },
  modalInput: {
    backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 12, padding: 13, fontSize: 15, color: '#0f172a', marginBottom: 20,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center' },
  cancelBtnText: { fontWeight: 'bold', color: '#64748b' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center' },
  saveBtnText: { fontWeight: 'bold', color: '#fff' },

  // About Modal Styles
  aboutCard: {
    backgroundColor: '#fff', marginHorizontal: 24, borderRadius: 24, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, elevation: 12,
  },
  aboutBanner: {
    backgroundColor: '#1d4ed8', alignItems: 'center', paddingTop: 32, paddingBottom: 28,
    paddingHorizontal: 24,
  },
  aboutLogoRing: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  aboutAppName: { fontSize: 26, fontWeight: 'bold', color: '#fff', letterSpacing: 0.5, marginBottom: 8 },
  aboutVersionBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  aboutVersionText: { fontSize: 13, color: '#bfdbfe', fontWeight: '600', letterSpacing: 1 },
  aboutBody: { paddingHorizontal: 20, paddingVertical: 8 },
  aboutInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  aboutInfoIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  aboutInfoText: { flex: 1 },
  aboutInfoLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  aboutInfoValue: { fontSize: 14, color: '#0f172a', fontWeight: '700' },
  aboutDivider: { height: 1, backgroundColor: '#f1f5f9', marginLeft: 54 },
  aboutFooter: { paddingHorizontal: 20, paddingBottom: 24, paddingTop: 8, alignItems: 'center', gap: 14 },
  aboutCopyright: { fontSize: 12, color: '#94a3b8', textAlign: 'center' },
  aboutCloseBtn: {
    width: '100%', backgroundColor: '#1d4ed8', paddingVertical: 14, borderRadius: 14, alignItems: 'center',
  },
  aboutCloseBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
