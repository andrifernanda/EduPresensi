import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, TextInput, ScrollView, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDb } from '../../database/db';
import useStore from '../../store/useStore';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import XLSX from 'xlsx';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function GradesScreen() {
  const activePeriod = useStore((state) => state.activePeriod);
  const user = useStore((state) => state.user);
  
  const [activeMainTab, setActiveMainTab] = useState('input');
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  
  const [students, setStudents] = useState([]);
  const [criteria, setCriteria] = useState([]);
  
  // State Input Nilai
  const [selectedCriteriaId, setSelectedCriteriaId] = useState(null);
  const [grades, setGrades] = useState({});
  
  // State Kelola Kriteria
  const [newCriteriaName, setNewCriteriaName] = useState('');
  const [newCriteriaBobot, setNewCriteriaBobot] = useState('');

  // State Edit Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingCriteria, setEditingCriteria] = useState(null);
  const [editName, setEditName] = useState('');
  const [editBobot, setEditBobot] = useState('');

  // State Share Modal
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [sharingCriteria, setSharingCriteria] = useState(null);
  const [otherClasses, setOtherClasses] = useState([]);
  const [selectedShareClasses, setSelectedShareClasses] = useState([]);

  // State Analisa Nilai
  const [analisaData, setAnalisaData] = useState([]);

  const fetchClasses = async () => {
    if (!activePeriod || !user) return;
    const db = await getDb();
    const data = await db.getAllAsync(
      'SELECT * FROM kelas WHERE id_pengguna = ? AND tahun_ajaran = ? ORDER BY nama_kelas ASC',
      [user.id_pengguna, activePeriod.tahun_ajaran]
    );
    setClasses(data);
    if (data.length > 0 && !selectedClass) {
      setSelectedClass(data[0]);
    } else if (data.length === 0) {
      setSelectedClass(null);
    }
  };

  const fetchCriteria = async () => {
    if (!activePeriod || !selectedClass) {
      setCriteria([]);
      setSelectedCriteriaId(null);
      return;
    }
    const db = await getDb();
    const data = await db.getAllAsync(
      'SELECT * FROM kriteria_nilai WHERE id_periode = ? AND id_kelas = ? ORDER BY id_kriteria ASC',
      [activePeriod.id_periode, selectedClass.id_kelas]
    );
    setCriteria(data);
    
    if (data.length > 0 && !selectedCriteriaId) {
      setSelectedCriteriaId(data[0].id_kriteria);
    } else if (data.length === 0) {
      setSelectedCriteriaId(null);
    } else if (data.length > 0 && selectedCriteriaId) {
       const exists = data.find(c => c.id_kriteria === selectedCriteriaId);
       if (!exists) setSelectedCriteriaId(data[0].id_kriteria);
    }
  };

  const fetchStudents = async () => {
    if (!selectedClass) {
      setStudents([]);
      return;
    }
    const db = await getDb();
    const studentData = await db.getAllAsync(`
      SELECT s.* FROM siswa s
      INNER JOIN siswa_kelas sk ON sk.id_siswa = s.id_siswa
      WHERE sk.id_kelas = ?
      ORDER BY s.nama ASC
    `, [selectedClass.id_kelas]);
    setStudents(studentData);
  };

  const fetchGradesForInput = async () => {
    if (!selectedClass || !selectedCriteriaId) {
      setGrades({});
      return;
    }
    const db = await getDb();
    const gradesData = await db.getAllAsync(`
      SELECT * FROM nilai
      WHERE id_kriteria = ?
      AND id_siswa IN (SELECT id_siswa FROM siswa_kelas WHERE id_kelas = ?)
    `, [selectedCriteriaId, selectedClass.id_kelas]);

    const map = {};
    gradesData.forEach(g => { map[g.id_siswa] = g.nilai.toString(); });
    setGrades(map);
  };

  const fetchAnalisaData = async () => {
    if (!selectedClass || criteria.length === 0 || students.length === 0) {
      setAnalisaData([]);
      return;
    }
    
    const db = await getDb();
    const criteriaIds = criteria.map(c => c.id_kriteria).join(',');
    
    const allGrades = await db.getAllAsync(`
      SELECT * FROM nilai
      WHERE id_kriteria IN (${criteriaIds})
      AND id_siswa IN (SELECT id_siswa FROM siswa_kelas WHERE id_kelas = ?)
    `, [selectedClass.id_kelas]);

    const totalBobot = criteria.reduce((sum, c) => sum + (c.bobot || 0), 0);

    const calculatedData = students.map((s, index) => {
      const studentGrades = allGrades.filter(g => g.id_siswa === s.id_siswa);
      
      let finalGrade = 0;
      if (studentGrades.length > 0) {
        if (totalBobot === 0) {
          const sum = studentGrades.reduce((acc, g) => acc + g.nilai, 0);
          finalGrade = sum / criteria.length; 
        } else {
          let weightedSum = 0;
          studentGrades.forEach(g => {
            const crit = criteria.find(c => c.id_kriteria === g.id_kriteria);
            if (crit) weightedSum += (g.nilai * crit.bobot);
          });
          finalGrade = weightedSum / totalBobot;
        }
      }

      const gradesMap = {};
      studentGrades.forEach(g => { gradesMap[g.id_kriteria] = g.nilai; });

      return {
        ...s,
        number: index + 1,
        finalGrade: Math.round(finalGrade),
        gradesMap
      };
    });

    setAnalisaData(calculatedData);
  };

  useFocusEffect(useCallback(() => {
    fetchClasses();
  }, [activePeriod]));

  useEffect(() => {
    fetchStudents();
    fetchCriteria();
  }, [selectedClass, activePeriod]);

  useEffect(() => {
    if (activeMainTab === 'input') {
      fetchGradesForInput();
    } else if (activeMainTab === 'analisa') {
      fetchAnalisaData();
    }
  }, [activeMainTab, selectedClass, selectedCriteriaId, students, criteria]);

  // --- ACTIONS: KELOLA KRITERIA ---
  const handleAddCriteria = async () => {
    if (!newCriteriaName.trim()) {
      Alert.alert('Peringatan', 'Nama kriteria wajib diisi.');
      return;
    }
    const bobotVal = newCriteriaBobot.trim() === '' ? 0 : parseInt(newCriteriaBobot);
    if (isNaN(bobotVal) || bobotVal < 0 || bobotVal > 100) {
      Alert.alert('Peringatan', 'Bobot harus berupa angka 0-100.');
      return;
    }

    try {
      const db = await getDb();
      await db.runAsync(
        'INSERT INTO kriteria_nilai (id_periode, id_kelas, nama_kriteria, bobot) VALUES (?, ?, ?, ?)',
        [activePeriod.id_periode, selectedClass.id_kelas, newCriteriaName.trim(), bobotVal]
      );
      setNewCriteriaName('');
      setNewCriteriaBobot('');
      fetchCriteria();
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteCriteria = (id_kriteria, nama) => {
    Alert.alert('Hapus Kriteria?', `Hapus "${nama}"? Semua nilai pada kriteria ini di kelas ini akan terhapus secara permanen.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus', style: 'destructive',
        onPress: async () => {
          const db = await getDb();
          await db.runAsync('DELETE FROM kriteria_nilai WHERE id_kriteria = ?', [id_kriteria]);
          if (selectedCriteriaId === id_kriteria) setSelectedCriteriaId(null);
          fetchCriteria();
        }
      }
    ]);
  };

  const openEdit = (c) => {
    setEditingCriteria(c);
    setEditName(c.nama_kriteria);
    setEditBobot(c.bobot.toString());
    setEditModalVisible(true);
  };

  const handleEditSave = async () => {
    if (!editName.trim()) {
      Alert.alert('Peringatan', 'Nama kriteria wajib diisi.');
      return;
    }
    const bobotVal = editBobot.trim() === '' ? 0 : parseInt(editBobot);
    if (isNaN(bobotVal) || bobotVal < 0 || bobotVal > 100) {
      Alert.alert('Peringatan', 'Bobot harus berupa angka 0-100.');
      return;
    }

    try {
      const db = await getDb();
      await db.runAsync(
        'UPDATE kriteria_nilai SET nama_kriteria = ?, bobot = ? WHERE id_kriteria = ?',
        [editName.trim(), bobotVal, editingCriteria.id_kriteria]
      );
      setEditModalVisible(false);
      fetchCriteria();
    } catch (error) {
      console.error(error);
    }
  };

  const openShare = async (c) => {
    setSharingCriteria(c);
    const db = await getDb();
    const data = await db.getAllAsync(
      'SELECT * FROM kelas WHERE id_pengguna = ? AND tahun_ajaran = ? AND id_kelas != ? ORDER BY nama_kelas ASC',
      [user.id_pengguna, activePeriod.tahun_ajaran, selectedClass.id_kelas]
    );
    setOtherClasses(data);
    setSelectedShareClasses([]);
    setShareModalVisible(true);
  };

  const toggleShareClass = (id) => {
    if (selectedShareClasses.includes(id)) {
      setSelectedShareClasses(prev => prev.filter(x => x !== id));
    } else {
      setSelectedShareClasses(prev => [...prev, id]);
    }
  };

  const handleShareSave = async () => {
    if (selectedShareClasses.length === 0) return;
    try {
      const db = await getDb();
      for (const id_kelas of selectedShareClasses) {
         await db.runAsync(
           'INSERT INTO kriteria_nilai (id_periode, id_kelas, nama_kriteria, bobot) VALUES (?, ?, ?, ?)',
           [activePeriod.id_periode, id_kelas, sharingCriteria.nama_kriteria, sharingCriteria.bobot]
         );
      }
      setShareModalVisible(false);
      Alert.alert('Sukses', 'Kriteria berhasil diduplikasi ke kelas lain.');
    } catch (e) {
      console.error(e);
      Alert.alert('Gagal', 'Terjadi kesalahan saat membagikan kriteria.');
    }
  };

  // --- ACTIONS: INPUT NILAI ---
  const updateGrade = async (id_siswa, value) => {
    const numValue = parseFloat(value);
    if (value !== '' && (isNaN(numValue) || numValue < 0 || numValue > 100)) return;
    setGrades(prev => ({ ...prev, [id_siswa]: value }));
    if (value === '' || isNaN(numValue)) return;

    try {
      const db = await getDb();
      const existing = await db.getFirstAsync(
        'SELECT id_nilai FROM nilai WHERE id_siswa = ? AND id_kriteria = ?',
        [id_siswa, selectedCriteriaId]
      );
      if (existing) {
        await db.runAsync('UPDATE nilai SET nilai = ? WHERE id_siswa = ? AND id_kriteria = ?', [numValue, id_siswa, selectedCriteriaId]);
      } else {
        await db.runAsync('INSERT INTO nilai (id_siswa, id_kriteria, nilai) VALUES (?, ?, ?)', [id_siswa, selectedCriteriaId, numValue]);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleExportExcel = async () => {
    if (!selectedClass || criteria.length === 0 || analisaData.length === 0) {
      Alert.alert('Gagal', 'Tidak ada data untuk diekspor.'); return;
    }
    try {
      const wb = XLSX.utils.book_new();
      const data = analisaData.map(s => {
        const row = { 'No': s.number, 'NIS': s.nis || '-', 'Nama': s.nama };
        criteria.forEach(c => {
          const val = s.gradesMap[c.id_kriteria];
          row[c.nama_kriteria] = val !== undefined ? val : '-';
        });
        row['Nilai Akhir'] = s.finalGrade;
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, selectedClass.nama_kelas.substring(0, 31));
      
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const filename = `Nilai_${selectedClass.nama_kelas}_${activePeriod.tahun_ajaran.replace('/', '-')}_Smt${activePeriod.semester}.xlsx`;
      const uri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });
      
      Alert.alert(
        'Pilih Tindakan',
        'File Excel berhasil dibuat. Apa yang ingin Anda lakukan?',
        [
          {
            text: 'Bagikan (Share)',
            onPress: async () => {
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'Bagikan File Excel' });
              }
            }
          },
          {
            text: 'Simpan ke HP',
            onPress: async () => {
              const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
              if (permissions.granted) {
                const newUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                await FileSystem.writeAsStringAsync(newUri, wbout, { encoding: FileSystem.EncodingType.Base64 });
                Alert.alert('Berhasil', 'File berhasil disimpan ke HP Anda.');
              }
            }
          },
          { text: 'Batal', style: 'cancel' }
        ]
      );
    } catch (error) {
      console.error(error);
      Alert.alert('Gagal', 'Gagal mengekspor ke Excel.');
    }
  };

  const handleExportPdf = async () => {
    if (!selectedClass || criteria.length === 0 || analisaData.length === 0) {
      Alert.alert('Gagal', 'Tidak ada data untuk diekspor.'); return;
    }
    try {
      const criteriaHeaders = criteria.map(c => `<th>${c.nama_kriteria}</th>`).join('');
      const rows = analisaData.map(s => {
        const cols = criteria.map(c => {
          const val = s.gradesMap[c.id_kriteria];
          return `<td>${val !== undefined ? val : '-'}</td>`;
        }).join('');
        return `<tr><td>${s.number}</td><td>${s.nis || '-'}</td><td>${s.nama}</td>${cols}<td><strong>${s.finalGrade}</strong></td></tr>`;
      }).join('');
      
      const html = `<html><head><style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px;}h1{text-align:center;color:#1d4ed8;}h2{text-align:center;color:#64748b;font-weight:normal;}h3{margin-top:20px;color:#334155;}table{width:100%;border-collapse:collapse;margin-top:8px;margin-bottom:16px;}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;}th{background:#dbeafe;color:#1d4ed8;font-weight:bold;}tr:nth-child(even){background:#f8fafc;}.footer{text-align:center;color:#94a3b8;margin-top:30px;font-size:10px;}</style></head><body><h1>EduPresensi</h1><h2>Rekapitulasi Nilai Kelas ${selectedClass.nama_kelas}</h2><p style="text-align:center;color:#64748b;">Mata Pelajaran: <strong>${user.mata_pelajaran || 'Belum Diatur'}</strong><br/>${activePeriod.tahun_ajaran} Semester ${activePeriod.semester} | Guru: ${user.nama_lengkap || user.username} | ${new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</p><table><thead><tr><th>No</th><th>NIS</th><th>Nama</th>${criteriaHeaders}<th>N.Akhir</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">EduPresensi • Sistem Manajemen Absensi & Nilai</div></body></html>`;
      const { base64 } = await Print.printToFileAsync({ html, base64: true });
      const filename = `Nilai_${selectedClass.nama_kelas}_${activePeriod.tahun_ajaran.replace('/', '-')}_Smt${activePeriod.semester}.pdf`;
      const uri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      
      Alert.alert(
        'Pilih Tindakan',
        'File PDF berhasil dibuat. Apa yang ingin Anda lakukan?',
        [
          {
            text: 'Bagikan (Share)',
            onPress: async () => {
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: 'Bagikan File PDF' });
              }
            }
          },
          {
            text: 'Simpan ke HP',
            onPress: async () => {
              const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
              if (permissions.granted) {
                const newUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, filename, 'application/pdf');
                await FileSystem.writeAsStringAsync(newUri, base64, { encoding: FileSystem.EncodingType.Base64 });
                Alert.alert('Berhasil', 'File berhasil disimpan ke HP Anda.');
              }
            }
          },
          { text: 'Batal', style: 'cancel' }
        ]
      );
    } catch (error) {
      console.error(error);
      Alert.alert('Gagal', 'Gagal membuat file PDF.');
    }
  };

  // --- RENDERERS ---
  const renderKriteria = () => {
    const totalBobot = criteria.reduce((sum, c) => sum + (c.bobot || 0), 0);
    
    let bobotStatus = {};
    if (totalBobot === 0) {
      bobotStatus = { text: 'Menggunakan Rata-Rata Murni', color: '#64748b', bg: '#f1f5f9', bar: '#94a3b8' };
    } else if (totalBobot === 100) {
      bobotStatus = { text: 'Bobot Sempurna 100%', color: '#059669', bg: '#d1fae5', bar: '#10b981' };
    } else if (totalBobot > 100) {
      bobotStatus = { text: `Total Bobot Melebihi 100% (${totalBobot}%)`, color: '#dc2626', bg: '#fee2e2', bar: '#ef4444' };
    } else {
      bobotStatus = { text: `Bobot belum 100% (${totalBobot}%). Sistem otomatis membagi proporsional.`, color: '#d97706', bg: '#fef3c7', bar: '#f59e0b' };
    }

    const barWidth = Math.min(totalBobot, 100) + '%';

    return (
      <ScrollView contentContainerStyle={styles.tabContent}>
        <View style={styles.addCriteriaCard}>
          <Text style={styles.cardTitle}>Tambah Kriteria Penilaian</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <View style={{ flex: 2 }}>
              <Text style={styles.inputLabel}>Nama Kriteria (mis. UTS)</Text>
              <TextInput
                style={styles.inputBox}
                placeholder="Nama kriteria"
                placeholderTextColor="#94a3b8"
                value={newCriteriaName}
                onChangeText={setNewCriteriaName}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Bobot (%)</Text>
              <TextInput
                style={styles.inputBox}
                placeholder="0-100"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={newCriteriaBobot}
                onChangeText={setNewCriteriaBobot}
              />
            </View>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={handleAddCriteria}>
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.addBtnText}>Tambahkan Kriteria</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statusBobotCard}>
          <View style={[styles.statusBobotBox, { backgroundColor: bobotStatus.bg }]}>
            <Ionicons 
              name={totalBobot === 100 ? "checkmark-circle" : (totalBobot > 100 ? "warning" : "information-circle")} 
              size={18} color={bobotStatus.color} 
            />
            <Text style={[styles.statusBobotText, { color: bobotStatus.color }]}>{bobotStatus.text}</Text>
          </View>
          {totalBobot > 0 && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressBar, { width: barWidth, backgroundColor: bobotStatus.bar }]} />
            </View>
          )}
        </View>

        <Text style={styles.sectionHeading}>Daftar Kriteria di {selectedClass?.nama_kelas}</Text>
        {criteria.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="layers-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>Belum ada kriteria penilaian.</Text>
          </View>
        ) : (
          criteria.map(c => (
            <View key={c.id_kriteria} style={styles.criteriaItem}>
              <View style={styles.criteriaIcon}>
                <Ionicons name="document-text-outline" size={20} color="#3b82f6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.criteriaName}>{c.nama_kriteria}</Text>
                <Text style={styles.criteriaBobot}>Bobot: {c.bobot > 0 ? `${c.bobot}%` : '0% (Non-bobot)'}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openShare(c)}>
                  <Ionicons name="share-social-outline" size={18} color="#059669" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(c)}>
                  <Ionicons name="pencil-outline" size={18} color="#2563eb" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteCriteria(c.id_kriteria, c.nama_kriteria)}>
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    );
  };

  const renderInput = () => {
    const gradesValues = Object.values(grades).filter(g => g !== '' && !isNaN(parseFloat(g))).map(parseFloat);
    const average = gradesValues.length > 0
      ? (gradesValues.reduce((a, b) => a + b, 0) / gradesValues.length).toFixed(1)
      : '-';

    return (
      <View style={{ flex: 1 }}>
        <View style={styles.controlsBar}>
          <Text style={styles.controlsLabel}>Pilih Kriteria:</Text>
          {criteria.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {criteria.map(c => (
                <TouchableOpacity
                  key={c.id_kriteria}
                  style={[styles.chip, selectedCriteriaId === c.id_kriteria && styles.chipActive]}
                  onPress={() => setSelectedCriteriaId(c.id_kriteria)}
                >
                  <Text style={[styles.chipText, selectedCriteriaId === c.id_kriteria && styles.chipTextActive]}>
                    {c.nama_kriteria}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.noDataText}>Buat kriteria terlebih dahulu</Text>
          )}
        </View>

        {criteria.length > 0 && selectedCriteriaId && (
          <View style={styles.averageBar}>
            <Text style={styles.averageLabel}>Rata-rata Kelas:</Text>
            <Text style={styles.averageValue}>{average}</Text>
            <Text style={styles.averageSub}>dari {gradesValues.length} nilai terisi</Text>
          </View>
        )}

        <FlatList
          data={students}
          keyExtractor={item => item.id_siswa.toString()}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>Tidak ada siswa di kelas ini.</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.studentCard}>
              <View style={styles.numberBadge}><Text style={styles.numberText}>{index + 1}</Text></View>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.nama.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.studentName}>{item.nama}</Text>
                <Text style={styles.studentNIS}>NIS: {item.nis || '-'}</Text>
              </View>
              <TextInput
                style={[
                  styles.gradeInput,
                  grades[item.id_siswa] && parseFloat(grades[item.id_siswa]) < 60
                    ? styles.gradeInputLow
                    : grades[item.id_siswa] ? styles.gradeInputOk : null
                ]}
                placeholder="0-100"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={grades[item.id_siswa] || ''}
                onChangeText={(val) => updateGrade(item.id_siswa, val)}
              />
            </View>
          )}
        />
      </View>
    );
  };

  const renderAnalisa = () => {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.exportBar}>
          <Text style={styles.exportLabel}>Unduh Laporan:</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={styles.exportBtnPdf} onPress={handleExportPdf}>
              <Ionicons name="document-text" size={16} color="#fff" />
              <Text style={styles.exportBtnText}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.exportBtnExcel} onPress={handleExportExcel}>
              <Ionicons name="grid" size={16} color="#fff" />
              <Text style={styles.exportBtnText}>Excel</Text>
            </TouchableOpacity>
          </View>
        </View>
        <FlatList
          data={analisaData}
        keyExtractor={item => item.id_siswa.toString()}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="analytics-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>Belum ada data untuk dianalisa.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.studentCard}>
            <View style={styles.numberBadge}><Text style={styles.numberText}>{item.number}</Text></View>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.studentName}>{item.nama}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                {criteria.map(c => {
                  const val = item.gradesMap[c.id_kriteria];
                  return (
                    <View key={c.id_kriteria} style={styles.miniGradeChip}>
                      <Text style={styles.miniGradeName}>{c.nama_kriteria}:</Text>
                      <Text style={styles.miniGradeValue}>{val !== undefined ? val : '-'}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
            <View style={[styles.finalGradeBox, item.finalGrade < 60 ? {backgroundColor: '#fef2f2', borderColor: '#fecaca'} : {}]}>
              <Text style={styles.finalGradeLabel}>N.Akhir</Text>
              <Text style={[styles.finalGradeValue, item.finalGrade < 60 ? {color: '#ef4444'} : {}]}>
                {item.finalGrade}
              </Text>
            </View>
          </View>
        )}
      />
      </View>
    );
  };

  if (!activePeriod) {
    return (
      <View style={styles.center}>
        <Ionicons name="bar-chart-outline" size={56} color="#cbd5e1" />
        <Text style={styles.centerText}>Periode aktif belum diatur.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Tabs */}
      <View style={styles.topTabs}>
        <TouchableOpacity
          style={[styles.topTabBtn, activeMainTab === 'input' && styles.topTabBtnActive]}
          onPress={() => setActiveMainTab('input')}
        >
          <Ionicons name="create-outline" size={15} color={activeMainTab === 'input' ? '#fff' : '#64748b'} />
          <Text style={[styles.topTabText, activeMainTab === 'input' && styles.topTabTextActive]}>Input Nilai</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.topTabBtn, activeMainTab === 'analisa' && styles.topTabBtnActive]}
          onPress={() => setActiveMainTab('analisa')}
        >
          <Ionicons name="analytics-outline" size={15} color={activeMainTab === 'analisa' ? '#fff' : '#64748b'} />
          <Text style={[styles.topTabText, activeMainTab === 'analisa' && styles.topTabTextActive]}>Analisa Nilai</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.topTabBtn, activeMainTab === 'kriteria' && styles.topTabBtnActive]}
          onPress={() => setActiveMainTab('kriteria')}
        >
          <Ionicons name="settings-outline" size={15} color={activeMainTab === 'kriteria' ? '#fff' : '#64748b'} />
          <Text style={[styles.topTabText, activeMainTab === 'kriteria' && styles.topTabTextActive]}>Kriteria</Text>
        </TouchableOpacity>
      </View>

      {/* Class Selector Bar */}
      <View style={styles.classSelector}>
        <Text style={styles.selectorLabel}>Kelas:</Text>
        {classes.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {classes.map(c => (
              <TouchableOpacity
                key={c.id_kelas}
                style={[styles.classChip, selectedClass?.id_kelas === c.id_kelas && styles.classChipActive]}
                onPress={() => setSelectedClass(c)}
              >
                <Text style={[styles.classChipText, selectedClass?.id_kelas === c.id_kelas && styles.classChipTextActive]}>
                  {c.nama_kelas}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.noDataText}>Belum ada kelas</Text>
        )}
      </View>

      {/* Tab Contents */}
      {!selectedClass ? (
        <View style={styles.emptyState}>
          <Ionicons name="school-outline" size={48} color="#cbd5e1" />
          <Text style={styles.emptyText}>Silakan buat dan pilih kelas terlebih dahulu.</Text>
        </View>
      ) : (
        <>
          {activeMainTab === 'kriteria' && renderKriteria()}
          {activeMainTab === 'input' && renderInput()}
          {activeMainTab === 'analisa' && renderAnalisa()}
        </>
      )}

      {/* Edit Modal */}
      <Modal visible={editModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Edit Kriteria</Text>
            
            <Text style={styles.inputLabel}>Nama Kriteria</Text>
            <TextInput style={styles.modalInput} value={editName} onChangeText={setEditName} placeholder="Misal: UTS" />
            
            <Text style={styles.inputLabel}>Bobot (%)</Text>
            <TextInput style={styles.modalInput} value={editBobot} onChangeText={setEditBobot} keyboardType="numeric" placeholder="0-100" />
            
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleEditSave}>
                <Text style={styles.saveBtnText}>Simpan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Share Modal */}
      <Modal visible={shareModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Duplikasi Kriteria</Text>
            <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              Pilih kelas lain yang juga akan menggunakan kriteria "{sharingCriteria?.nama_kriteria}" ({sharingCriteria?.bobot}%).
            </Text>

            {otherClasses.length === 0 ? (
              <View style={{ alignItems: 'center', padding: 20 }}>
                <Ionicons name="sad-outline" size={40} color="#cbd5e1" />
                <Text style={{ color: '#94a3b8', marginTop: 10 }}>Tidak ada kelas lain di tahun ajaran ini.</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 200, marginBottom: 16 }}>
                {otherClasses.map(c => (
                  <TouchableOpacity 
                    key={c.id_kelas} 
                    style={styles.shareClassItem} 
                    onPress={() => toggleShareClass(c.id_kelas)}
                  >
                    <Ionicons 
                      name={selectedShareClasses.includes(c.id_kelas) ? "checkbox" : "square-outline"} 
                      size={22} 
                      color={selectedShareClasses.includes(c.id_kelas) ? "#2563eb" : "#cbd5e1"} 
                    />
                    <Text style={styles.shareClassName}>{c.nama_kelas}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShareModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveBtn, selectedShareClasses.length === 0 && { backgroundColor: '#94a3b8' }]} 
                onPress={handleShareSave}
                disabled={selectedShareClasses.length === 0}
              >
                <Text style={styles.saveBtnText}>Bagikan</Text>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerText: { fontSize: 16, color: '#64748b', marginTop: 12 },
  
  topTabs: {
    flexDirection: 'row', padding: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0', gap: 8,
  },
  topTabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 9, borderRadius: 10,
    backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  topTabBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  topTabText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  topTabTextActive: { color: '#fff' },

  classSelector: {
    flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  selectorLabel: { fontSize: 13, fontWeight: '700', color: '#334155', marginRight: 10 },
  classChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f1f5f9', marginRight: 8, borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  classChipActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  classChipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  classChipTextActive: { color: '#fff' },
  noDataText: { fontSize: 13, color: '#ef4444', fontStyle: 'italic' },

  // Kriteria Tab
  tabContent: { padding: 16, paddingBottom: 40 },
  addCriteriaCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#0f172a' },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 6 },
  inputBox: {
    backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#0f172a',
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#10b981', paddingVertical: 12, borderRadius: 10, marginTop: 14,
  },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  
  statusBobotCard: { marginBottom: 20 },
  statusBobotBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10 },
  statusBobotText: { fontSize: 12, fontWeight: '600', flex: 1 },
  progressTrack: { height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: 3 },

  sectionHeading: { fontSize: 14, fontWeight: 'bold', color: '#334155', marginBottom: 12 },
  criteriaItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14,
    borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0',
  },
  criteriaIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#eff6ff',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  criteriaName: { fontSize: 15, fontWeight: 'bold', color: '#0f172a' },
  criteriaBobot: { fontSize: 12, color: '#64748b', marginTop: 2 },
  actionBtn: { padding: 8, backgroundColor: '#f1f5f9', borderRadius: 8 },
  deleteBtn: { padding: 8, backgroundColor: '#fef2f2', borderRadius: 8 },

  // Input & Analisa Tabs
  controlsBar: { padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  controlsLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#f1f5f9', marginRight: 8, borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  chipActive: { backgroundColor: '#059669', borderColor: '#059669' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  chipTextActive: { color: '#fff' },

  averageBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#f0fdf4', borderBottomWidth: 1, borderBottomColor: '#bbf7d0',
  },
  averageLabel: { fontSize: 13, color: '#166534', fontWeight: '600' },
  averageValue: { fontSize: 20, fontWeight: 'bold', color: '#059669' },
  averageSub: { fontSize: 12, color: '#4ade80' },

  listContainer: { padding: 16, paddingBottom: 40 },
  studentCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12,
    padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, elevation: 2,
  },
  numberBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  numberText: { fontSize: 11, fontWeight: 'bold', color: '#64748b' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#dbeafe', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 16, fontWeight: 'bold', color: '#1d4ed8' },
  studentName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  studentNIS: { fontSize: 11, color: '#94a3b8' },
  
  gradeInput: {
    width: 65, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, padding: 8,
    textAlign: 'center', fontSize: 15, fontWeight: 'bold', color: '#0f172a', backgroundColor: '#f8fafc',
  },
  gradeInputLow: { borderColor: '#ef4444', backgroundColor: '#fef2f2', color: '#ef4444' },
  gradeInputOk: { borderColor: '#10b981', backgroundColor: '#f0fdf4', color: '#059669' },

  miniGradeChip: { backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 6, flexDirection: 'row', gap: 4 },
  miniGradeName: { fontSize: 10, color: '#64748b' },
  miniGradeValue: { fontSize: 10, fontWeight: 'bold', color: '#0f172a' },

  finalGradeBox: {
    backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0',
    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center',
  },
  finalGradeLabel: { fontSize: 10, color: '#64748b', fontWeight: 'bold', marginBottom: 2 },
  finalGradeValue: { fontSize: 18, fontWeight: 'bold', color: '#059669' },

  exportBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  exportLabel: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  exportBtnPdf: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ef4444', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  exportBtnExcel: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10b981', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  exportBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: '#94a3b8', marginTop: 12, textAlign: 'center' },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 16 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginBottom: 20 },
  modalInput: {
    backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 12, padding: 12, fontSize: 15, color: '#0f172a', marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center' },
  cancelBtnText: { fontWeight: 'bold', color: '#64748b' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center' },
  saveBtnText: { fontWeight: 'bold', color: '#fff' },

  shareClassItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  shareClassName: { fontSize: 15, color: '#334155' },
});
