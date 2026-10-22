/**
 * Tab Helper for extracting current active tab metadata and generating rich link cards.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const BrowserAPI = require('./browser-api');
    module.exports = factory(BrowserAPI);
  } else {
    root.TabHelper = factory(root.BrowserAPI);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (BrowserAPI) {
  const TabHelper = {
    /**
     * Get metadata of the user's active tab in the current window.
     */
    async getActiveTab() {
      try {
        const tabs = await BrowserAPI.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0) {
          return this.formatTabInfo(tabs[0]);
        }

        // Fallback for popup/sidebar where currentWindow might differ
        const allActive = await BrowserAPI.tabs.query({ active: true, lastFocusedWindow: true });
        if (allActive && allActive.length > 0) {
          return this.formatTabInfo(allActive[0]);
        }
      } catch (err) {
        // Tab query error ignored
      }

      return null;
    },

    formatTabInfo(tab) {
      if (!tab || !tab.url) return null;

      let domain = '';
      let isSpecial = false;

      try {
        const parsed = new URL(tab.url);
        domain = parsed.hostname;
        if (['chrome:', 'about:', 'brave:', 'edge:', 'moz-extension:', 'chrome-extension:'].includes(parsed.protocol)) {
          isSpecial = true;
          domain = parsed.protocol.replace(':', '');
        }
      } catch (e) {
        domain = 'browser';
      }

      let favicon = tab.favIconUrl || '';
      if (!favicon && domain && !isSpecial) {
        favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
      }

      return {
        id: tab.id,
        url: tab.url,
        title: tab.title || domain || 'Shared Link',
        favIconUrl: favicon,
        domain: domain || 'web',
        isSpecial: isSpecial
      };
    },

    /**
     * Creates a standardized Link Card payload ready for sending.
     */
    createLinkCard(tabInfo, sender = {}) {
      if (!tabInfo) return null;

      return {
        type: 'link',
        id: `link-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        url: tabInfo.url,
        title: tabInfo.title,
        domain: tabInfo.domain,
        favIconUrl: tabInfo.favIconUrl,
        senderId: sender.id || 'me',
        senderName: sender.name || 'Friend',
        browser: sender.browser || BrowserAPI.detectBrowserName(),
        timestamp: Date.now()
      };
    }
  };

  return TabHelper;
});
