import * as SQLite from 'expo-sqlite';

let db = null;
const DB_VERSION = 5; // Naik versi → wipe tabel data lama

export const getDb = async () => {
  if (!db) {
    db = await SQLite.openDatabaseAsync('guruabsen.db');
  }
  return db;
};

export const initDb = async () => {
  const database = await getDb();

  await database.execAsync('PRAGMA journal_mode = WAL;');
  await database.execAsync('PRAGMA foreign_keys = ON;');

  // Cek versi schema
  const versionResult = await database.getFirstAsync('PRAGMA user_version');
  const currentVersion = versionResult ? versionResult['user_version'] : 0;

  // Jika versi lama, hapus semua tabel data & buat ulang
  if (currentVersion < DB_VERSION) {
    await database.execAsync(`
      DROP TABLE IF EXISTS absensi;
      DROP TABLE IF EXISTS nilai;
      DROP TABLE IF EXISTS kriteria_nilai;
      DROP TABLE IF EXISTS siswa_kelas;
      DROP TABLE IF EXISTS kelas;
      DROP TABLE IF EXISTS siswa;
      DROP TABLE IF EXISTS periode_ajaran;
      DROP TABLE IF EXISTS pengguna;
    `);
  }

  // Coba tambahkan kolom mata_pelajaran untuk versi transisi tanpa wipe (jika belum ada)
  try {
    await database.execAsync('ALTER TABLE pengguna ADD COLUMN mata_pelajaran TEXT;');
  } catch (error) {
    // Abaikan error jika kolom sudah ada
  }

  // Buat semua tabel
  await database.execAsync(`
    -- Akun guru (multi-user)
    CREATE TABLE IF NOT EXISTS pengguna (
        id_pengguna INTEGER PRIMARY KEY AUTOINCREMENT,
        username    TEXT UNIQUE NOT NULL,
        nama_lengkap TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        pertanyaan_keamanan TEXT NOT NULL,
        jawaban_keamanan TEXT NOT NULL,
        mata_pelajaran TEXT
    );

    -- Periode ajaran (semester) — per user
    CREATE TABLE IF NOT EXISTS periode_ajaran (
        id_periode   INTEGER PRIMARY KEY AUTOINCREMENT,
        id_pengguna  INTEGER NOT NULL,
        tahun_ajaran TEXT NOT NULL,
        semester     INTEGER CHECK(semester IN (1, 2)) NOT NULL,
        is_active    INTEGER DEFAULT 0,
        UNIQUE(id_pengguna, tahun_ajaran, semester),
        FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna) ON DELETE CASCADE
    );

    -- Siswa — per user, global (tidak terikat semester)
    CREATE TABLE IF NOT EXISTS siswa (
        id_siswa    INTEGER PRIMARY KEY AUTOINCREMENT,
        id_pengguna INTEGER NOT NULL,
        nis         TEXT,
        nama        TEXT NOT NULL,
        FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna) ON DELETE CASCADE
    );

    -- Kelas — per user + tahun_ajaran (berlaku untuk KEDUA semester)
    CREATE TABLE IF NOT EXISTS kelas (
        id_kelas     INTEGER PRIMARY KEY AUTOINCREMENT,
        id_pengguna  INTEGER NOT NULL,
        tahun_ajaran TEXT NOT NULL,
        nama_kelas   TEXT NOT NULL,
        UNIQUE(id_pengguna, tahun_ajaran, nama_kelas),
        FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna) ON DELETE CASCADE
    );

    -- Relasi siswa ↔ kelas (berlaku untuk kedua semester di tahun yang sama)
    CREATE TABLE IF NOT EXISTS siswa_kelas (
        id_sk     INTEGER PRIMARY KEY AUTOINCREMENT,
        id_siswa  INTEGER NOT NULL,
        id_kelas  INTEGER NOT NULL,
        UNIQUE(id_siswa, id_kelas),
        FOREIGN KEY (id_siswa) REFERENCES siswa(id_siswa) ON DELETE CASCADE,
        FOREIGN KEY (id_kelas) REFERENCES kelas(id_kelas) ON DELETE CASCADE
    );

    -- Kriteria penilaian — per periode (semester) DAN per kelas
    CREATE TABLE IF NOT EXISTS kriteria_nilai (
        id_kriteria   INTEGER PRIMARY KEY AUTOINCREMENT,
        id_periode    INTEGER NOT NULL,
        id_kelas      INTEGER NOT NULL,
        nama_kriteria TEXT NOT NULL,
        bobot         INTEGER DEFAULT 0,
        FOREIGN KEY (id_periode) REFERENCES periode_ajaran(id_periode) ON DELETE CASCADE,
        FOREIGN KEY (id_kelas) REFERENCES kelas(id_kelas) ON DELETE CASCADE
    );

    -- Nilai — per siswa per kriteria
    CREATE TABLE IF NOT EXISTS nilai (
        id_nilai    INTEGER PRIMARY KEY AUTOINCREMENT,
        id_siswa    INTEGER NOT NULL,
        id_kriteria INTEGER NOT NULL,
        nilai       REAL CHECK(nilai >= 0 AND nilai <= 100),
        FOREIGN KEY (id_siswa)    REFERENCES siswa(id_siswa) ON DELETE CASCADE,
        FOREIGN KEY (id_kriteria) REFERENCES kriteria_nilai(id_kriteria) ON DELETE CASCADE,
        UNIQUE(id_siswa, id_kriteria)
    );

    -- Absensi — per siswa per periode (semester)
    CREATE TABLE IF NOT EXISTS absensi (
        id_absensi  INTEGER PRIMARY KEY AUTOINCREMENT,
        id_siswa    INTEGER NOT NULL,
        id_periode  INTEGER NOT NULL,
        tanggal     TEXT NOT NULL,
        status      TEXT CHECK(status IN ('H', 'S', 'I', 'A')) NOT NULL,
        FOREIGN KEY (id_siswa)   REFERENCES siswa(id_siswa) ON DELETE CASCADE,
        FOREIGN KEY (id_periode) REFERENCES periode_ajaran(id_periode) ON DELETE CASCADE,
        UNIQUE(id_siswa, tanggal, id_periode)
    );
  `);

  // Auto-seed Akun Demo (untuk Google Play Console)
  const demoExists = await database.getFirstAsync('SELECT id_pengguna, password_hash FROM pengguna WHERE username = ?', ['12345']);
  
  let demoUserId = null;
  
  if (!demoExists) {
    const result = await database.runAsync(
      'INSERT INTO pengguna (username, nama_lengkap, password_hash, pertanyaan_keamanan, jawaban_keamanan, mata_pelajaran) VALUES (?, ?, ?, ?, ?, ?)',
      ['12345', 'Akun Demo (Reviewer)', '5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5', 'Siapa nama Anda?', 'demo', 'Umum']
    );
    demoUserId = result.lastInsertRowId;
    console.log('Akun demo (12345) berhasil dibuat otomatis.');
  } else {
    demoUserId = demoExists.id_pengguna;
    if (demoExists.password_hash === '12345') {
      // Perbaiki password hash yang salah pada versi sebelumnya
      await database.runAsync('UPDATE pengguna SET password_hash = ? WHERE username = ?', ['5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5', '12345']);
    }
  }

  // Pastikan akun demo sudah memiliki Tahun Ajaran 2026/2027 yang aktif agar langsung masuk Dashboard
  if (demoUserId) {
    const periodExists = await database.getFirstAsync('SELECT id_periode FROM periode_ajaran WHERE id_pengguna = ?', [demoUserId]);
    if (!periodExists) {
      await database.runAsync(
        'INSERT INTO periode_ajaran (id_pengguna, tahun_ajaran, semester, is_active) VALUES (?, ?, ?, ?)',
        [demoUserId, '2026/2027', 1, 1]
      );
      console.log('Periode aktif 2026/2027 untuk akun demo ditambahkan.');
    }
  }

  await database.execAsync(`PRAGMA user_version = ${DB_VERSION};`);
  console.log(`DB siap (v${DB_VERSION})`);
};
