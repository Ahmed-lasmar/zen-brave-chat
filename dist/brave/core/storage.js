/**
 * Storage manager for settings, room history, and saved links.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const BrowserAPI = require('./browser-api');
    module.exports = factory(BrowserAPI);
  } else {
    root.AppStorage = factory(root.BrowserAPI);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (BrowserAPI) {
  const DEFAULTS = {
    userName: '',
    serverUrl: 'wss://zenbrave.myapps.tn',
    theme: 'zen-amoled', // 'zen-amoled' | 'dark' | 'light'
    soundEnabled: true,
    notificationsEnabled: true,
    lastRoomId: '',
    recentRooms: [],
    savedLinks: [],
    messageCache: {} // roomId -> Array
  };

  const AppStorage = {
    async getSettings() {
      const data = await BrowserAPI.storage.local.get([
        'userName',
        'serverUrl',
        'theme',
        'soundEnabled',
        'notificationsEnabled',
        'lastRoomId'
      ]);

      const defaultName = BrowserAPI.isFirefox ? 'Zen Explorer' : 'Brave Surfer';

      return {
        userName: data.userName || defaultName,
        serverUrl: data.serverUrl || DEFAULTS.serverUrl,
        theme: data.theme || DEFAULTS.theme,
        soundEnabled: data.soundEnabled !== undefined ? data.soundEnabled : DEFAULTS.soundEnabled,
        notificationsEnabled: data.notificationsEnabled !== undefined ? data.notificationsEnabled : DEFAULTS.notificationsEnabled,
        lastRoomId: data.lastRoomId || ''
      };
    },

    async saveSettings(settings) {
      await BrowserAPI.storage.local.set(settings);
    },

    async getSavedLinks() {
      const data = await BrowserAPI.storage.local.get(['savedLinks']);
      return Array.isArray(data.savedLinks) ? data.savedLinks : [];
    },

    async saveLink(linkItem) {
      const links = await this.getSavedLinks();
      // Deduplicate by URL
      const filtered = links.filter(l => l.url !== linkItem.url);
      filtered.unshift({
        ...linkItem,
        savedAt: Date.now()
      });
      // Limit to 500 links
      const trimmed = filtered.slice(0, 500);
      await BrowserAPI.storage.local.set({ savedLinks: trimmed });
      return trimmed;
    },

    async removeSavedLink(url) {
      const links = await this.getSavedLinks();
      const updated = links.filter(l => l.url !== url);
      await BrowserAPI.storage.local.set({ savedLinks: updated });
      return updated;
    },

    async clearAllSavedLinks() {
      await BrowserAPI.storage.local.set({ savedLinks: [] });
      return [];
    },

    async addRecentRoom(roomId) {
      if (!roomId) return;
      const data = await BrowserAPI.storage.local.get(['recentRooms']);
      const list = Array.isArray(data.recentRooms) ? data.recentRooms : [];
      const updated = [roomId, ...list.filter(id => id !== roomId)].slice(0, 10);
      await BrowserAPI.storage.local.set({ recentRooms: updated, lastRoomId: roomId });
    },

    async getRecentRooms() {
      const data = await BrowserAPI.storage.local.get(['recentRooms']);
      return Array.isArray(data.recentRooms) ? data.recentRooms : [];
    },

    async getCachedMessages(roomId) {
      const data = await BrowserAPI.storage.local.get(['messageCache']);
      const cache = data.messageCache || {};
      return cache[roomId] || [];
    },

    async cacheMessages(roomId, messages) {
      if (!roomId) return;
      const data = await BrowserAPI.storage.local.get(['messageCache']);
      const cache = data.messageCache || {};
      const seen = new Set();
      const deduped = [];
      for (const m of (messages || [])) {
        const id = m.id || `${m.timestamp}-${m.text}`;
        if (!seen.has(id)) {
          seen.add(id);
          deduped.push(m);
        }
      }
      cache[roomId] = deduped.slice(-100);
      await BrowserAPI.storage.local.set({ messageCache: cache });
    }
  };

  return AppStorage;
});
