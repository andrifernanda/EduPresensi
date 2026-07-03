import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, TextInput, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDb } from '../../database/db';
import useStore from '../../store/useStore';
import { useFocusEffect } from '@react-navigation/native';

export default function ClassScreen({ navigation }) {
  const activePeriod = useStore((state) => state.activePeriod);
  const user = useStore((state) => state.user);
  const [classes, setClasses] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [namaKelas, setNamaKelas] = useState('');

  const fetchClasses = async () => {
    if (!activePeriod || !user) return;
    try {
      const db = await getDb();
      // Kelas difilter berdasarkan tahun_ajaran (berlaku untuk kedua semester)
      const data = await db.getAllAsync(`
        SELECT k.*, COUNT(sk.id_siswa) as jumlah_siswa
        FROM kelas k
        LEFT JOIN siswa_kelas sk ON sk.id_kelas = k.id_kelas
        WHERE k.id_pengguna = ? AND k.tahun_ajaran = ?
        GROUP BY k.id_kelas
        ORDER BY k.nama_kelas ASC
      `, [user.id_pengguna, activePeriod.tahun_ajaran]);
      setClasses(data);
    } catch (error) {
      console.error(error);
    }
  };

  useFocusEffect(useCallback(() => {
    fetchClasses();
  }, [activePeriod, user]));

  const handleAddClass = async () => {
    if (!namaKelas.trim()) { Alert.alert('Gagal', 'Nama kelas tidak boleh kosong.'); return; }
    try {
      const db = await getDb();
      await db.runAsync(
        'INSERT INTO kelas (id_pengguna, tahun_ajaran, nama_kelas) VALUES (?, ?, ?)',
        [user.id_pengguna, activePeriod.tahun_ajaran, namaKelas.trim()]
      );
      setNamaKelas('');
      setModalVisible(false);
      fetchClasses();
    } catch (error) {
      if (error.message?.includes('UNIQUE')) {
        Alert.alert('Gagal', 'Nama kelas sudah ada di tahun ajaran ini.');
      } else {
        console.error(error);
        Alert.alert('Gagal', 'Gagal menambahkan kelas.');
      }
    }
  };

  const handleDeleteClass = (id_kelas, nama) => {
    Alert.alert(
      'Hapus Kelas?',
      `Hapus kelas "${nama}"?\n\nSiswa tidak akan terhapus — mereka akan dikembalikan ke Lobby.\nIni berlaku untuk KEDUA semester di tahun ajaran yang sama.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus Kelas', style: 'destructive',
          onPress: async () => {
            const db = await getDb();
            await db.runAsync('DELETE FROM kelas WHERE id_kelas = ?', [id_kelas]);
            fetchClasses();
          }
        }
      ]
    );
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ClassDetail', { id_kelas: item.id_kelas, nama_kelas: item.nama_kelas })}
      activeOpacity={0.7}
    >
      <View style={styles.cardIconContainer}>
        <Ionicons name="school" size={26} color="#1d4ed8" />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.className}>{item.nama_kelas}</Text>
        <Text style={styles.classInfo}>{item.jumlah_siswa} siswa · berlaku 2 semester</Text>
      </View>
      <TouchableOpacity
        onPress={() => handleDeleteClass(item.id_kelas, item.nama_kelas)}
        style={styles.deleteBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="trash-outline" size={19} color="#ef4444" />
      </TouchableOpacity>
      <Ionicons name="chevron-forward" size={20} color="#cbd5e1" style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );

  if (!activePeriod) {
    return (
      <View style={styles.center}>
        <Ionicons name="calendar-outline" size={56} color="#cbd5e1" />
        <Text style={styles.centerTitle}>Periode Belum Diatur</Text>
        <Text style={styles.centerDesc}>Atur tahun ajaran di Pengaturan terlebih dahulu.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.periodBar}>
        <Ionicons name="calendar-outline" size={14} color="#1d4ed8" />
        <Text style={styles.periodText}>
          {activePeriod.tahun_ajaran} — Berlaku untuk Semester 1 & 2
        </Text>
        <View style={styles.periodBadge}>
          <Text style={styles.periodBadgeText}>{classes.length} Kelas</Text>
        </View>
      </View>

      <FlatList
        data={classes}
        keyExtractor={item => item.id_kelas.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>Belum Ada Kelas</Text>
            <Text style={styles.emptyDesc}>
              Buat kelas baru — otomatis berlaku untuk Semester 1 dan Semester 2.
            </Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Tambah Kelas Baru</Text>
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={16} color="#2563eb" />
              <Text style={styles.infoText}>
                Kelas ini akan berlaku untuk <Text style={{ fontWeight: 'bold' }}>Semester 1 dan Semester 2</Text> tahun ajaran {activePeriod.tahun_ajaran}.
              </Text>
            </View>
            <Text style={styles.inputLabel}>Nama Kelas</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Contoh: 7A, Kelas 8 IPA, Kelas 1"
              placeholderTextColor="#94a3b8"
              value={namaKelas}
              onChangeText={setNamaKelas}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setModalVisible(false); setNamaKelas(''); }}>
                <Text style={styles.cancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddClass}>
                <Text style={styles.saveBtnText}>Buat Kelas</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  centerTitle: { fontSize: 18, fontWeight: 'bold', color: '#334155', marginTop: 16 },
  centerDesc: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 8 },
  periodBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#eff6ff', borderBottomWidth: 1, borderBottomColor: '#bfdbfe',
  },
  periodText: { flex: 1, fontSize: 13, color: '#1d4ed8', fontWeight: '600' },
  periodBadge: { backgroundColor: '#2563eb', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  periodBadgeText: { fontSize: 11, color: '#fff', fontWeight: 'bold' },
  listContainer: { padding: 16, paddingBottom: 100 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, elevation: 2,
  },
  cardIconContainer: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: '#dbeafe', justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  cardContent: { flex: 1 },
  className: { fontSize: 17, fontWeight: 'bold', color: '#0f172a' },
  classInfo: { fontSize: 12, color: '#64748b', marginTop: 3 },
  deleteBtn: { padding: 6 },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#64748b', marginTop: 16 },
  emptyDesc: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  fab: {
    position: 'absolute', right: 24, bottom: 24,
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#2563eb',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, elevation: 6,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingTop: 16,
  },
  modalHandle: { width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a', marginBottom: 14 },
  infoBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#eff6ff', borderRadius: 10, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  infoText: { flex: 1, fontSize: 12, color: '#1e40af', lineHeight: 18 },
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8 },
  modalInput: {
    backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 12, padding: 13, fontSize: 15, color: '#0f172a', marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center' },
  cancelBtnText: { fontWeight: 'bold', color: '#64748b' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center' },
  saveBtnText: { fontWeight: 'bold', color: '#fff' },
});
