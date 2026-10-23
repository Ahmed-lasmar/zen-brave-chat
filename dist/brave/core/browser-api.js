/**
 * Cross-browser compatibility abstraction layer for Zen Browser (Firefox Gecko)
 * and Brave Browser (Chromium Blink).
 *
 * Normalizes differences between `chrome.*` and `browser.*` APIs and provides
 * standard Promise-based interfaces.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BrowserAPI = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const hasBrowser = typeof browser !== 'undefined' && browser.runtime;
  const hasChrome = typeof chrome !== 'undefined' && chrome.runtime;

  const rawApi = hasBrowser ? browser : (hasChrome ? chrome : null);

  const isFirefox = typeof navigator !== 'undefined' &&
    (/firefox|zen/i.test(navigator.userAgent) || hasBrowser);
  const isChromium = !isFirefox;

  function promisify(apiObj, method, ...args) {
    if (!apiObj || typeof apiObj[method] !== 'function') {
      return Promise.reject(new Error(`API method ${method} is not supported`));
    }

    try {
      const res = apiObj[method](...args);
      if (res && typeof res.then === 'function') {
        return res;
      }
    } catch (e) {
      // Fallback to callback if invocation failed or expected callback
    }

    return new Promise((resolve, reject) => {
      try {
        apiObj[method](...args, (result) => {
          const lastError = (rawApi && rawApi.runtime && rawApi.runtime.lastError) ||
            (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError);
          if (lastError) {
            reject(new Error(lastError.message || String(lastError)));
          } else {
            resolve(result);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  const BrowserAPI = {
    isFirefox,
    isChromium,
    raw: rawApi,

    detectBrowserName() {
      if (typeof navigator === 'undefined') return 'Node/Test';
      const ua = navigator.userAgent;
      if (/zen/i.test(ua)) return 'Zen Browser';
      if (/brave/i.test(ua)) return 'Brave Browser';
      if (/firefox/i.test(ua)) return 'Zen (Firefox)';
      if (/chrome/i.test(ua)) return 'Brave (Chromium)';
      return 'Modern Browser';
    },

    tabs: {
      async query(queryInfo) {
        if (!rawApi || !rawApi.tabs) return [];
        return promisify(rawApi.tabs, 'query', queryInfo);
      },
      async get(tabId) {
        if (!rawApi || !rawApi.tabs) return null;
        return promisify(rawApi.tabs, 'get', tabId);
      },
      async create(createProperties) {
        if (!rawApi || !rawApi.tabs) return null;
        return promisify(rawApi.tabs, 'create', createProperties);
      },
      async update(tabId, updateProperties) {
        if (!rawApi || !rawApi.tabs) return null;
        return promisify(rawApi.tabs, 'update', tabId, updateProperties);
      },
      onActivated: {
        addListener(callback) {
          if (rawApi && rawApi.tabs && rawApi.tabs.onActivated) {
            rawApi.tabs.onActivated.addListener(callback);
          }
        },
        removeListener(callback) {
          if (rawApi && rawApi.tabs && rawApi.tabs.onActivated) {
            rawApi.tabs.onActivated.removeListener(callback);
          }
        }
      },
      onUpdated: {
        addListener(callback) {
          if (rawApi && rawApi.tabs && rawApi.tabs.onUpdated) {
            rawApi.tabs.onUpdated.addListener(callback);
          }
        },
        removeListener(callback) {
          if (rawApi && rawApi.tabs && rawApi.tabs.onUpdated) {
            rawApi.tabs.onUpdated.removeListener(callback);
          }
        }
      }
    },

    storage: {
      local: {
        async get(keys) {
          if (!rawApi || !rawApi.storage || !rawApi.storage.local) {
            const res = {};
            const store = typeof localStorage !== 'undefined' ? {
              get: (k) => localStorage.getItem(k),
              set: (k, v) => localStorage.setItem(k, v),
              remove: (k) => localStorage.removeItem(k)
            } : {
              get: (k) => (BrowserAPI._memStore ? BrowserAPI._memStore.get(k) : null),
              set: (k, v) => { if (!BrowserAPI._memStore) BrowserAPI._memStore = new Map(); BrowserAPI._memStore.set(k, v); },
              remove: (k) => { if (BrowserAPI._memStore) BrowserAPI._memStore.delete(k); }
            };

            if (Array.isArray(keys)) {
              keys.forEach(k => {
                const val = store.get(k);
                try { res[k] = val !== null && val !== undefined ? JSON.parse(val) : undefined; } catch (_) { res[k] = val; }
              });
            } else if (typeof keys === 'string') {
              const val = store.get(keys);
              try { res[keys] = val !== null && val !== undefined ? JSON.parse(val) : undefined; } catch (_) { res[keys] = val; }
            } else if (typeof keys === 'object' && keys !== null) {
              for (const [k, def] of Object.entries(keys)) {
                const val = store.get(k);
                try { res[k] = val !== null && val !== undefined ? JSON.parse(val) : def; } catch (_) { res[k] = val !== null && val !== undefined ? val : def; }
              }
            } else {
              // Get all
              if (BrowserAPI._memStore) {
                for (const [k, val] of BrowserAPI._memStore.entries()) {
                  try { res[k] = JSON.parse(val); } catch (_) { res[k] = val; }
                }
              }
            }
            return res;
          }
          return promisify(rawApi.storage.local, 'get', keys);
        },
        async set(items) {
          if (!rawApi || !rawApi.storage || !rawApi.storage.local) {
            const store = typeof localStorage !== 'undefined' ? {
              set: (k, v) => localStorage.setItem(k, v)
            } : {
              set: (k, v) => { if (!BrowserAPI._memStore) BrowserAPI._memStore = new Map(); BrowserAPI._memStore.set(k, v); }
            };
            for (const [k, v] of Object.entries(items)) {
              store.set(k, JSON.stringify(v));
            }
            return;
          }
          return promisify(rawApi.storage.local, 'set', items);
        },
        async remove(keys) {
          if (!rawApi || !rawApi.storage || !rawApi.storage.local) {
            const store = typeof localStorage !== 'undefined' ? {
              remove: (k) => localStorage.removeItem(k)
            } : {
              remove: (k) => { if (BrowserAPI._memStore) BrowserAPI._memStore.delete(k); }
            };
            const arr = Array.isArray(keys) ? keys : [keys];
            arr.forEach(k => store.remove(k));
            return;
          }
          return promisify(rawApi.storage.local, 'remove', keys);
        }
      }
    },

    notifications: {
      async create(id, options) {
        if (!rawApi || !rawApi.notifications) {
          // Web Notification API fallback if supported
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification(options.title || 'Zen & Brave Chat', {
                body: options.message || '',
                icon: options.iconUrl || ''
              });
              return id || 'note';
            } catch (e) {
              return null;
            }
          }
          return null;
        }

        // Check if id is optional or required in the API
        if (typeof id === 'string') {
          return promisify(rawApi.notifications, 'create', id, options);
        } else {
          return promisify(rawApi.notifications, 'create', options);
        }
      },
      onClicked: {
        addListener(callback) {
          if (rawApi && rawApi.notifications && rawApi.notifications.onClicked) {
            rawApi.notifications.onClicked.addListener(callback);
          }
        }
      }
    },

    action: {
      async setBadgeText(details) {
        const actionApi = (rawApi && rawApi.action) || (rawApi && rawApi.browserAction);
        if (!actionApi || !actionApi.setBadgeText) return;
        return promisify(actionApi, 'setBadgeText', details);
      },
      async setBadgeBackgroundColor(details) {
        const actionApi = (rawApi && rawApi.action) || (rawApi && rawApi.browserAction);
        if (!actionApi || !actionApi.setBadgeBackgroundColor) return;
        return promisify(actionApi, 'setBadgeBackgroundColor', details);
      }
    },

    runtime: {
      sendMessage(message) {
        if (!rawApi || !rawApi.runtime || !rawApi.runtime.sendMessage) {
          return Promise.resolve(null);
        }
        return promisify(rawApi.runtime, 'sendMessage', message).catch(() => null);
      },
      onMessage: {
        addListener(callback) {
          if (rawApi && rawApi.runtime && rawApi.runtime.onMessage) {
            rawApi.runtime.onMessage.addListener(callback);
          }
        }
      },
      getURL(path) {
        if (rawApi && rawApi.runtime && rawApi.runtime.getURL) {
          return rawApi.runtime.getURL(path);
        }
        return path;
      },
      getManifest() {
        if (rawApi && rawApi.runtime && rawApi.runtime.getManifest) {
          return rawApi.runtime.getManifest();
        }
        return null;
      },
      reload() {
        if (rawApi && rawApi.runtime && rawApi.runtime.reload) {
          rawApi.runtime.reload();
        }
      },
      requestUpdateCheck(callback) {
        if (rawApi && rawApi.runtime && rawApi.runtime.requestUpdateCheck) {
          return rawApi.runtime.requestUpdateCheck(callback);
        }
        if (typeof callback === 'function') {
          callback('no_update');
        }
      }
    }
  };

  return BrowserAPI;
});
