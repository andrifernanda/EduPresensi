import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, TextInput, Modal, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDb } from '../../database/db';
import useStore from '../../store/useStore';
import { useFocusEffect } from '@react-navigation/native';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import { File as ExpoFile } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export default function StudentListScreen() {
  const activePeriod = useStore((state) => state.activePeriod);
  const user = useStore((state) => state.user);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [nama, setNama] = useState('');
  const [nis, setNis] = useState('');
  const [activeTab, setActiveTab] = useState('Lobby'); // 'Total', 'Lobby', 'Di Kelas'
  
  // Pagination
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  const fetchStudents = async () => {
    if (!user) return;
    try {
      const db = await getDb();
      let data;
      if (activePeriod) {
        data = await db.getAllAsync(`
          SELECT s.*, k.nama_kelas
          FROM siswa s
          LEFT JOIN siswa_kelas sk ON sk.id_siswa = s.id_siswa
          LEFT JOIN kelas k ON k.id_kelas = sk.id_kelas AND k.tahun_ajaran = ?
          WHERE s.id_pengguna = ?
          ORDER BY s.nama ASC
        `, [activePeriod.tahun_ajaran, user.id_pengguna]);
      } else {
        data = await db.getAllAsync(
          'SELECT * FROM siswa WHERE id_pengguna = ? ORDER BY nama ASC',
          [user.id_pengguna]
        );
      }
      setStudents(data);
    } catch (error) {
      console.error(error);
    }
  };

  useFocusEffect(useCallback(() => {
    fetchStudents();
  }, [activePeriod, user]));

  // Reset page ketika pencarian atau tab berubah
  useEffect(() => {
    setPage(1);
  }, [search, students, activeTab]);

  const handleSave = async () => {
    if (!nama.trim()) { Alert.alert('Peringatan', 'Nama siswa wajib diisi.'); return; }
    
    try {
      const db = await getDb();
      const inputNis = nis.trim() === '' ? null : nis.trim();

      // Validasi NIS Unik (jika diisi)
      if (inputNis) {
        const existing = await db.getFirstAsync(
          'SELECT id_siswa FROM siswa WHERE id_pengguna = ? AND nis = ? AND id_siswa != ?',
          [user.id_pengguna, inputNis, editingId || -1]
        );
        if (existing) {
          Alert.alert('Gagal', 'NIS / NISN ini sudah terdaftar pada siswa lain.');
          return;
        }
      }

      if (editingId) {
        await db.runAsync('UPDATE siswa SET nis = ?, nama = ? WHERE id_siswa = ?', [inputNis, nama.trim(), editingId]);
      } else {
        await db.runAsync('INSERT INTO siswa (id_pengguna, nis, nama) VALUES (?, ?, ?)', [user.id_pengguna, inputNis, nama.trim()]);
      }
      setModalVisible(false);
      resetForm();
      fetchStudents();
    } catch (error) {
      console.error(error);
      Alert.alert('Gagal', 'Terjadi kesalahan saat menyimpan.');
    }
  };

  const handleDelete = (id_siswa, namaSiswa) => {
    Alert.alert(
      'Hapus Siswa?',
      `Hapus "${namaSiswa}"? Seluruh data nilai dan absensinya juga akan terhapus secara permanen.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus', style: 'destructive',
          onPress: async () => {
            const db = await getDb();
            await db.runAsync('DELETE FROM siswa WHERE id_siswa = ?', [id_siswa]);
            fetchStudents();
          }
        }
      ]
    );
  };

  const openAdd = () => { resetForm(); setModalVisible(true); };
  const openEdit = (s) => { setEditingId(s.id_siswa); setNama(s.nama); setNis(s.nis || ''); setModalVisible(true); };
  const showMenuInfo = () => {
    Alert.alert(
      'Informasi Menu Excel',
      '• Impor Excel: Untuk memasukkan data siswa baru ke sistem menggunakan format template.\n\n' +
      '• Template: Mengunduh file Excel kosong dengan format yang tepat untuk diisi (input data).\n\n' +
      '• Backup Siswa: Mengekspor daftar nama siswa yang ada di sistem (backup) ke file Excel.'
    );
  };

  const handleExportExcel = () => {
    Alert.alert('Backup Siswa', 'Pilih tujuan penyimpanan:', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Bagikan (WA/Drive)', onPress: () => exportExcelData('share') },
      { text: 'Simpan ke Perangkat', onPress: () => exportExcelData('local') },
    ]);
  };

  const exportExcelData = async (type) => {
    try {
      if (students.length === 0) {
        Alert.alert('Kosong', 'Belum ada data siswa untuk diekspor.');
        return;
      }
      
      const wsData = students.map((s) => ({
        'NISN': s.nis || '',
        'Nama Siswa': s.nama,
      }));
      
      const ws = XLSX.utils.json_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Siswa");
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      
      const fileName = `Data_Siswa_${Date.now()}.xlsx`;
      const uri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });
      
      if (type === 'share') {
        if (!(await Sharing.isAvailableAsync())) {
          Alert.alert('Gagal', 'Fitur berbagi tidak tersedia di perangkat ini.');
          return;
        }
        await Sharing.shareAsync(uri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'Bagikan Data Siswa' });
      } else {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const newUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          await FileSystem.writeAsStringAsync(newUri, wbout, { encoding: FileSystem.EncodingType.Base64 });
          Alert.alert('Sukses', 'File berhasil disimpan di folder pilihan Anda.');
        } else {
          Alert.alert('Batal', 'Izin penyimpanan ditolak.');
        }
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Gagal', 'Terjadi kesalahan saat mengekspor data.');
    }
  };

  const handleDownloadTemplate = () => {
    Alert.alert('Unduh Template', 'Pilih tujuan penyimpanan:', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Bagikan (WA/Drive)', onPress: () => exportTemplate('share') },
      { text: 'Simpan ke Perangkat', onPress: () => exportTemplate('local') },
    ]);
  };

  const exportTemplate = async (type) => {
    try {
      const wsData = [
        { 'NISN': '1234567890', 'Nama Siswa': 'Andi' },
        { 'NISN': '0987654321', 'Nama Siswa': 'Budi' },
      ];
      
      const ws = XLSX.utils.json_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Template");
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      
      const fileName = `Template_Data_Siswa.xlsx`;
      const uri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });
      
      if (type === 'share') {
        if (!(await Sharing.isAvailableAsync())) {
          Alert.alert('Gagal', 'Fitur berbagi tidak tersedia di perangkat ini.');
          return;
        }
        await Sharing.shareAsync(uri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'Bagikan Template' });
      } else {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const newUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          await FileSystem.writeAsStringAsync(newUri, wbout, { encoding: FileSystem.EncodingType.Base64 });
          Alert.alert('Sukses', 'File template berhasil disimpan di folder pilihan Anda.');
        } else {
          Alert.alert('Batal', 'Izin penyimpanan ditolak.');
        }
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Gagal', 'Terjadi kesalahan saat mengunduh template.');
    }
  };

  const handleImportExcel = async () => {
    try {
      const pickResult = await ExpoFile.pickFileAsync({
        mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '*/*']
      });
      if (pickResult.canceled) return;
      
      const pickedFile = pickResult.result;
      const base64Content = await pickedFile.base64();
      
      const wb = XLSX.read(base64Content, { type: 'base64' });
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
      
      if (data.length === 0) {
        Alert.alert('Kosong', 'File Excel yang dipilih kosong atau tidak beraturan.');
        return;
      }
      
      const db = await getDb();
      let imported = 0;
      let duplicates = 0;
      
      for (const row of data) {
        const keys = Object.keys(row);
        const namaKey = keys.find(k => k.toLowerCase().includes('nama'));
        const nisKey = keys.find(k => k.toLowerCase().includes('nis'));
        
        const namaRow = namaKey ? row[namaKey]?.toString().trim() : null;
        let nisRow = nisKey ? row[nisKey]?.toString().trim() : null;
        
        if (!namaRow) continue; 
        if (nisRow === '') nisRow = null;
        
        if (nisRow) {
          const existing = await db.getFirstAsync(
            'SELECT id_siswa FROM siswa WHERE id_pengguna = ? AND nis = ?',
            [user.id_pengguna, nisRow]
          );
          if (existing) {
            duplicates++;
            continue;
          }
        }
        
        await db.runAsync('INSERT INTO siswa (id_pengguna, nis, nama) VALUES (?, ?, ?)', [user.id_pengguna, nisRow, namaRow]);
        imported++;
      }
      
      fetchStudents();
      Alert.alert('Selesai', `Berhasil mengimpor ${imported} siswa.${duplicates > 0 ? `\nDiabaikan: ${duplicates} siswa (NIS ganda).` : ''}`);
      
    } catch (error) {
      console.error(error);
      Alert.alert('Gagal', 'Pastikan file yang dipilih adalah file Excel yang valid (.xlsx).');
    }
  };

  const resetForm = () => { setEditingId(null); setNama(''); setNis(''); };

  // 1. Filter by search
  const searched = students.filter(s =>
    s.nama.toLowerCase().includes(search.toLowerCase()) ||
    (s.nis && s.nis.includes(search))
  );

  // 2. Filter by tab
  let tabFiltered = [];
  if (activeTab === 'Total') {
    tabFiltered = searched;
  } else if (activeTab === 'Lobby') {
    tabFiltered = searched.filter(s => !s.nama_kelas);
  } else if (activeTab === 'Di Kelas') {
    tabFiltered = searched.filter(s => s.nama_kelas);
  }

  // 3. Numbering & Flattening
  const flatData = tabFiltered.map((s, index) => ({ ...s, number: index + 1 }));

  // 4. Pagination
  const paginatedData = flatData.slice(0, page * ITEMS_PER_PAGE);

  const loadMore = () => {
    if (page * ITEMS_PER_PAGE < flatData.length) {
      setPage(page + 1);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.numberBadge}>
        <Text style={styles.numberText}>{item.number}</Text>
      </View>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.nama.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.studentName}>{item.nama}</Text>
        <Text style={styles.studentNIS}>NIS/NISN: {item.nis || '-'}</Text>
        {item.nama_kelas ? (
          <View style={styles.classBadge}>
            <Ionicons name="school-outline" size={10} color="#1d4ed8" />
            <Text style={styles.classBadgeText}>{item.nama_kelas}</Text>
          </View>
        ) : (
          <View style={styles.lobbyBadge}>
            <Ionicons name="time-outline" size={10} color="#92400e" />
            <Text style={styles.lobbyBadgeText}>Lobby</Text>
          </View>
        )}
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => openEdit(item)} style={styles.iconBtn}>
          <Ionicons name="create-outline" size={20} color="#2563eb" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id_siswa, item.nama)} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={20} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color="#94a3b8" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari nama atau NIS/NISN..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Kelola Data Excel</Text>
        <TouchableOpacity onPress={showMenuInfo} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="information-circle-outline" size={16} color="#3b82f6" />
          <Text style={{ fontSize: 12, color: '#3b82f6', marginLeft: 4 }}>Info Menu</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleImportExcel}>
          <Ionicons name="download-outline" size={16} color="#2563eb" />
          <Text style={styles.actionBtnText}>Impor Excel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleDownloadTemplate}>
          <Ionicons name="document-text-outline" size={16} color="#d97706" />
          <Text style={[styles.actionBtnText, { color: '#d97706' }]}>Template</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleExportExcel}>
          <Ionicons name="share-outline" size={16} color="#16a34a" />
          <Text style={[styles.actionBtnText, { color: '#16a34a', fontSize: 12 }]}>Backup Siswa</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsContainer}>
        <TouchableOpacity 
          style={[styles.statBox, activeTab === 'Total' && styles.statBoxActiveTotal]}
          onPress={() => setActiveTab('Total')}
          activeOpacity={0.7}
        >
          <Text style={[styles.statNum, activeTab === 'Total' && { color: '#fff' }]}>
            {students.length}
          </Text>
          <Text style={[styles.statLabel, activeTab === 'Total' && { color: '#e0e7ff' }]}>
            Total
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[
            styles.statBox, 
            styles.statBoxMiddle, 
            activeTab === 'Lobby' && styles.statBoxActiveLobby
          ]}
          onPress={() => setActiveTab('Lobby')}
          activeOpacity={0.7}
        >
          <Text style={[styles.statNum, activeTab === 'Lobby' ? { color: '#fff' } : { color: '#d97706' }]}>
            {students.filter(s => !s.nama_kelas).length}
          </Text>
          <Text style={[styles.statLabel, activeTab === 'Lobby' && { color: '#fef3c7' }]}>
            Lobby
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.statBox, activeTab === 'Di Kelas' && styles.statBoxActiveClass]}
          onPress={() => setActiveTab('Di Kelas')}
          activeOpacity={0.7}
        >
          <Text style={[styles.statNum, activeTab === 'Di Kelas' ? { color: '#fff' } : { color: '#059669' }]}>
            {students.filter(s => s.nama_kelas).length}
          </Text>
          <Text style={[styles.statLabel, activeTab === 'Di Kelas' && { color: '#d1fae5' }]}>
            Di Kelas
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={paginatedData}
        keyExtractor={item => item.id_siswa.toString()}
        renderItem={renderItem}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>Belum Ada Siswa</Text>
            <Text style={styles.emptyDesc}>
              {activeTab === 'Total' 
                ? 'Tap tombol + untuk menambahkan siswa pertama Anda.' 
                : `Tidak ada siswa di kategori ${activeTab}.`}
            </Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={openAdd}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editingId ? 'Edit Data Siswa' : 'Tambah Siswa Baru'}</Text>
            <Text style={styles.inputLabel}>Nama Lengkap <Text style={{ color: '#ef4444' }}>*</Text></Text>
            <TextInput style={styles.modalInput} placeholder="Nama lengkap siswa" placeholderTextColor="#94a3b8" value={nama} onChangeText={setNama} />
            <Text style={styles.inputLabel}>NIS / NISN <Text style={{ color: '#94a3b8', fontWeight: '400' }}>(opsional)</Text></Text>
            <TextInput style={styles.modalInput} placeholder="Boleh dikosongkan, tapi tidak boleh sama" placeholderTextColor="#94a3b8" value={nis} onChangeText={setNis} keyboardType="numeric" />
            <Text style={styles.infoNote}>Kelas diatur melalui menu Kelas</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Simpan</Text>
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
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 16, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#e2e8f0' },
  searchInput: { flex: 1, fontSize: 15, color: '#0f172a' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12, gap: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff', paddingVertical: 10, borderRadius: 12, gap: 6 },
  actionBtnText: { fontSize: 14, fontWeight: '600', color: '#2563eb' },
  statsContainer: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statBoxMiddle: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#e2e8f0' },
  statBoxActiveTotal: { backgroundColor: '#2563eb' },
  statBoxActiveLobby: { backgroundColor: '#d97706', borderLeftColor: '#d97706', borderRightColor: '#d97706' },
  statBoxActiveClass: { backgroundColor: '#059669' },
  statNum: { fontSize: 22, fontWeight: 'bold', color: '#0f172a' },
  statLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },
  listContainer: { padding: 16, paddingTop: 4, paddingBottom: 100 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 2,
  },
  numberBadge: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#f1f5f9',
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  numberText: { fontSize: 11, fontWeight: 'bold', color: '#64748b' },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#dbeafe', justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarText: { fontSize: 18, fontWeight: 'bold', color: '#1d4ed8' },
  cardInfo: { flex: 1 },
  studentName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  studentNIS: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  classBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5,
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: '#dbeafe', borderRadius: 20, alignSelf: 'flex-start',
  },
  classBadgeText: { fontSize: 10, color: '#1d4ed8', fontWeight: '700' },
  lobbyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5,
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: '#fef3c7', borderRadius: 20, alignSelf: 'flex-start',
  },
  lobbyBadgeText: { fontSize: 10, color: '#92400e', fontWeight: '700' },
  cardActions: { flexDirection: 'row', gap: 6 },
  iconBtn: { padding: 6 },
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
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a', marginBottom: 20 },
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8 },
  modalInput: {
    backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 12, padding: 13, fontSize: 15, color: '#0f172a', marginBottom: 16,
  },
  infoNote: { fontSize: 12, color: '#64748b', marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center' },
  cancelBtnText: { fontWeight: 'bold', color: '#64748b' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center' },
  saveBtnText: { fontWeight: 'bold', color: '#fff' },
});
