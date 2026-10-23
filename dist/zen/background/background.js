/**
 * Cross-browser Background Worker (Service Worker in Brave, Background Script in Zen)
 * Handles incoming notification alerts, badge counter updates, and notification click actions.
 */

try {
  // If in Service Worker / modular context where importScripts is available
  if (typeof importScripts === 'function') {
    importScripts('../core/browser-api.js');
  }
} catch (e) {
  // Ignored if bundled or loaded via HTML script tags
}

const rawApi = typeof browser !== 'undefined' && browser.runtime ? browser : (typeof chrome !== 'undefined' ? chrome : null);

let unreadCount = 0;

function updateBadge(count) {
  if (!rawApi) return;
  const actionApi = rawApi.action || rawApi.browserAction;
  if (!actionApi) return;

  unreadCount = count;
  const text = unreadCount > 0 ? String(unreadCount) : '';

  try {
    actionApi.setBadgeText({ text });
    actionApi.setBadgeBackgroundColor({ color: '#6366f1' });
  } catch (e) {
    // Badge error ignored
  }
}

if (rawApi && rawApi.runtime && rawApi.runtime.onMessage) {
  rawApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request) return;

    if (request.type === 'new-message') {
      const msg = request.message;
      unreadCount++;
      updateBadge(unreadCount);

      // Create desktop notification
      if (rawApi.notifications && rawApi.notifications.create) {
        let title = msg.senderName || 'Friend';
        let body = '';

        if (msg.type === 'link' || msg.link) {
          title = `🔗 ${msg.senderName || 'Friend'}`;
          body = (msg.link && msg.link.title) || msg.url || 'Shared a link';
        } else if (msg.type === 'voice' || (msg.media && msg.media.type === 'voice')) {
          title = `🎤 ${msg.senderName || 'Friend'}`;
          body = 'Sent a voice note';
        } else if (msg.type === 'image' || (msg.media && msg.media.type === 'image')) {
          title = `📷 ${msg.senderName || 'Friend'}`;
          body = `Sent an image: ${(msg.media && msg.media.name) || 'image'}`;
        } else if (msg.type === 'media' || msg.media) {
          title = `📎 ${msg.senderName || 'Friend'}`;
          body = `Sent a file: ${msg.media.name || 'file'}`;
        } else {
          body = msg.text || 'Sent a message';
        }

        try {
          rawApi.notifications.create(msg.id || `msg-${Date.now()}`, {
            type: 'basic',
            iconUrl: (rawApi.runtime && rawApi.runtime.getURL) ? rawApi.runtime.getURL('ui/icons/icon-128.png') : 'ui/icons/icon-128.png',
            title: title,
            message: body,
            priority: 2
          });
        } catch (e) {
          // Fallback without icon if iconUrl is not resolved
          try {
            rawApi.notifications.create({
              type: 'basic',
              title: title,
              message: body
            });
          } catch (_) {}
        }
      }

      sendResponse({ status: 'ok' });
      return true;
    }

    if (request.type === 'clear-badge') {
      updateBadge(0);
      sendResponse({ status: 'ok' });
      return true;
    }
  });
}

// Notification click handler: focuses the extension sidebar / side panel / window
if (rawApi && rawApi.notifications && rawApi.notifications.onClicked) {
  rawApi.notifications.onClicked.addListener((notificationId) => {
    updateBadge(0);
    try {
      rawApi.notifications.clear(notificationId, () => {});
    } catch (_) {}

    // Focus the browser window and activate sidebar/side-panel
    try {
      if (rawApi.windows) {
        rawApi.windows.getLastFocused({ populate: true }, (win) => {
          if (win && win.id) {
            try { rawApi.windows.update(win.id, { focused: true }); } catch (_) {}
            if (rawApi.sidePanel && rawApi.sidePanel.open) {
              try { rawApi.sidePanel.open({ windowId: win.id }); } catch (_) {}
            }
          }
        });
      }
      if (rawApi.sidebarAction && rawApi.sidebarAction.open) {
        try { rawApi.sidebarAction.open(); } catch (_) {}
      }
    } catch (_) {}
  });
}

// Toolbar action click listener (Gecko / Chrome)
const actionApi = (rawApi && (rawApi.action || rawApi.browserAction)) || null;
if (actionApi && actionApi.onClicked) {
  actionApi.onClicked.addListener((tab) => {
    console.log("Toolbar action clicked in tab:", tab ? tab.id : 'unknown');
    try {
      if (rawApi.sidebarAction && rawApi.sidebarAction.open) {
        rawApi.sidebarAction.open();
      } else if (rawApi.sidebarAction && rawApi.sidebarAction.toggle) {
        rawApi.sidebarAction.toggle();
      } else if (rawApi.sidePanel && rawApi.sidePanel.open && tab && tab.windowId) {
        rawApi.sidePanel.open({ windowId: tab.windowId });
      }
    } catch (e) {
      console.warn("Could not handle action onClicked:", e);
    }
  });
}
