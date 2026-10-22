const assert = require('assert');
const BrowserAPI = require('../src/core/browser-api');
const TabHelper = require('../src/core/tab-helper');
const AppStorage = require('../src/core/storage');

async function runStorageTests() {
  console.log('\n🧪 Running Storage & Tab Helper Unit Tests...\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`  • ${name}... `);
    const start = Date.now();
    try {
      await fn();
      const ms = Date.now() - start;
      console.log(`\x1b[32mPASSED\x1b[0m (${ms}ms)`);
      passed++;
    } catch (err) {
      console.log(`\x1b[31mFAILED\x1b[0m`);
      console.error(err);
      failed++;
    }
  }

  // 1. TabHelper formatTabInfo
  await test('TabHelper correctly parses standard web URLs', async () => {
    const tab = {
      id: 101,
      url: 'https://zen-browser.app/download',
      title: 'Download Zen Browser',
      favIconUrl: 'https://zen-browser.app/favicon.ico'
    };
    const formatted = TabHelper.formatTabInfo(tab);
    assert.strictEqual(formatted.domain, 'zen-browser.app');
    assert.strictEqual(formatted.title, 'Download Zen Browser');
    assert.strictEqual(formatted.isSpecial, false);
    assert.strictEqual(formatted.favIconUrl, 'https://zen-browser.app/favicon.ico');
  });

  await test('TabHelper handles special browser internal URLs', async () => {
    const tab = {
      id: 102,
      url: 'about:debugging#/runtime/this-firefox',
      title: 'Debugging'
    };
    const formatted = TabHelper.formatTabInfo(tab);
    assert.strictEqual(formatted.isSpecial, true);
    assert.strictEqual(formatted.domain, 'about');
  });

  // 2. TabHelper createLinkCard
  await test('TabHelper creates valid link card payload', async () => {
    const tabInfo = {
      url: 'https://brave.com/compare',
      title: 'Brave vs Chrome',
      domain: 'brave.com',
      favIconUrl: 'https://brave.com/favicon.png'
    };
    const card = TabHelper.createLinkCard(tabInfo, { id: 'peer-1', name: 'Alice', browser: 'Zen' });
    assert.strictEqual(card.type, 'link');
    assert.strictEqual(card.url, 'https://brave.com/compare');
    assert.strictEqual(card.senderId, 'peer-1');
    assert.strictEqual(card.senderName, 'Alice');
    assert.strictEqual(card.browser, 'Zen');
    assert.ok(card.timestamp > 0);
  });

  // 3. AppStorage Saved Links & Deduplication
  await test('AppStorage saves, deduplicates, and removes links', async () => {
    await AppStorage.clearAllSavedLinks();

    const link1 = { url: 'https://example.com/1', title: 'Example 1', domain: 'example.com' };
    const link2 = { url: 'https://example.com/2', title: 'Example 2', domain: 'example.com' };

    await AppStorage.saveLink(link1);
    await AppStorage.saveLink(link2);
    // Duplicate URL with updated title
    await AppStorage.saveLink({ url: 'https://example.com/1', title: 'Example 1 Updated', domain: 'example.com' });

    let links = await AppStorage.getSavedLinks();
    assert.strictEqual(links.length, 2, 'Should deduplicate link1');
    assert.strictEqual(links[0].title, 'Example 1 Updated', 'Latest updated link should be first');

    links = await AppStorage.removeSavedLink('https://example.com/2');
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].url, 'https://example.com/1');

    await AppStorage.clearAllSavedLinks();
    links = await AppStorage.getSavedLinks();
    assert.strictEqual(links.length, 0);
  });

  // 4. AppStorage Recent Rooms
  await test('AppStorage tracks recent rooms without duplicates', async () => {
    await AppStorage.addRecentRoom('ZEN-1111');
    await AppStorage.addRecentRoom('ZEN-2222');
    await AppStorage.addRecentRoom('ZEN-1111');

    const recent = await AppStorage.getRecentRooms();
    assert.strictEqual(recent[0], 'ZEN-1111');
    assert.strictEqual(recent[1], 'ZEN-2222');
    assert.strictEqual(recent.length, 2);
  });

  // 5. AppStorage Message Cache
  await test('AppStorage caches and retrieves messages with deduplication', async () => {
    const msgs = [
      { id: 'msg-1', text: 'Hello' },
      { id: 'msg-2', text: 'World' },
      { id: 'msg-1', text: 'Duplicate Hello' }
    ];
    await AppStorage.cacheMessages('ZEN-ROOM-A', msgs);
    const cached = await AppStorage.getCachedMessages('ZEN-ROOM-A');
    assert.strictEqual(cached.length, 2, 'Expected 2 deduped messages');
    assert.strictEqual(cached[0].id, 'msg-1');
    assert.strictEqual(cached[1].id, 'msg-2');
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  runStorageTests();
}

module.exports = {
  runStorageTests
};
