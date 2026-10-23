/**
 * UI Controller for Zen & Brave Link Chat Extension
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const headerRoomBadge = document.getElementById('room-badge-pill');
  const headerRoomBadgeText = document.getElementById('room-badge-text');
  const quickShareTabBtn = document.getElementById('quick-share-tab-btn');
  const connectionDot = document.getElementById('connection-status-dot');
  const connectionLabel = document.getElementById('connection-status-label');

  // Navigation
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const linksCountBadge = document.getElementById('links-count-badge');

  // Chat Pane
  const activeTabBanner = document.getElementById('active-tab-banner');
  const activeTabFavicon = document.getElementById('active-tab-favicon');
  const activeTabTitle = document.getElementById('active-tab-title');
  const bannerShareBtn = document.getElementById('banner-share-btn');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const attachFileBtn = document.getElementById('attach-file-btn');
  const filePickerInput = document.getElementById('file-picker-input');
  const micVoiceBtn = document.getElementById('mic-voice-btn');
  const voiceRecordBar = document.getElementById('voice-record-bar');
  const recordingTimer = document.getElementById('recording-timer');
  const cancelVoiceBtn = document.getElementById('cancel-voice-btn');
  const sendVoiceBtn = document.getElementById('send-voice-btn');

  // Reply & Emoji Picker Elements
  const replyPreviewBar = document.getElementById('reply-preview-bar');
  const replyPreviewUser = document.getElementById('reply-preview-user');
  const replyPreviewText = document.getElementById('reply-preview-text');
  const cancelReplyBtn = document.getElementById('cancel-reply-btn');
  const quickEmojiReplyBtns = document.querySelectorAll('.quick-emoji-reply-btn');
  const emojiPickerBtn = document.getElementById('emoji-picker-btn');
  const emojiPalettePopover = document.getElementById('emoji-palette-popover');
  const closeEmojiPaletteBtn = document.getElementById('close-emoji-palette-btn');
  const emojiPaletteBtns = document.querySelectorAll('.emoji-btn');

  // Links Hub Pane
  const linksSearchInput = document.getElementById('links-search-input');
  const clearAllLinksBtn = document.getElementById('clear-all-links-btn');
  const linksList = document.getElementById('links-list');

  // Connect Pane
  const createRoomBtn = document.getElementById('create-room-btn');
  const joinRoomInput = document.getElementById('join-room-input');
  const joinRoomBtn = document.getElementById('join-room-btn');
  const activeRoomDisplay = document.getElementById('active-room-display');
  const currentRoomName = document.getElementById('current-room-name');
  const copyRoomCodeBtn = document.getElementById('copy-room-code-btn');
  const leaveRoomBtn = document.getElementById('leave-room-btn');
  const peersList = document.getElementById('peers-list');
  const myPeerName = document.getElementById('my-peer-name');
  const myPeerBrowser = document.getElementById('my-peer-browser');
  const recentRoomsContainer = document.getElementById('recent-rooms-container');
  const quickUsernameInput = document.getElementById('quick-username-input');
  const quickSaveUsernameBtn = document.getElementById('quick-save-username-btn');

  // Settings Pane
  const settingUsername = document.getElementById('setting-username');
  const settingServerUrl = document.getElementById('setting-server-url');
  const settingTheme = document.getElementById('setting-theme');
  const settingSound = document.getElementById('setting-sound');
  const settingNotifications = document.getElementById('setting-notifications');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  const testServerBtn = document.getElementById('test-server-btn');
  const serverTestResult = document.getElementById('server-test-result');

  const toastContainer = document.getElementById('toast-container');

  // State
  let settings = await AppStorage.getSettings();
  let currentActiveTab = null;
  let savedLinks = await AppStorage.getSavedLinks();
  const mediaHandler = new MediaHandler();
  let connection = null;

  // 1. Initialize Appearance & Settings
  applyTheme(settings.theme);
  settingUsername.value = settings.userName;
  if (quickUsernameInput) quickUsernameInput.value = settings.userName;
  settingServerUrl.value = settings.serverUrl;
  settingTheme.value = settings.theme;
  settingSound.checked = settings.soundEnabled;
  settingNotifications.checked = settings.notificationsEnabled;
  myPeerName.textContent = settings.userName;
  myPeerBrowser.textContent = BrowserAPI.detectBrowserName();

  async function updateAndSaveUsername(newName) {
    const cleanName = (newName || '').trim();
    if (!cleanName) return;

    settings = {
      ...settings,
      userName: cleanName
    };
    await AppStorage.saveSettings(settings);

    settingUsername.value = cleanName;
    if (quickUsernameInput) quickUsernameInput.value = cleanName;
    if (myPeerName) myPeerName.textContent = cleanName;

    const mePeerNameEl = peersList.querySelector('.peer-item.me .peer-name');
    if (mePeerNameEl) mePeerNameEl.textContent = cleanName;

    if (connection) {
      connection.userName = cleanName;
      connection.updateUserName(cleanName);
    }

    showToast(`Display name updated to: ${cleanName}`);
  }

  if (quickSaveUsernameBtn) {
    quickSaveUsernameBtn.onclick = () => {
      updateAndSaveUsername(quickUsernameInput.value);
    };
  }
  if (quickUsernameInput) {
    quickUsernameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        updateAndSaveUsername(quickUsernameInput.value);
      }
    });
  }

  // Clear unread badge when extension window / tab gains focus
  window.addEventListener('focus', () => {
    try {
      BrowserAPI.runtime.sendMessage({ type: 'clear-badge' });
    } catch (_) {}
  });

  // Request browser notification permission if not yet decided
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    try {
      Notification.requestPermission().catch(() => {});
    } catch (_) {}
  }

  // 2. Initialize Connection
  initConnection();

  // 3. Initialize Active Tab Info
  await refreshActiveTab();

  // 4. Render Saved Links & Recent Rooms
  renderSavedLinks(savedLinks);
  renderRecentRooms();

  // --- Helpers & Sanitization ---
  let currentAudio = null;
  const renderedMessageIds = new Set();
  let activeRoomMessages = [];
  let currentReplyTarget = null;

  function setReplyTarget(msg) {
    if (!msg) return;
    const isMe = msg.senderId === (connection ? connection.peerId : '');
    const senderName = isMe ? 'You' : (msg.senderName || 'Friend');
    let snippet = '';
    if (msg.type === 'link' || msg.link) {
      snippet = (msg.link && msg.link.title) || msg.url || 'Shared a link';
    } else if (msg.type === 'voice' || (msg.media && msg.media.type === 'voice')) {
      snippet = '🎤 Voice note';
    } else if (msg.type === 'image' || (msg.media && msg.media.type === 'image')) {
      snippet = '📷 Photo attachment';
    } else {
      snippet = msg.text || '';
    }

    currentReplyTarget = {
      id: msg.id,
      senderName: senderName,
      text: snippet.substring(0, 100),
      type: msg.type || 'text'
    };

    if (replyPreviewUser) replyPreviewUser.textContent = senderName;
    if (replyPreviewText) replyPreviewText.textContent = snippet;
    if (replyPreviewBar) replyPreviewBar.classList.remove('hidden');
    if (chatInput) chatInput.focus();
  }

  function clearReplyTarget() {
    currentReplyTarget = null;
    if (replyPreviewBar) replyPreviewBar.classList.add('hidden');
  }

  if (cancelReplyBtn) {
    cancelReplyBtn.onclick = clearReplyTarget;
  }

  function renderReactionPills(container, msgId, reactions) {
    if (!container) return;
    container.innerHTML = '';
    if (!reactions || typeof reactions !== 'object') return;

    for (const [emoji, senders] of Object.entries(reactions)) {
      if (!Array.isArray(senders) || senders.length === 0) continue;
      const pill = document.createElement('button');
      pill.type = 'button';
      const myId = connection ? connection.peerId : '';
      const myName = settings ? settings.userName : '';
      const isMine = senders.includes(myName) || senders.includes(myId);
      pill.className = `reaction-pill ${isMine ? 'active' : ''}`;
      pill.innerHTML = `<span>${escapeHtml(emoji)}</span> <span class="reaction-count">${senders.length}</span>`;
      pill.title = senders.join(', ');
      pill.onclick = (e) => {
        e.stopPropagation();
        if (connection && connection.roomId) {
          connection.sendReaction(msgId, emoji);
          toggleLocalReaction(msgId, emoji);
        } else {
          showToast('Join a room first');
        }
      };
      container.appendChild(pill);
    }
  }

  function toggleLocalReaction(msgId, emoji) {
    const user = settings.userName || 'You';
    const targetMsg = activeRoomMessages.find(m => m.id === msgId);
    if (targetMsg) {
      targetMsg.reactions = targetMsg.reactions || {};
      targetMsg.reactions[emoji] = targetMsg.reactions[emoji] || [];
      const idx = targetMsg.reactions[emoji].indexOf(user);
      if (idx >= 0) {
        targetMsg.reactions[emoji].splice(idx, 1);
        if (targetMsg.reactions[emoji].length === 0) {
          delete targetMsg.reactions[emoji];
        }
      } else {
        targetMsg.reactions[emoji].push(user);
      }
      if (connection && connection.roomId) {
        AppStorage.cacheMessages(connection.roomId, activeRoomMessages);
      }
      const box = document.getElementById(`reactions-${msgId}`);
      if (box) renderReactionPills(box, msgId, targetMsg.reactions);
    }
  }

  function insertTextAtCursor(input, textToInsert) {
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const val = input.value;
    input.value = val.substring(0, start) + textToInsert + val.substring(end);
    input.selectionStart = input.selectionEnd = start + textToInsert.length;
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    const trimmed = url.trim();
    if (/^(https?:\/\/|moz-extension:\/\/|chrome-extension:\/\/|about:|data:image\/|data:audio\/)/i.test(trimmed)) {
      return trimmed;
    }
    return '#';
  }

  function applyTheme(themeName) {
    document.body.className = '';
    document.body.classList.add(themeName || 'theme-zen-amoled');
  }

  function showToast(text, duration = 2500) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function playTone(isSend = false) {
    if (!settings.soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (isSend) {
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.12);
      } else {
        osc.frequency.setValueAtTime(780, now);
        osc.frequency.exponentialRampToValueAtTime(520, now + 0.12);
      }

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.start(now);
      osc.stop(now + 0.16);
    } catch (_) {}
  }

  async function loadRoomMessages(roomId) {
    renderedMessageIds.clear();
    chatMessages.innerHTML = '';
    const cached = await AppStorage.getCachedMessages(roomId);
    if (cached && cached.length > 0) {
      activeRoomMessages = [...cached];
      for (const m of cached) {
        renderMessage(m, m.senderId === connection.peerId);
      }
      scrollChatToBottom();
    } else {
      activeRoomMessages = [];
      chatMessages.innerHTML = `
        <div class="system-notice intro-notice">
          <div class="notice-icon">💬</div>
          <div class="notice-title">Room ${escapeHtml(roomId)}</div>
          <div class="notice-desc">Connected! Share links, chats, and voice notes.</div>
        </div>
      `;
    }
  }

  function initConnection() {
    connection = new ConnectionManager({
      serverUrl: settings.serverUrl,
      userName: settings.userName
    });

    connection.on('statusChange', ({ state, mode, roomId, error }) => {
      connectionDot.className = 'status-indicator ' + state;
      if (state === 'connected') {
        connectionLabel.textContent = mode === 'p2p' ? 'P2P Direct' : 'Relay';
      } else if (state === 'connecting') {
        connectionLabel.textContent = 'Connecting...';
      } else {
        connectionLabel.textContent = 'Offline';
      }

      if (roomId) {
        headerRoomBadge.classList.remove('hidden');
        headerRoomBadgeText.textContent = roomId;
        activeRoomDisplay.classList.remove('hidden');
        currentRoomName.textContent = roomId;
      } else {
        headerRoomBadge.classList.add('hidden');
        activeRoomDisplay.classList.add('hidden');
      }

      if (error) {
        showToast(`Connection notice: ${error}`);
      }
    });

    connection.on('roomJoined', async ({ roomId, peers, history }) => {
      showToast(`Connected to room ${roomId}`);
      await AppStorage.addRecentRoom(roomId);
      renderRecentRooms();
      updatePeersList(peers);

      await loadRoomMessages(roomId);

      // Render offline message queue / history
      if (history && history.length > 0) {
        for (const msg of history) {
          const isMe = msg.senderId === connection.peerId;
          renderMessage(msg, isMe);
          activeRoomMessages.push(msg);
          if (msg.link) {
            savedLinks = await AppStorage.saveLink(msg.link);
          }
        }
        await AppStorage.cacheMessages(roomId, activeRoomMessages);
        renderSavedLinks(savedLinks);
        scrollChatToBottom();
      }
    });

    connection.on('peerJoined', (peer) => {
      showToast(`${peer.name} (${peer.browser || 'peer'}) joined`);
      addPeerToUI(peer);
      playTone(false);
    });

    connection.on('peerLeft', (peer) => {
      showToast(`${peer.name || 'Friend'} left room`);
      removePeerFromUI(peer.peerId || peer.id);
    });

    connection.on('peerUpdated', ({ peer, oldName }) => {
      showToast(`${oldName || 'Friend'} is now ${peer.name}`);
      const safeId = String(peer.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
      const item = document.getElementById(`peer-${safeId}`);
      if (item) {
        const nameEl = item.querySelector('.peer-name');
        if (nameEl) nameEl.textContent = peer.name;
        const avatarEl = item.querySelector('.peer-avatar');
        if (avatarEl) avatarEl.textContent = (peer.name || 'F').charAt(0).toUpperCase();
      }
    });

    connection.on('message', async (message) => {
      const isMe = message.senderId === connection.peerId;
      renderMessage(message, isMe);
      scrollChatToBottom();

      if (connection.roomId) {
        activeRoomMessages.push(message);
        await AppStorage.cacheMessages(connection.roomId, activeRoomMessages);
      }

      if (!isMe) {
        playTone(false);

        // Native notification when sidebar/side-panel is unfocused or minimized
        const isUnfocused = !document.hasFocus() || document.hidden;
        if (isUnfocused && settings.notificationsEnabled) {
          let backgroundHandled = false;
          try {
            if (BrowserAPI.runtime && BrowserAPI.runtime.sendMessage) {
              BrowserAPI.runtime.sendMessage({
                type: 'new-message',
                message: message,
                unfocused: true
              });
              backgroundHandled = true;
            }
          } catch (_) {}

          // Fallback to DOM Notification only if background service worker / notifications API is not handling it
          if (!backgroundHandled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              const title = message.senderName ? `${message.senderName}` : 'Zen & Brave Chat';
              let body = message.text || '';
              if (message.type === 'link' || message.link) {
                body = `🔗 ${(message.link && message.link.title) || message.url || 'Shared a link'}`;
              } else if (message.type === 'voice' || (message.media && message.media.type === 'voice')) {
                body = '🎤 Sent a voice note';
              } else if (message.type === 'image' || (message.media && message.media.type === 'image')) {
                body = `📷 Sent an image: ${(message.media && message.media.name) || ''}`;
              }
              const iconUrl = (BrowserAPI.runtime && BrowserAPI.runtime.getURL) ? BrowserAPI.runtime.getURL('ui/icons/icon-128.png') : 'icons/icon-128.png';
              const notif = new Notification(title, {
                body: body,
                icon: iconUrl,
                tag: message.id || 'zen-brave-chat'
              });
              notif.onclick = () => {
                window.focus();
                notif.close();
              };
            } catch (_) {}
          }
        }
      }

      if (message.link) {
        savedLinks = await AppStorage.saveLink(message.link);
        renderSavedLinks(savedLinks);
      }
    });

    connection.on('reaction', ({ targetMessageId, reactions }) => {
      const targetMsg = activeRoomMessages.find(m => m.id === targetMessageId);
      if (targetMsg) {
        targetMsg.reactions = reactions;
        if (connection.roomId) {
          AppStorage.cacheMessages(connection.roomId, activeRoomMessages);
        }
      }
      const box = document.getElementById(`reactions-${targetMessageId}`);
      if (box) {
        renderReactionPills(box, targetMessageId, reactions);
      }
    });

    // Auto-connect to server and reconnect to last room if present
    connection.connectServer().then(() => {
      if (settings.lastRoomId) {
        connection.joinRoom(settings.lastRoomId);
      }
    }).catch(() => {
      // Server not reachable yet; user can retry or adjust in Settings
    });
  }

  // Real-time active tab tracking for sidebar panels
  if (BrowserAPI.tabs && BrowserAPI.tabs.onActivated) {
    BrowserAPI.tabs.onActivated.addListener(() => {
      refreshActiveTab();
    });
  }
  if (BrowserAPI.tabs && BrowserAPI.tabs.onUpdated) {
    BrowserAPI.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === 'complete' || changeInfo.title || changeInfo.url) {
        refreshActiveTab();
      }
    });
  }

  async function refreshActiveTab() {
    try {
      currentActiveTab = await TabHelper.getActiveTab();
      if (currentActiveTab) {
        activeTabTitle.textContent = currentActiveTab.title;
        if (currentActiveTab.favIconUrl) {
          activeTabFavicon.src = currentActiveTab.favIconUrl;
          activeTabFavicon.style.display = 'block';
        } else {
          activeTabFavicon.style.display = 'none';
        }
      } else {
        activeTabTitle.textContent = 'No active tab detected';
        activeTabFavicon.style.display = 'none';
      }
    } catch (e) {
      activeTabTitle.textContent = 'Active tab unavailable';
    }
  }

  function scrollChatToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function renderMessage(msg, isMe) {
    if (!msg) return;
    const msgId = msg.id || `temp-${Math.random().toString(36).substring(2, 9)}`;
    if (renderedMessageIds.has(msgId)) return;
    renderedMessageIds.add(msgId);

    // Remove intro notice once messages start appearing
    const intro = chatMessages.querySelector('.intro-notice');
    if (intro) intro.remove();

    const row = document.createElement('div');
    row.id = `msg-${msgId}`;
    row.className = `message-row ${isMe ? 'me' : 'peer'}`;

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const timeStr = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sender = isMe ? 'You' : escapeHtml(msg.senderName || 'Friend');
    const browserTag = (!isMe && msg.browser && msg.browser !== 'Unknown' && msg.browser !== 'null') ? ` <span class="peer-browser-tag">${escapeHtml(msg.browser)}</span>` : '';
    meta.innerHTML = `<span class="sender-name ${isMe ? 'me' : 'peer'}">${sender}</span>${browserTag} • <span class="message-time">${escapeHtml(timeStr)}</span>`;
    row.appendChild(meta);

    // Render Quoted Reply if message is replying to another message
    if (msg.replyTo) {
      const quoteCard = document.createElement('div');
      quoteCard.className = 'quoted-reply-card';
      quoteCard.title = 'Click to jump to quoted message';
      quoteCard.innerHTML = `
        <div class="quoted-bar"></div>
        <div class="quoted-body">
          <span class="quoted-sender">${escapeHtml(msg.replyTo.senderName || 'Friend')}</span>
          <span class="quoted-text">${escapeHtml(msg.replyTo.text || '')}</span>
        </div>
      `;
      quoteCard.onclick = (e) => {
        e.stopPropagation();
        const targetEl = document.getElementById(`msg-${msg.replyTo.id}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetEl.classList.remove('highlight-flash');
          void targetEl.offsetWidth; // Force CSS animation restart
          targetEl.classList.add('highlight-flash');
        } else {
          showToast('Quoted message is not in current view');
        }
      };
      row.appendChild(quoteCard);
    }

    if (msg.type === 'link' || msg.link) {
      const linkData = msg.link || msg;
      const card = createLinkCardElement(linkData);
      row.appendChild(card);
    } else if (msg.type === 'voice' || (msg.media && msg.media.type === 'voice')) {
      const voiceData = msg.media || msg;
      const voiceEl = createVoiceElement(voiceData);
      row.appendChild(voiceEl);
    } else if (msg.type === 'media' || msg.media) {
      const mediaData = msg.media;
      if (mediaData.type === 'image') {
        const img = document.createElement('img');
        img.className = 'media-image-preview';
        img.src = sanitizeUrl(mediaData.data);
        img.alt = escapeHtml(mediaData.name || 'image');
        img.onclick = () => mediaHandler.openLightbox(mediaData.data, mediaData.name);
        row.appendChild(img);
      } else {
        const fileCard = document.createElement('div');
        fileCard.className = 'file-attachment-card';

        const fileIcon = document.createElement('div');
        fileIcon.className = 'file-icon';
        fileIcon.textContent = '📄';

        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        const fileName = document.createElement('span');
        fileName.className = 'file-name';
        fileName.textContent = mediaData.name || 'attachment';
        const fileSize = document.createElement('span');
        fileSize.className = 'file-size';
        fileSize.textContent = mediaData.formattedSize || '';
        fileInfo.appendChild(fileName);
        fileInfo.appendChild(fileSize);

        const dlLink = document.createElement('a');
        dlLink.className = 'btn btn-sm btn-outline';
        dlLink.href = sanitizeUrl(mediaData.data);
        dlLink.download = mediaData.name || 'download';
        dlLink.textContent = 'Download';

        fileCard.appendChild(fileIcon);
        fileCard.appendChild(fileInfo);
        fileCard.appendChild(dlLink);
        row.appendChild(fileCard);
      }
    } else {
      const bubble = document.createElement('div');
      bubble.className = 'message-bubble';
      bubble.innerHTML = formatTextWithLinks(msg.text || '');
      row.appendChild(bubble);
    }

    // Message Actions Toolbar (Reply & Quick Reactions)
    const actionsBar = document.createElement('div');
    actionsBar.className = 'message-actions-bar';

    const quickReactionEmojis = ['👍', '❤️', '😂', '🔥', '😮', '😢'];
    for (const em of quickReactionEmojis) {
      const emBtn = document.createElement('button');
      emBtn.type = 'button';
      emBtn.className = 'message-action-btn';
      emBtn.textContent = em;
      emBtn.title = `React with ${em}`;
      emBtn.onclick = (e) => {
        e.stopPropagation();
        if (connection && connection.roomId) {
          connection.sendReaction(msgId, em);
          toggleLocalReaction(msgId, em);
        } else {
          showToast('Join a room first');
        }
      };
      actionsBar.appendChild(emBtn);
    }

    const replyActionBtn = document.createElement('button');
    replyActionBtn.type = 'button';
    replyActionBtn.className = 'message-action-btn btn-reply-action';
    replyActionBtn.title = 'Reply to this message';
    replyActionBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 17 4 12 9 7"></polyline>
        <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
      </svg>
    `;
    replyActionBtn.onclick = (e) => {
      e.stopPropagation();
      setReplyTarget(msg);
    };
    actionsBar.appendChild(replyActionBtn);
    row.appendChild(actionsBar);

    // Message Reactions container
    const reactionsBox = document.createElement('div');
    reactionsBox.id = `reactions-${msgId}`;
    reactionsBox.className = 'reactions-container';
    renderReactionPills(reactionsBox, msgId, msg.reactions);
    row.appendChild(reactionsBox);

    chatMessages.appendChild(row);
  }

  function formatTextWithLinks(text) {
    const escaped = escapeHtml(text || '');
    const urlPattern = /(https?:\/\/[^\s&<>"']+)/g;
    return escaped.replace(urlPattern, (url) => {
      const safe = sanitizeUrl(url);
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">${url}</a>`;
    });
  }

  function createLinkCardElement(link) {
    const card = document.createElement('div');
    card.className = 'link-card';

    const header = document.createElement('div');
    header.className = 'link-card-header';

    const fav = document.createElement('img');
    fav.className = 'link-card-favicon';
    if (link.favIconUrl) {
      fav.src = sanitizeUrl(link.favIconUrl);
      fav.onerror = () => { fav.style.display = 'none'; };
    } else {
      fav.style.display = 'none';
    }

    const domain = document.createElement('span');
    domain.className = 'link-card-domain';
    domain.textContent = link.domain || 'link';

    header.appendChild(fav);
    header.appendChild(domain);

    const title = document.createElement('div');
    title.className = 'link-card-title';
    title.textContent = link.title || link.url || 'Shared Link';

    const urlEl = document.createElement('div');
    urlEl.className = 'link-card-url';
    urlEl.textContent = link.url || '';

    const actions = document.createElement('div');
    actions.className = 'link-card-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-sm btn-outline copy-link-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(link.url);
      showToast('Link copied to clipboard');
    };

    const openBtn = document.createElement('button');
    openBtn.className = 'btn btn-sm btn-primary open-link-btn';
    openBtn.textContent = 'Open Tab';
    openBtn.onclick = (e) => {
      e.stopPropagation();
      if (link.url && !link.url.startsWith('javascript:')) {
        BrowserAPI.tabs.create({ url: link.url });
      }
    };

    actions.appendChild(copyBtn);
    actions.appendChild(openBtn);

    card.appendChild(header);
    card.appendChild(title);
    card.appendChild(urlEl);
    card.appendChild(actions);

    card.onclick = () => {
      if (link.url && !link.url.startsWith('javascript:')) {
        BrowserAPI.tabs.create({ url: link.url });
      }
    };

    return card;
  }

  function createVoiceElement(voiceData) {
    const card = document.createElement('div');
    card.className = 'file-attachment-card voice-note-card';

    const audio = new Audio(sanitizeUrl(voiceData.data));
    let isPlaying = false;

    const playBtn = document.createElement('button');
    playBtn.className = 'voice-play-btn';
    playBtn.title = 'Play Voice Note';
    playBtn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;

    const info = document.createElement('div');
    info.className = 'file-info';
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = `Voice Note (${voiceData.duration || 1}s)`;
    const wave = document.createElement('span');
    wave.className = 'voice-wave';
    wave.textContent = voiceData.formattedSize || '';
    info.appendChild(name);
    info.appendChild(wave);

    playBtn.onclick = () => {
      if (isPlaying) {
        audio.pause();
        audio.currentTime = 0;
        isPlaying = false;
        playBtn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      } else {
        if (currentAudio && currentAudio !== audio) {
          try { currentAudio.pause(); } catch (_) {}
        }
        currentAudio = audio;
        audio.play().catch(() => {});
        isPlaying = true;
        playBtn.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
      }
    };

    audio.onended = () => {
      isPlaying = false;
      playBtn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    };

    card.appendChild(playBtn);
    card.appendChild(info);
    return card;
  }

  function updatePeersList(peers) {
    peersList.innerHTML = `
      <div class="peer-item me">
        <div class="peer-avatar">You</div>
        <div class="peer-meta">
          <span class="peer-name">${escapeHtml(settings.userName)}</span>
          <span class="peer-tag">${escapeHtml(BrowserAPI.detectBrowserName())}</span>
        </div>
      </div>
    `;

    if (peers && peers.length > 0) {
      for (const p of peers) {
        addPeerToUI(p);
      }
    }
  }

  function addPeerToUI(peer) {
    const safeId = String(peer.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const existing = document.getElementById(`peer-${safeId}`);
    if (existing) return;

    const item = document.createElement('div');
    item.id = `peer-${safeId}`;
    item.className = 'peer-item';

    const avatar = document.createElement('div');
    avatar.className = 'peer-avatar';
    avatar.textContent = (peer.name || 'F').charAt(0).toUpperCase();

    const meta = document.createElement('div');
    meta.className = 'peer-meta';

    const pName = document.createElement('span');
    pName.className = 'peer-name';
    pName.textContent = peer.name || 'Friend';

    const pTag = document.createElement('span');
    pTag.className = 'peer-tag';
    pTag.textContent = peer.browser || 'Browser';

    meta.appendChild(pName);
    meta.appendChild(pTag);

    item.appendChild(avatar);
    item.appendChild(meta);
    peersList.appendChild(item);
  }

  function removePeerFromUI(peerId) {
    const safeId = String(peerId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const el = document.getElementById(`peer-${safeId}`);
    if (el) el.remove();
  }

  async function renderRecentRooms() {
    const list = await AppStorage.getRecentRooms();
    recentRoomsContainer.innerHTML = '';
    if (!list || list.length === 0) {
      recentRoomsContainer.innerHTML = '<span class="muted-text">No recent rooms</span>';
      return;
    }

    for (const code of list) {
      const chip = document.createElement('div');
      chip.className = 'room-chip';
      chip.textContent = code;
      chip.onclick = () => {
        connection.joinRoom(code, settings.userName);
        switchTab('tab-chat');
      };
      recentRoomsContainer.appendChild(chip);
    }
  }

  function renderSavedLinks(links, filterQuery = '') {
    linksCountBadge.textContent = links.length;
    linksList.innerHTML = '';

    const q = (filterQuery || '').toLowerCase();
    const filtered = q
      ? links.filter(l => (l.title || '').toLowerCase().includes(q) ||
                          (l.url || '').toLowerCase().includes(q) ||
                          (l.domain || '').toLowerCase().includes(q))
      : links;

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <div class="empty-icon">🔗</div>
        <div class="empty-title">${escapeHtml(q ? 'No Matching Links' : 'No Links Saved Yet')}</div>
        <div class="empty-desc">${escapeHtml(q ? 'Try another search query.' : 'Shared links from your chats will automatically be cataloged here.')}</div>
      `;
      linksList.appendChild(empty);
      return;
    }

    for (const link of filtered) {
      const item = document.createElement('div');
      item.className = 'link-card';

      const header = document.createElement('div');
      header.className = 'link-card-header';

      const fav = document.createElement('img');
      fav.className = 'link-card-favicon';
      if (link.favIconUrl) {
        fav.src = sanitizeUrl(link.favIconUrl);
        fav.onerror = () => { fav.style.display = 'none'; };
      } else {
        fav.style.display = 'none';
      }

      const domain = document.createElement('span');
      domain.className = 'link-card-domain';
      domain.textContent = link.domain || 'web';

      header.appendChild(fav);
      header.appendChild(domain);

      const title = document.createElement('div');
      title.className = 'link-card-title';
      title.textContent = link.title || link.url || 'Shared Link';

      const urlEl = document.createElement('div');
      urlEl.className = 'link-card-url';
      urlEl.textContent = link.url || '';

      const actions = document.createElement('div');
      actions.className = 'link-card-actions';

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-outline delete-link-btn';
      delBtn.textContent = 'Delete';
      delBtn.title = 'Remove link';
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        savedLinks = await AppStorage.removeSavedLink(link.url);
        renderSavedLinks(savedLinks, linksSearchInput.value);
        showToast('Link removed');
      };

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-sm btn-outline copy-link-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(link.url);
        showToast('Link copied');
      };

      const openBtn = document.createElement('button');
      openBtn.className = 'btn btn-sm btn-primary open-link-btn';
      openBtn.textContent = 'Open Tab';
      openBtn.onclick = (e) => {
        e.stopPropagation();
        if (link.url && !link.url.startsWith('javascript:')) {
          BrowserAPI.tabs.create({ url: link.url });
        }
      };

      actions.appendChild(delBtn);
      actions.appendChild(copyBtn);
      actions.appendChild(openBtn);

      item.appendChild(header);
      item.appendChild(title);
      item.appendChild(urlEl);
      item.appendChild(actions);

      item.onclick = () => {
        if (link.url && !link.url.startsWith('javascript:')) {
          BrowserAPI.tabs.create({ url: link.url });
        }
      };

      linksList.appendChild(item);
    }
  }

  function switchTab(targetTabId) {
    navTabs.forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === targetTabId);
    });
    tabPanes.forEach(p => {
      p.classList.toggle('active', p.id === targetTabId);
    });
  }

  // --- Event Listeners ---

  // Nav Tab clicks
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.getAttribute('data-tab'));
    });
  });

  // Header room badge click: copy code
  headerRoomBadge.onclick = () => {
    if (connection && connection.roomId) {
      navigator.clipboard.writeText(connection.roomId);
      showToast(`Room Code ${connection.roomId} copied!`);
    }
  };

  // Quick Share Tab (Header and Banner)
  async function shareActiveTab() {
    await refreshActiveTab();
    if (!currentActiveTab || !currentActiveTab.url) {
      showToast('No active tab to share');
      return;
    }

    if (!connection.roomId) {
      showToast('Please join or create a room first!');
      switchTab('tab-connect');
      return;
    }

    const card = TabHelper.createLinkCard(currentActiveTab, {
      id: connection.peerId,
      name: settings.userName,
      browser: BrowserAPI.detectBrowserName()
    });

    try {
      connection.sendMessage(card);
      renderMessage(card, true);
      playTone(true);
      scrollChatToBottom();
      savedLinks = await AppStorage.saveLink(card);
      renderSavedLinks(savedLinks);
      showToast('Tab link shared to room!');
      switchTab('tab-chat');
    } catch (err) {
      showToast(`Failed to share: ${err.message}`);
    }
  }

  quickShareTabBtn.onclick = shareActiveTab;
  bannerShareBtn.onclick = shareActiveTab;

  // Send Text Message
  function handleSendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    if (!connection.roomId) {
      showToast('Join or create a room first!');
      switchTab('tab-connect');
      return;
    }

    const replyPayload = currentReplyTarget ? { ...currentReplyTarget } : null;

    // Check if message is a bare URL
    if (/^https?:\/\/[^\s]+$/.test(text)) {
      try {
        const parsed = new URL(text);
        const card = {
          type: 'link',
          url: text,
          title: parsed.hostname,
          domain: parsed.hostname,
          favIconUrl: `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`,
          senderId: connection.peerId,
          senderName: settings.userName,
          browser: BrowserAPI.detectBrowserName(),
          timestamp: Date.now(),
          replyTo: replyPayload
        };
        connection.sendMessage(card);
        renderMessage(card, true);
        savedLinks.unshift(card);
        AppStorage.saveLink(card);
        renderSavedLinks(savedLinks);
      } catch (e) {
        connection.sendMessage({ type: 'text', text, replyTo: replyPayload });
        renderMessage({ type: 'text', text, senderId: connection.peerId, timestamp: Date.now(), replyTo: replyPayload }, true);
      }
    } else {
      const msg = {
        type: 'text',
        text: text,
        senderId: connection.peerId,
        senderName: settings.userName,
        browser: BrowserAPI.detectBrowserName(),
        timestamp: Date.now(),
        replyTo: replyPayload
      };
      connection.sendMessage(msg);
      renderMessage(msg, true);
    }

    clearReplyTarget();
    playTone(true);
    chatInput.value = '';
    chatInput.style.height = 'auto';
    scrollChatToBottom();
  }

  sendBtn.onclick = handleSendMessage;

  // Quick emoji reply bar buttons
  if (quickEmojiReplyBtns) {
    quickEmojiReplyBtns.forEach(btn => {
      btn.onclick = () => {
        const emoji = btn.getAttribute('data-emoji');
        if (!emoji) return;

        if (!connection.roomId) {
          showToast('Join or create a room first!');
          switchTab('tab-connect');
          return;
        }

        const msg = {
          type: 'text',
          text: emoji,
          replyTo: currentReplyTarget ? { ...currentReplyTarget } : null,
          senderId: connection.peerId,
          senderName: settings.userName,
          browser: BrowserAPI.detectBrowserName(),
          timestamp: Date.now()
        };

        connection.sendMessage(msg);
        renderMessage(msg, true);
        if (connection.roomId) {
          activeRoomMessages.push(msg);
          AppStorage.cacheMessages(connection.roomId, activeRoomMessages);
        }
        playTone(true);
        clearReplyTarget();
        scrollChatToBottom();
      };
    });
  }

  // Emoji picker popover controls
  if (emojiPickerBtn && emojiPalettePopover) {
    emojiPickerBtn.onclick = (e) => {
      e.stopPropagation();
      emojiPalettePopover.classList.toggle('hidden');
    };
  }

  if (closeEmojiPaletteBtn && emojiPalettePopover) {
    closeEmojiPaletteBtn.onclick = () => {
      emojiPalettePopover.classList.add('hidden');
    };
  }

  document.addEventListener('click', (e) => {
    if (emojiPalettePopover && !emojiPalettePopover.classList.contains('hidden')) {
      if (!emojiPalettePopover.contains(e.target) && e.target !== emojiPickerBtn && !emojiPickerBtn.contains(e.target)) {
        emojiPalettePopover.classList.add('hidden');
      }
    }
  });

  if (emojiPaletteBtns) {
    emojiPaletteBtns.forEach(btn => {
      btn.onclick = () => {
        const emojiChar = btn.textContent.trim();
        insertTextAtCursor(chatInput, emojiChar);
        if (emojiPalettePopover) emojiPalettePopover.classList.add('hidden');
        chatInput.focus();
      };
    });
  }

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // File Attachments
  attachFileBtn.onclick = () => filePickerInput.click();

  filePickerInput.onchange = async () => {
    const file = filePickerInput.files[0];
    if (!file) return;

    const MAX_SIZE = 15 * 1024 * 1024; // 15MB limit
    if (file.size > MAX_SIZE) {
      showToast('File exceeds 15MB limit');
      filePickerInput.value = '';
      return;
    }

    if (!connection.roomId) {
      showToast('Join a room before sending files');
      switchTab('tab-connect');
      return;
    }

    try {
      showToast(`Preparing ${file.name}...`);
      const media = await mediaHandler.processFile(file);
      const payload = {
        type: 'media',
        media: media,
        senderId: connection.peerId,
        senderName: settings.userName,
        browser: BrowserAPI.detectBrowserName(),
        timestamp: Date.now()
      };

      connection.sendMessage(payload);
      renderMessage(payload, true);
      playTone(true);
      scrollChatToBottom();
      showToast('File sent!');
    } catch (err) {
      showToast(`File error: ${err.message}`);
    } finally {
      filePickerInput.value = '';
    }
  };

  // Voice Notes
  micVoiceBtn.onclick = async () => {
    if (!connection.roomId) {
      showToast('Join a room before recording');
      switchTab('tab-connect');
      return;
    }

    try {
      voiceRecordBar.classList.remove('hidden');
      recordingTimer.textContent = '00:00';
      await mediaHandler.startVoiceRecording((timerFormatted) => {
        recordingTimer.textContent = timerFormatted;
      });
    } catch (err) {
      voiceRecordBar.classList.add('hidden');
      showToast(`Microphone error: ${err.message}`);
    }
  };

  cancelVoiceBtn.onclick = () => {
    mediaHandler.cancelVoiceRecording();
    voiceRecordBar.classList.add('hidden');
    showToast('Recording cancelled');
  };

  sendVoiceBtn.onclick = async () => {
    try {
      const voiceData = await mediaHandler.stopVoiceRecording();
      voiceRecordBar.classList.add('hidden');

      const payload = {
        type: 'voice',
        media: voiceData,
        senderId: connection.peerId,
        senderName: settings.userName,
        browser: BrowserAPI.detectBrowserName(),
        timestamp: Date.now()
      };

      connection.sendMessage(payload);
      renderMessage(payload, true);
      playTone(true);
      scrollChatToBottom();
      showToast('Voice note sent!');
    } catch (err) {
      voiceRecordBar.classList.add('hidden');
      showToast(`Recording failed: ${err.message}`);
    }
  };

  // Links Hub Search & Clear
  linksSearchInput.addEventListener('input', (e) => {
    renderSavedLinks(savedLinks, e.target.value.trim());
  });

  clearAllLinksBtn.onclick = async () => {
    if (confirm('Clear all saved links?')) {
      savedLinks = await AppStorage.clearAllSavedLinks();
      renderSavedLinks(savedLinks);
      showToast('Saved links cleared');
    }
  };

  // Connect Tab Actions
  createRoomBtn.onclick = () => {
    connection.createRoom(settings.userName);
    switchTab('tab-chat');
  };

  joinRoomBtn.onclick = () => {
    const code = joinRoomInput.value.trim().toUpperCase();
    if (!code) {
      showToast('Enter a room code');
      return;
    }
    connection.joinRoom(code, settings.userName);
    joinRoomInput.value = '';
    switchTab('tab-chat');
  };

  joinRoomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      joinRoomBtn.click();
    }
  });

  copyRoomCodeBtn.onclick = () => {
    if (connection && connection.roomId) {
      navigator.clipboard.writeText(connection.roomId);
      showToast(`Room code ${connection.roomId} copied`);
    }
  };

  leaveRoomBtn.onclick = () => {
    if (connection) {
      connection.leaveRoom();
      showToast('Left room');
      chatMessages.innerHTML = `
        <div class="system-notice intro-notice">
          <div class="notice-icon">💬</div>
          <div class="notice-title">Room Disconnected</div>
          <div class="notice-desc">Join or create a new room to resume sharing.</div>
        </div>
      `;
    }
  };

  // Settings Actions
  saveSettingsBtn.onclick = async () => {
    const newName = settingUsername.value.trim() || settings.userName;
    const newServer = settingServerUrl.value.trim() || settings.serverUrl;
    const newTheme = settingTheme.value;
    const newSound = settingSound.checked;
    const newNotifications = settingNotifications.checked;

    settings = {
      ...settings,
      userName: newName,
      serverUrl: newServer,
      theme: newTheme,
      soundEnabled: newSound,
      notificationsEnabled: newNotifications
    };

    await AppStorage.saveSettings(settings);
    applyTheme(newTheme);
    myPeerName.textContent = newName;
    if (quickUsernameInput) quickUsernameInput.value = newName;
    const mePeerNameEl = peersList.querySelector('.peer-item.me .peer-name');
    if (mePeerNameEl) mePeerNameEl.textContent = newName;

    if (connection) {
      connection.userName = newName;
      connection.updateUserName(newName);
      if (connection.serverUrl !== newServer) {
        connection.serverUrl = newServer;
        connection.connectServer(newServer);
      }
    }

    showToast('Settings saved successfully');
  };

  testServerBtn.onclick = async () => {
    const urlStr = settingServerUrl.value.trim();
    serverTestResult.textContent = 'Testing connection...';
    try {
      const httpUrl = urlStr.replace(/^ws/, 'http');
      const res = await fetch(`${httpUrl}/health`, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        serverTestResult.textContent = `Online! Active rooms: ${data.activeRooms || 0}`;
        serverTestResult.style.color = 'var(--success-color)';
      } else {
        serverTestResult.textContent = `Server replied with status ${res.status}`;
        serverTestResult.style.color = 'var(--danger-color)';
      }
    } catch (e) {
      serverTestResult.textContent = 'Failed to connect to relay server';
      serverTestResult.style.color = 'var(--danger-color)';
    }
  };

  clearCacheBtn.onclick = async () => {
    await BrowserAPI.storage.local.remove(['messageCache']);
    showToast('Chat cache wiped');
  };
});
