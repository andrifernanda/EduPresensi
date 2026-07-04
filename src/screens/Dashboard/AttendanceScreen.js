import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, Modal, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDb } from '../../database/db';
import useStore from '../../store/useStore';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import XLSX from 'xlsx';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const STATUS_CONFIG = {
  H: { label: 'Hadir', color: '#10b981', bg: '#d1fae5', dark: '#059669' },
  S: { label: 'Sakit', color: '#f59e0b', bg: '#fef3c7', dark: '#d97706' },
  I: { label: 'Izin', color: '#3b82f6', bg: '#dbeafe', dark: '#2563eb' },
  A: { label: 'Alfa', color: '#ef4444', bg: '#fee2e2', dark: '#dc2626' },
};

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];
const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export default function AttendanceScreen() {
  const activePeriod = useStore((state) => state.activePeriod);
  const user = useStore((state) => state.user);
  
  const [activeMainTab, setActiveMainTab] = useState('harian'); // 'harian' atau 'analisis'

  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  
  // State Harian
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // State Analisis
  const [analyticsData, setAnalyticsData] = useState([]); // [{ id_siswa, nama, nis, semesterStats: {}, yearStats: {} }]

  // Calendar State
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

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

  const fetchStudentsAndAttendance = async () => {
    if (!selectedClass || !date || !activePeriod) {
      setStudents([]);
      setAttendance({});
      return;
    }
    const db = await getDb();

    const studentData = await db.getAllAsync(`
      SELECT s.* FROM siswa s
      INNER JOIN siswa_kelas sk ON sk.id_siswa = s.id_siswa
      WHERE sk.id_kelas = ?
      ORDER BY s.nama ASC
    `, [selectedClass.id_kelas]);
    
    const studentsWithNumber = studentData.map((s, index) => ({ ...s, number: index + 1 }));
    setStudents(studentsWithNumber);

    const attData = await db.getAllAsync(`
      SELECT * FROM absensi
      WHERE tanggal = ? AND id_periode = ?
      AND id_siswa IN (SELECT id_siswa FROM siswa_kelas WHERE id_kelas = ?)
    `, [date, activePeriod.id_periode, selectedClass.id_kelas]);

    const map = {};
    attData.forEach(a => { map[a.id_siswa] = a.status; });
    setAttendance(map);
  };

  const fetchAnalytics = async () => {
    if (!selectedClass || !activePeriod) {
      setAnalyticsData([]);
      return;
    }
    const db = await getDb();

    // 1. Get all students in the class
    const studentData = await db.getAllAsync(`
      SELECT s.* FROM siswa s
      INNER JOIN siswa_kelas sk ON sk.id_siswa = s.id_siswa
      WHERE sk.id_kelas = ?
      ORDER BY s.nama ASC
    `, [selectedClass.id_kelas]);

    if (studentData.length === 0) {
      setAnalyticsData([]);
      return;
    }

    // 2. Get period IDs for the current year
    const periodsInYear = await db.getAllAsync(
      'SELECT id_periode FROM periode_ajaran WHERE id_pengguna = ? AND tahun_ajaran = ?',
      [user.id_pengguna, activePeriod.tahun_ajaran]
    );
    const periodIds = periodsInYear.map(p => p.id_periode);

    if (periodIds.length === 0) return;

    // 3. Get all attendance records for these periods and this class
    const attData = await db.getAllAsync(`
      SELECT * FROM absensi
      WHERE id_periode IN (${periodIds.join(',')})
      AND id_siswa IN (SELECT id_siswa FROM siswa_kelas WHERE id_kelas = ?)
    `, [selectedClass.id_kelas]);

    // 4. Group by student
    const statsMap = {};
    studentData.forEach(s => {
      statsMap[s.id_siswa] = {
        semester: { H: 0, S: 0, I: 0, A: 0, total: 0 },
        year: { H: 0, S: 0, I: 0, A: 0, total: 0 }
      };
    });

    attData.forEach(a => {
      if (statsMap[a.id_siswa]) {
        // Year stats
        statsMap[a.id_siswa].year[a.status] += 1;
        statsMap[a.id_siswa].year.total += 1;
        
        // Semester stats (only if it matches current active period)
        if (a.id_periode === activePeriod.id_periode) {
          statsMap[a.id_siswa].semester[a.status] += 1;
          statsMap[a.id_siswa].semester.total += 1;
        }
      }
    });

    const finalData = studentData.map((s, index) => {
      const p = statsMap[s.id_siswa];
      const semPercent = p.semester.total > 0 ? Math.round((p.semester.H / p.semester.total) * 100) : 0;
      const yearPercent = p.year.total > 0 ? Math.round((p.year.H / p.year.total) * 100) : 0;
      
      return {
        ...s,
        number: index + 1,
        stats: p,
        semPercent,
        yearPercent
      };
    });

    setAnalyticsData(finalData);
  };

  useFocusEffect(useCallback(() => {
    fetchClasses();
  }, [activePeriod, user]));

  useEffect(() => {
    if (activeMainTab === 'harian') {
      fetchStudentsAndAttendance();
    } else {
      fetchAnalytics();
    }
  }, [selectedClass, date, activePeriod, activeMainTab]);

  const updateAttendance = async (id_siswa, status) => {
    try {
      const db = await getDb();
      
      // Jika status yang diklik sama dengan status saat ini, maka BATALKAN (Hapus absensi)
      if (attendance[id_siswa] === status) {
        await db.runAsync(
          'DELETE FROM absensi WHERE id_siswa = ? AND tanggal = ? AND id_periode = ?',
          [id_siswa, date, activePeriod.id_periode]
        );
        const newAttendance = { ...attendance };
        delete newAttendance[id_siswa];
        setAttendance(newAttendance);
        return;
      }

      if (attendance[id_siswa]) {
        await db.runAsync(
          'UPDATE absensi SET status = ? WHERE id_siswa = ? AND tanggal = ? AND id_periode = ?',
          [status, id_siswa, date, activePeriod.id_periode]
        );
      } else {
        await db.runAsync(
          'INSERT INTO absensi (id_siswa, id_periode, tanggal, status) VALUES (?, ?, ?, ?)',
          [id_siswa, activePeriod.id_periode, date, status]
        );
      }
      setAttendance(prev => ({ ...prev, [id_siswa]: status }));
    } catch (error) {
      console.error(error);
      Alert.alert('Gagal', 'Gagal menyimpan absensi.');
    }
  };

  const handleExportExcel = async () => {
    if (!selectedClass || analyticsData.length === 0) {
      Alert.alert('Gagal', 'Tidak ada data untuk diekspor.'); return;
    }
    try {
      const wb = XLSX.utils.book_new();
      const data = analyticsData.map(s => {
        return {
          'No': s.number,
          'NIS': s.nis || '-',
          'Nama': s.nama,
          'Smt H': s.stats.semester.H,
          'Smt S': s.stats.semester.S,
          'Smt I': s.stats.semester.I,
          'Smt A': s.stats.semester.A,
          'Smt %': s.semPercent,
          'Thn H': s.stats.year.H,
          'Thn S': s.stats.year.S,
          'Thn I': s.stats.year.I,
          'Thn A': s.stats.year.A,
          'Thn %': s.yearPercent,
        };
      });
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'Analisis_Absensi');
      
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const filename = `Absensi_${selectedClass.nama_kelas}_${activePeriod.tahun_ajaran.replace('/', '-')}.xlsx`;
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
    if (!selectedClass || analyticsData.length === 0) {
      Alert.alert('Gagal', 'Tidak ada data untuk diekspor.'); return;
    }
    try {
      const rows = analyticsData.map(s => {
        return `<tr>
          <td>${s.number}</td><td>${s.nis || '-'}</td><td>${s.nama}</td>
          <td>${s.stats.semester.H}</td><td>${s.stats.semester.S}</td><td>${s.stats.semester.I}</td><td>${s.stats.semester.A}</td>
          <td><strong>${s.semPercent}%</strong></td>
          <td>${s.stats.year.H}</td><td>${s.stats.year.S}</td><td>${s.stats.year.I}</td><td>${s.stats.year.A}</td>
          <td><strong>${s.yearPercent}%</strong></td>
        </tr>`;
      }).join('');
      
      const html = `<html><head><style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px;}h1{text-align:center;color:#1d4ed8;}h2{text-align:center;color:#64748b;font-weight:normal;}h3{margin-top:20px;color:#334155;}table{width:100%;border-collapse:collapse;margin-top:8px;margin-bottom:16px;}th,td{border:1px solid #cbd5e1;padding:6px 4px;text-align:center;}th{background:#dbeafe;color:#1d4ed8;font-weight:bold;}td:nth-child(2),td:nth-child(3){text-align:left;}tr:nth-child(even){background:#f8fafc;}.footer{text-align:center;color:#94a3b8;margin-top:30px;font-size:10px;}</style></head><body><h1>EduPresensi</h1><h2>Analisis Absensi Kelas ${selectedClass.nama_kelas}</h2><p style="text-align:center;color:#64748b;">Mata Pelajaran: <strong>${user.mata_pelajaran || 'Belum Diatur'}</strong><br/>${activePeriod.tahun_ajaran} Semester ${activePeriod.semester} | Guru: ${user.nama_lengkap || user.username} | ${new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</p><table><thead><tr><th rowspan="2">No</th><th rowspan="2">NIS</th><th rowspan="2">Nama</th><th colspan="5">Semester Ini</th><th colspan="5">Tahun Ajaran</th></tr><tr><th>H</th><th>S</th><th>I</th><th>A</th><th>%</th><th>H</th><th>S</th><th>I</th><th>A</th><th>%</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">EduPresensi • Sistem Manajemen Absensi & Nilai</div></body></html>`;
      const { base64 } = await Print.printToFileAsync({ html, base64: true });
      const filename = `Absensi_${selectedClass.nama_kelas}_${activePeriod.tahun_ajaran.replace('/', '-')}.pdf`;
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

  // --- CALENDAR LOGIC ---
  const handlePrevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const selectDate = (day) => {
    const yyyy = currentMonth.getFullYear();
    const mm = String(currentMonth.getMonth() + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    setDate(`${yyyy}-${mm}-${dd}`);
    setCalendarVisible(false);
  };

  const getDaysInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  };

  const formatDateLabel = (dateString) => {
    const [y, m, d] = dateString.split('-');
    return `${parseInt(d)} ${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
  };

  const summary = Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({
    key,
    ...cfg,
    count: Object.values(attendance).filter(s => s === key).length,
  }));

  const renderHarianItem = ({ item }) => {
    const current = attendance[item.id_siswa];
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.numberBadge}>
            <Text style={styles.numberText}>{item.number}</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.nama.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.studentName}>{item.nama}</Text>
            <Text style={styles.studentNIS}>NIS/NISN: {item.nis || '-'}</Text>
          </View>
          {current && (
            <View style={[styles.currentBadge, { backgroundColor: STATUS_CONFIG[current].bg }]}>
              <Text style={[styles.currentBadgeText, { color: STATUS_CONFIG[current].dark }]}>
                {STATUS_CONFIG[current].label}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.statusRow}>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <TouchableOpacity
              key={key}
              style={[styles.statusBtn, current === key && { backgroundColor: cfg.color, borderColor: cfg.color }]}
              onPress={() => updateAttendance(item.id_siswa, key)}
            >
              <Text style={[styles.statusBtnText, current === key && { color: '#fff' }]}>
                {cfg.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderAnalisisItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.numberBadge}>
          <Text style={styles.numberText}>{item.number}</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.nama.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.studentName}>{item.nama}</Text>
          <Text style={styles.studentNIS}>NIS/NISN: {item.nis || '-'}</Text>
        </View>
      </View>

      <View style={styles.analyticsBoxRow}>
        {/* Semester Stats */}
        <View style={styles.analyticsBox}>
          <Text style={styles.analyticsBoxTitle}>Semester Ini (Smt {activePeriod.semester})</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.analyticsDetailText}>H: {item.stats.semester.H}  S: {item.stats.semester.S}  I: {item.stats.semester.I}  A: {item.stats.semester.A}</Text>
              <Text style={styles.analyticsDetailSub}>Total: {item.stats.semester.total} hari</Text>
            </View>
            <View style={styles.percentBadge}>
              <Text style={styles.percentText}>{item.semPercent}%</Text>
              <Text style={styles.percentSub}>Hadir</Text>
            </View>
          </View>
        </View>

        {/* Year Stats */}
        <View style={[styles.analyticsBox, { marginTop: 8 }]}>
          <Text style={styles.analyticsBoxTitle}>Tahun Ajaran ({activePeriod.tahun_ajaran})</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.analyticsDetailText}>H: {item.stats.year.H}  S: {item.stats.year.S}  I: {item.stats.year.I}  A: {item.stats.year.A}</Text>
              <Text style={styles.analyticsDetailSub}>Total: {item.stats.year.total} hari</Text>
            </View>
            <View style={styles.percentBadge}>
              <Text style={styles.percentText}>{item.yearPercent}%</Text>
              <Text style={styles.percentSub}>Hadir</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  if (!activePeriod) {
    return (
      <View style={styles.center}>
        <Ionicons name="calendar-outline" size={56} color="#cbd5e1" />
        <Text style={styles.centerText}>Periode aktif belum diatur.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Tabs */}
      <View style={styles.topTabs}>
        <TouchableOpacity
          style={[styles.topTabBtn, activeMainTab === 'harian' && styles.topTabBtnActive]}
          onPress={() => setActiveMainTab('harian')}
        >
          <Ionicons name="calendar-outline" size={16} color={activeMainTab === 'harian' ? '#fff' : '#64748b'} />
          <Text style={[styles.topTabText, activeMainTab === 'harian' && styles.topTabTextActive]}>Absensi Harian</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.topTabBtn, activeMainTab === 'analisis' && styles.topTabBtnActive]}
          onPress={() => setActiveMainTab('analisis')}
        >
          <Ionicons name="pie-chart-outline" size={16} color={activeMainTab === 'analisis' ? '#fff' : '#64748b'} />
          <Text style={[styles.topTabText, activeMainTab === 'analisis' && styles.topTabTextActive]}>Analisis Absensi</Text>
        </TouchableOpacity>
      </View>

      {/* Panel Kontrol (Hanya tampil jika ada kelas dan di tab harian) */}
      <View style={styles.controls}>
        {activeMainTab === 'harian' && (
          <TouchableOpacity
            style={styles.dateSelector}
            onPress={() => {
              const [y, m] = date.split('-');
              setCurrentMonth(new Date(y, m - 1, 1));
              setCalendarVisible(true);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar" size={16} color="#1d4ed8" />
            <Text style={styles.dateValue}>{formatDateLabel(date)}</Text>
            <Ionicons name="chevron-down" size={16} color="#94a3b8" />
          </TouchableOpacity>
        )}

        {/* Pilih Kelas */}
        {classes.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classScroll}>
            {classes.map(c => (
              <TouchableOpacity
                key={c.id_kelas}
                style={[styles.classChip, selectedClass?.id_kelas === c.id_kelas && styles.classChipActive]}
                onPress={() => setSelectedClass(c)}
              >
                <Ionicons
                  name="school-outline"
                  size={14}
                  color={selectedClass?.id_kelas === c.id_kelas ? '#fff' : '#64748b'}
                />
                <Text style={[styles.classChipText, selectedClass?.id_kelas === c.id_kelas && styles.classChipTextActive]}>
                  {c.nama_kelas}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.noClassBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
            <Text style={styles.noClassText}>Belum ada kelas. Buat kelas di menu Kelas.</Text>
          </View>
        )}
      </View>

      {/* Info Kelas & Summary Rekap (Hanya di Tab Harian) */}
      {activeMainTab === 'harian' && students.length > 0 && (
        <View style={styles.classInfoPanel}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItemTotal}>
              <Ionicons name="people" size={14} color="#64748b" />
              <Text style={styles.summaryTotalText}>{students.length} Siswa</Text>
            </View>
            {summary.map(s => (
              <View key={s.key} style={styles.summaryItem}>
                <Text style={styles.summaryNum}>{s.count}</Text>
                <Text style={styles.summaryLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      
      {/* Keterangan Analisis */}
      {activeMainTab === 'analisis' && analyticsData.length > 0 && (
        <View style={styles.classInfoPanel}>
          <View style={styles.exportBar}>
            <Text style={styles.exportLabel}>Unduh Analisis:</Text>
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
          <View style={styles.classInfoHeader}>
            <Ionicons name="stats-chart" size={16} color="#64748b" />
            <Text style={styles.classInfoTitle}>Persentase Kehadiran <Text style={{ color: '#0f172a' }}>{analyticsData.length}</Text> Siswa</Text>
          </View>
        </View>
      )}

      {/* List Siswa */}
      <FlatList
        data={activeMainTab === 'harian' ? students : analyticsData}
        keyExtractor={item => item.id_siswa.toString()}
        renderItem={activeMainTab === 'harian' ? renderHarianItem : renderAnalisisItem}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="clipboard-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>
              {classes.length === 0 ? 'Buat kelas terlebih dahulu' : 'Kelas ini belum ada siswa'}
            </Text>
            <Text style={styles.emptyDesc}>
              {classes.length === 0
                ? 'Pergi ke menu Kelas untuk membuat kelas dan menambahkan siswa.'
                : 'Tambahkan siswa ke kelas ini melalui menu Kelas.'}
            </Text>
          </View>
        }
      />

      {/* Modal Kalender */}
      <Modal visible={calendarVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.calendarCard}>
            <View style={styles.calHeader}>
              <TouchableOpacity onPress={handlePrevMonth} style={styles.calNav}>
                <Ionicons name="chevron-back" size={24} color="#1d4ed8" />
              </TouchableOpacity>
              <Text style={styles.calMonthLabel}>
                {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </Text>
              <TouchableOpacity onPress={handleNextMonth} style={styles.calNav}>
                <Ionicons name="chevron-forward" size={24} color="#1d4ed8" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.calDaysRow}>
              {DAY_NAMES.map(day => (
                <Text key={day} style={styles.calDayName}>{day}</Text>
              ))}
            </View>

            <View style={styles.calGrid}>
              {getDaysInMonth().map((day, idx) => {
                if (!day) return <View key={`empty-${idx}`} style={styles.calCell} />;
                
                const isSelected = 
                  date.split('-')[0] == currentMonth.getFullYear() &&
                  date.split('-')[1] == currentMonth.getMonth() + 1 &&
                  date.split('-')[2] == day;
                
                return (
                  <TouchableOpacity
                    key={`day-${day}`}
                    style={[styles.calCell, isSelected && styles.calCellSelected]}
                    onPress={() => selectDate(day)}
                  >
                    <Text style={[styles.calCellText, isSelected && styles.calCellTextSelected]}>{day}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.calCloseBtn} onPress={() => setCalendarVisible(false)}>
              <Text style={styles.calCloseBtnText}>Tutup</Text>
            </TouchableOpacity>
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
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0', gap: 8,
  },
  topTabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 7, borderRadius: 8,
    backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  topTabBtnActive: { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' },
  topTabText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  topTabTextActive: { color: '#fff' },

  controls: {
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  dateSelector: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#bfdbfe', marginBottom: 8,
  },
  dateValue: { flex: 1, fontSize: 14, fontWeight: 'bold', color: '#1e40af' },
  classScroll: { flexDirection: 'row' },
  classChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: '#f1f5f9', marginRight: 8, borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  classChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  classChipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  classChipTextActive: { color: '#fff' },
  noClassBanner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noClassText: { fontSize: 13, color: '#ef4444' },
  
  classInfoPanel: {
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  classInfoHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4,
  },
  classInfoTitle: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  summaryRow: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 6, gap: 6 },
  summaryItemTotal: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  summaryTotalText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  summaryNum: { fontSize: 16, fontWeight: 'bold', color: '#334155' },
  summaryLabel: { fontSize: 9, fontWeight: '700', marginTop: 1, color: '#334155' },
  listContainer: { padding: 16, paddingBottom: 32 },
  
  exportBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  exportLabel: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  exportBtnPdf: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ef4444', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  exportBtnExcel: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10b981', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  exportBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  numberBadge: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#f1f5f9',
    justifyContent: 'center', alignItems: 'center', marginRight: 4,
  },
  numberText: { fontSize: 11, fontWeight: 'bold', color: '#64748b' },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#dbeafe', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: 'bold', color: '#1d4ed8' },
  studentName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  studentNIS: { fontSize: 12, color: '#94a3b8' },
  currentBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  currentBadgeText: { fontSize: 12, fontWeight: '700' },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center',
    backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  statusBtnText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  
  analyticsBoxRow: { marginTop: 4 },
  analyticsBox: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 12, padding: 12,
  },
  analyticsBoxTitle: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 },
  analyticsDetailText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  analyticsDetailSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  percentBadge: {
    backgroundColor: '#3b82f6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
    justifyContent: 'center', alignItems: 'center',
  },
  percentText: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  percentSub: { fontSize: 9, color: '#dbeafe', fontWeight: 'bold' },

  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: 'bold', color: '#64748b', marginTop: 16, textAlign: 'center' },
  emptyDesc: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  
  // Calendar styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  calendarCard: { width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 20, elevation: 5 },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  calNav: { padding: 4 },
  calMonthLabel: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  calDaysRow: { flexDirection: 'row', marginBottom: 8 },
  calDayName: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: '#64748b' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  calCellSelected: { backgroundColor: '#2563eb', borderRadius: 100 },
  calCellText: { fontSize: 15, color: '#334155', fontWeight: '500' },
  calCellTextSelected: { color: '#fff', fontWeight: 'bold' },
  calCloseBtn: { marginTop: 20, backgroundColor: '#f1f5f9', padding: 14, borderRadius: 12, alignItems: 'center' },
  calCloseBtnText: { color: '#64748b', fontWeight: 'bold', fontSize: 15 },
});
