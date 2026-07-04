import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useStore from '../../store/useStore';
import { getDb } from '../../database/db';
import { useFocusEffect } from '@react-navigation/native';

export default function HomeScreen({ navigation }) {
  const user = useStore((state) => state.user);
  const activePeriod = useStore((state) => state.activePeriod);
  const [stats, setStats] = useState({
    totalSiswa: 0,
    totalKelas: 0,
    siswaLobby: 0,
    siswaDiKelas: 0,
  });

  const fetchDashboardData = async () => {
    if (!user || !activePeriod) return;
    try {
      const db = await getDb();
      // Total siswa
      const st = await db.getFirstAsync('SELECT COUNT(id_siswa) as c FROM siswa WHERE id_pengguna = ?', [user.id_pengguna]);
      
      // Total kelas
      const cl = await db.getFirstAsync(
        'SELECT COUNT(id_kelas) as c FROM kelas WHERE id_pengguna = ? AND tahun_ajaran = ?',
        [user.id_pengguna, activePeriod.tahun_ajaran]
      );
      
      // Siswa di kelas pada tahun ajaran ini
      const sk = await db.getFirstAsync(`
        SELECT COUNT(DISTINCT s.id_siswa) as c
        FROM siswa s
        INNER JOIN siswa_kelas sk ON sk.id_siswa = s.id_siswa
        INNER JOIN kelas k ON k.id_kelas = sk.id_kelas
        WHERE s.id_pengguna = ? AND k.tahun_ajaran = ?
      `, [user.id_pengguna, activePeriod.tahun_ajaran]);

      setStats({
        totalSiswa: st.c,
        totalKelas: cl.c,
        siswaDiKelas: sk.c,
        siswaLobby: st.c - sk.c,
      });
    } catch (error) {
      console.error(error);
    }
  };

  useFocusEffect(useCallback(() => {
    fetchDashboardData();
  }, [user, activePeriod]));

  const MenuCard = ({ icon, color, title, desc, onPress }) => (
    <TouchableOpacity style={styles.menuCard} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.menuIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      <View style={styles.menuInfo}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuDesc}>{desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
      
      {/* Header Beranda */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Halo, {user?.nama_lengkap || user?.username} 👋</Text>
            <Text style={styles.dateText}>
              {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.nama_lengkap || user?.username || 'G').charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>

        {activePeriod && (
          <View style={styles.activePeriodBox}>
            <Ionicons name="calendar-outline" size={20} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.periodTitle}>Tahun Ajaran Aktif</Text>
              <Text style={styles.periodValue}>
                {activePeriod.tahun_ajaran} • Semester {activePeriod.semester}
              </Text>
            </View>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Ringkasan Statistik */}
        <Text style={styles.sectionTitle}>Ringkasan Anda</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: '#dbeafe' }]}>
              <Ionicons name="people" size={22} color="#2563eb" />
            </View>
            <Text style={styles.statValue}>{stats.totalSiswa}</Text>
            <Text style={styles.statLabel}>Total Siswa</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="time" size={22} color="#d97706" />
            </View>
            <Text style={styles.statValue}>{stats.siswaLobby}</Text>
            <Text style={styles.statLabel}>Di Lobby</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: '#e0e7ff' }]}>
              <Ionicons name="business" size={22} color="#4f46e5" />
            </View>
            <Text style={styles.statValue}>{stats.totalKelas}</Text>
            <Text style={styles.statLabel}>Total Kelas</Text>
          </View>
        </View>

        {/* Akses Cepat */}
        <Text style={styles.sectionTitle}>Akses Cepat</Text>
        <MenuCard
          icon="calendar" color="#10b981" title="Input Absensi"
          desc="Catat kehadiran siswa hari ini"
          onPress={() => navigation.navigate('Absensi')}
        />
        <MenuCard
          icon="bar-chart" color="#8b5cf6" title="Nilai"
          desc="Kelola nilai tugas dan ujian"
          onPress={() => navigation.navigate('Nilai')}
        />
        <MenuCard
          icon="server" color="#f59e0b" title="Cadangkan Database"
          desc="Backup & pulihkan data aplikasi"
          onPress={() => navigation.navigate('Pengaturan')}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    backgroundColor: '#1d4ed8', padding: 24, paddingTop: 16,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greeting: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  dateText: { fontSize: 13, color: '#bfdbfe' },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  activePeriodBox: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.15)', padding: 16, borderRadius: 16,
  },
  periodTitle: { fontSize: 12, color: '#bfdbfe', marginBottom: 2 },
  periodValue: { fontSize: 15, fontWeight: 'bold', color: '#fff' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#0f172a', marginBottom: 12, marginTop: 4 },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: '#fff', padding: 16, borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, elevation: 2,
  },
  statIconBox: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  statValue: { fontSize: 22, fontWeight: 'bold', color: '#0f172a', marginBottom: 2 },
  statLabel: { fontSize: 11, color: '#64748b', fontWeight: '500' },
  menuCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, elevation: 2,
  },
  menuIcon: {
    width: 52, height: 52, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  menuInfo: { flex: 1 },
  menuTitle: { fontSize: 16, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
  menuDesc: { fontSize: 13, color: '#64748b' },
});
