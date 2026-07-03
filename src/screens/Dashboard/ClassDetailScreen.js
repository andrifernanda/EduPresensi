import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, Modal, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDb } from '../../database/db';
import useStore from '../../store/useStore';
import { useFocusEffect } from '@react-navigation/native';

export default function ClassDetailScreen({ route, navigation }) {
  const { id_kelas, nama_kelas } = route.params;
  const activePeriod = useStore((state) => state.activePeriod);
  const user = useStore((state) => state.user);
  const [students, setStudents] = useState([]);
  const [lobbyStudents, setLobbyStudents] = useState([]);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [searchLobby, setSearchLobby] = useState('');

  const fetchData = async () => {
    try {
      const db = await getDb();

      // Siswa di kelas ini
      const inClass = await db.getAllAsync(`
        SELECT s.* FROM siswa s
        INNER JOIN siswa_kelas sk ON sk.id_siswa = s.id_siswa
        WHERE sk.id_kelas = ?
        ORDER BY s.nama ASC
      `, [id_kelas]);
      setStudents(inClass);

      // Siswa di lobby: belum masuk kelas manapun di tahun ajaran yang sama
      if (activePeriod && user) {
        const lobby = await db.getAllAsync(`
          SELECT s.* FROM siswa s
          WHERE s.id_pengguna = ?
          AND s.id_siswa NOT IN (
            SELECT sk2.id_siswa FROM siswa_kelas sk2
            INNER JOIN kelas k ON k.id_kelas = sk2.id_kelas
            WHERE k.id_pengguna = ? AND k.tahun_ajaran = ?
          )
          ORDER BY s.nama ASC
        `, [user.id_pengguna, user.id_pengguna, activePeriod.tahun_ajaran]);
        setLobbyStudents(lobby);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useFocusEffect(useCallback(() => {
    navigation.setOptions({ title: nama_kelas, headerShown: true });
    fetchData();
  }, [id_kelas]));

  const addStudentToClass = async (id_siswa, namaSiswa) => {
    try {
      const db = await getDb();
      await db.runAsync(
        'INSERT INTO siswa_kelas (id_siswa, id_kelas) VALUES (?, ?)',
        [id_siswa, id_kelas]
      );

      // --- SINKRONISASI NILAI (MIGRASI) ---
      // Jika siswa dipindah, kita coba salin nilainya ke kelas baru jika nama kriterianya sama
      if (activePeriod) {
        // 1. Ambil kriteria di kelas tujuan
        const targetCriteria = await db.getAllAsync(
          'SELECT * FROM kriteria_nilai WHERE id_kelas = ? AND id_periode = ?', 
          [id_kelas, activePeriod.id_periode]
        );

        if (targetCriteria.length > 0) {
          // 2. Ambil nilai siswa dari kelas-kelas lain di periode yang sama
          const oldGrades = await db.getAllAsync(`
            SELECT n.nilai, k.nama_kriteria
            FROM nilai n
            INNER JOIN kriteria_nilai k ON n.id_kriteria = k.id_kriteria
            WHERE n.id_siswa = ? 
              AND k.id_periode = ?
              AND k.id_kelas != ?
          `, [id_siswa, activePeriod.id_periode, id_kelas]);

          // 3. Cocokkan nama kriteria dan masukkan nilainya ke kriteria kelas baru (abaikan jika sudah ada)
          for (const grade of oldGrades) {
            const matchingCriteria = targetCriteria.find(
              c => c.nama_kriteria.toLowerCase().trim() === grade.nama_kriteria.toLowerCase().trim()
            );
            if (matchingCriteria) {
              await db.runAsync(`
                INSERT OR IGNORE INTO nilai (id_siswa, id_kriteria, nilai) 
                VALUES (?, ?, ?)
              `, [id_siswa, matchingCriteria.id_kriteria, grade.nilai]);
            }
          }
        }
      }
      // ------------------------------------

      fetchData();
    } catch (error) {
      console.error(error);
      Alert.alert('Gagal', 'Gagal menambahkan siswa ke kelas.');
    }
  };

  const removeStudentFromClass = (id_siswa, namaSiswa) => {
    Alert.alert(
      'Keluarkan Siswa?',
      `"${namaSiswa}" akan dikembalikan ke Lobby.\n\nData nilai dan absensinya di semester ini tetap tersimpan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Keluarkan', style: 'destructive',
          onPress: async () => {
            const db = await getDb();
            await db.runAsync(
              'DELETE FROM siswa_kelas WHERE id_siswa = ? AND id_kelas = ?',
              [id_siswa, id_kelas]
            );
            fetchData();
          }
        }
      ]
    );
  };

  const renderClassStudent = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.nama.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.studentName}>{item.nama}</Text>
        <Text style={styles.studentNIS}>NIS/NISN: {item.nis || '-'}</Text>
      </View>
      <TouchableOpacity
        onPress={() => removeStudentFromClass(item.id_siswa, item.nama)}
        style={styles.removeBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="exit-outline" size={22} color="#ef4444" />
      </TouchableOpacity>
    </View>
  );

  const renderLobbyStudent = ({ item }) => (
    <TouchableOpacity
      style={styles.lobbyCard}
      onPress={() => addStudentToClass(item.id_siswa, item.nama)}
    >
      <View style={styles.avatarLobby}>
        <Text style={styles.avatarLobbyText}>{item.nama.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.studentName}>{item.nama}</Text>
        <Text style={styles.studentNIS}>NIS/NISN: {item.nis || '-'}</Text>
      </View>
      <View style={styles.addBadge}>
        <Ionicons name="add" size={16} color="#fff" />
        <Text style={styles.addBadgeText}>Tambah</Text>
      </View>
    </TouchableOpacity>
  );

  const filteredLobby = lobbyStudents.filter(s =>
    s.nama.toLowerCase().includes(searchLobby.toLowerCase()) ||
    (s.nis && s.nis.includes(searchLobby))
  );

  return (
    <View style={styles.container}>
      {/* Info Bar */}
      <View style={styles.infoBar}>
        <View style={styles.infoIcon}>
          <Ionicons name="school" size={22} color="#1d4ed8" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.infoTitle}>{nama_kelas}</Text>
          <Text style={styles.infoSubtitle}>{students.length} siswa terdaftar</Text>
        </View>
        <TouchableOpacity
          style={styles.addStudentBtn}
          onPress={() => { setSearchLobby(''); setAddModalVisible(true); }}
        >
          <Ionicons name="person-add-outline" size={18} color="#fff" />
          <Text style={styles.addStudentBtnText}>Tambah</Text>
        </TouchableOpacity>
      </View>

      {/* Daftar Siswa di Kelas */}
      <FlatList
        data={students}
        keyExtractor={item => item.id_siswa.toString()}
        renderItem={renderClassStudent}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>Kelas Masih Kosong</Text>
            <Text style={styles.emptyDesc}>
              Tap "Tambah" di atas untuk memasukkan siswa dari Lobby.
            </Text>
          </View>
        }
      />

      {/* Modal Pilih Siswa dari Lobby */}
      <Modal visible={addModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Tambah Siswa ke {nama_kelas}</Text>
                <Text style={styles.modalSubtitle}>Pilih siswa dari Lobby</Text>
              </View>
              <TouchableOpacity onPress={() => setAddModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={28} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Pencarian Lobby */}
            {lobbyStudents.length > 0 && (
              <View style={styles.searchBar}>
                <Ionicons name="search-outline" size={18} color="#94a3b8" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Cari nama atau NIS/NISN..."
                  placeholderTextColor="#94a3b8"
                  value={searchLobby}
                  onChangeText={setSearchLobby}
                />
                {searchLobby.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchLobby('')}>
                    <Ionicons name="close-circle" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {lobbyStudents.length === 0 ? (
              <View style={styles.emptyLobby}>
                <Ionicons name="checkmark-circle" size={44} color="#10b981" />
                <Text style={styles.emptyLobbyTitle}>Lobby Kosong</Text>
                <Text style={styles.emptyLobbyDesc}>
                  Semua siswa sudah masuk ke suatu kelas, atau belum ada siswa yang ditambahkan.
                  {'\n'}Tambah siswa baru di menu "Siswa".
                </Text>
              </View>
            ) : filteredLobby.length === 0 ? (
              <View style={styles.emptyLobby}>
                <Ionicons name="search-outline" size={44} color="#cbd5e1" />
                <Text style={styles.emptyLobbyTitle}>Tidak Ditemukan</Text>
                <Text style={styles.emptyLobbyDesc}>Siswa dengan kata kunci tersebut tidak ada di Lobby.</Text>
              </View>
            ) : (
              <FlatList
                data={filteredLobby}
                keyExtractor={item => item.id_siswa.toString()}
                renderItem={renderLobbyStudent}
                style={{ maxHeight: 400 }}
                contentContainerStyle={{ paddingBottom: 16 }}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  infoBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', padding: 16,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  infoIcon: {
    width: 46, height: 46, borderRadius: 12,
    backgroundColor: '#dbeafe', justifyContent: 'center', alignItems: 'center',
  },
  infoTitle: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
  infoSubtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  addStudentBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#2563eb', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
  },
  addStudentBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  listContainer: { padding: 16, paddingBottom: 40 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 2,
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#dbeafe', justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarText: { fontSize: 18, fontWeight: 'bold', color: '#1d4ed8' },
  cardInfo: { flex: 1 },
  studentName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  studentNIS: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  removeBtn: { padding: 8 },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#64748b', marginTop: 16 },
  emptyDesc: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 8, lineHeight: 20 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingTop: 16, maxHeight: '85%',
  },
  modalHandle: { width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  modalSubtitle: { fontSize: 13, color: '#64748b', marginTop: 3 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8fafc', marginBottom: 16,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#0f172a' },
  lobbyCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderRadius: 12, backgroundColor: '#f8fafc',
    marginBottom: 10, borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  avatarLobby: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#fef3c7', justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarLobbyText: { fontSize: 16, fontWeight: 'bold', color: '#92400e' },
  addBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#10b981', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
  },
  addBadgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  emptyLobby: { alignItems: 'center', padding: 32 },
  emptyLobbyTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginTop: 12 },
  emptyLobbyDesc: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
