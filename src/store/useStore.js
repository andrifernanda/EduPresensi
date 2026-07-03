import { create } from 'zustand';

const useStore = create((set) => ({
  user: null, // { id_pengguna, username }
  activePeriod: null, // { id_periode, tahun_ajaran, semester }
  
  setUser: (user) => set({ user }),
  setActivePeriod: (period) => set({ activePeriod: period }),
  
  logout: () => set({ user: null, activePeriod: null }),
}));

export default useStore;
