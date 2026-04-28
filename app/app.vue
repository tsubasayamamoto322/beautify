<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import LoginView from './login.vue';
import TutorialView from './tutorial.vue';
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { uploadData } from "aws-amplify/storage";
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import type { Schema } from "../amplify/data/resource";
import outputs from "../amplify_outputs.json";

Amplify.configure(outputs);
const client = generateClient<Schema>();

// ── 定数 ─────────────────────────────────────────────────────────
const LOW_STOCK_THRESHOLD = 0.20;
const isSignedIn = ref(false);
const deviceToken = ref<string>('');
const showTutorial = ref(false);
const showDrawer = ref(false);
const showNotifyModal = ref(false);
const showAccountModal = ref(false);
const notifyDaysBefore = ref(10);
const notifyEnabled = ref(false);

// メール変更
const newEmail = ref('');
const newPassword = ref('');
const accountMsg = ref('');
const isUpdatingAccount = ref(false);

async function changeEmail() {
  isUpdatingAccount.value = true;
  accountMsg.value = '';
  try {
    const { updateUserAttribute } = await import('aws-amplify/auth');
    await updateUserAttribute({ userAttribute: { attributeKey: 'email', value: newEmail.value } });
    accountMsg.value = '✅ 確認メールを送信しました';
    newEmail.value = '';
  } catch (e: any) {
    accountMsg.value = '❌ ' + (e.message ?? '変更に失敗しました');
  } finally { isUpdatingAccount.value = false; }
}

async function changePassword() {
  isUpdatingAccount.value = true;
  accountMsg.value = '';
  try {
    const { updatePassword } = await import('aws-amplify/auth');
    await updatePassword({ oldPassword: '', newPassword: newPassword.value });
    accountMsg.value = '✅ パスワードを変更しました';
    newPassword.value = '';
  } catch (e: any) {
    accountMsg.value = '❌ ' + (e.message ?? '変更に失敗しました');
  } finally { isUpdatingAccount.value = false; }
}
const headerHeight = ref(0);
const showAddModal = ref(false);
const viewMode = ref<'grid' | 'swipe'>('grid');
const showFilterModal = ref(false);
const filterMode = ref<'all' | 'active'>('all');
const sortMode = ref<'default' | 'low_stock' | 'name' | 'remaining'>('default');

const filteredCosmetics = computed(() => {
  let items = [...cosmetics.value];
  // フィルター
  if (filterMode.value === 'active') {
    items = items.filter(i => i.currentAmount > 0);
  }
  // ソート
  if (sortMode.value === 'low_stock') {
    items.sort((a, b) => (a.currentAmount / a.totalCapacity) - (b.currentAmount / b.totalCapacity));
  } else if (sortMode.value === 'name') {
    items.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  } else if (sortMode.value === 'remaining') {
    items.sort((a, b) => (b.currentAmount / b.totalCapacity) - (a.currentAmount / a.totalCapacity));
  }
  return items;
});
const swipeIndex = ref(0);
const swipeTouchStartX = ref(0);
const showItemMenu = ref(false);
const selectedItem = ref<any>(null);

function openItemMenu(item: any) {
  selectedItem.value = item;
  showItemMenu.value = true;
}
const toastMessage = ref('');
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(msg: string) {
  toastMessage.value = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastMessage.value = ''; }, 3000);
}

function openAddModal() { showAddModal.value = true; }
function closeAddModal(registered = false) {
  showAddModal.value = false;
  previewUrl.value = '';
  name.value = '';
  totalCapacity.value = '';
  usagePerApp.value = '';
  timesPerDay.value = '1';
  if (registered) showToast('✅ コスメを登録しました！');
}

// 初回起動チェック
function checkFirstLaunch() {
  const seen = localStorage.getItem('beautify_tutorial_seen');
  if (!seen) showTutorial.value = true;
}
function closeTutorial() {
  localStorage.setItem('beautify_tutorial_seen', '1');
  showTutorial.value = false;
}

async function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;
  
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return;

  await PushNotifications.register();

  PushNotifications.addListener('registration', async (token) => {
    console.log('[APNs] デバイストークン:', token.value);
    deviceToken.value = token.value;
    // DynamoDBに保存（既存があれば上書き）
    try {
      // 既存のトークンを検索
      const existing = await client.models.PushSubscription.list();
      const myToken = existing.data?.find((s: any) => s.endpoint === token.value);
      if (!myToken) {
        const result = await client.models.PushSubscription.create({
          endpoint: token.value,
        });
        console.log('[APNs] トークン保存成功:', result);
      } else {
        console.log('[APNs] トークン既存のためスキップ');
      }
    } catch (e) {
      console.error('[APNs] トークン保存失敗:', e);
    }
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('[APNs] 登録エラー:', err);
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[APNs] 通知受信:', notification);
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('[APNs] 通知タップ:', action);
  });
}

async function handleSignedIn() {
  isSignedIn.value = true;
  checkFirstLaunch();
  await initPushNotifications();
  await listCosmetics();
  await loadSettings();
}

async function handleSignOut() {
  const { signOut } = await import('aws-amplify/auth');
  await signOut();
  isSignedIn.value = false;
}
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

// 選択可能な通知時刻リスト（6:00〜23:00）
const NOTIFY_HOURS = Array.from({ length: 18 }, (_, i) => {
  const h = i + 6;
  return { label: `${h}:00`, value: h };
});

// ── 状態変数 ──────────────────────────────────────────────────────
const name             = ref('');
const totalCapacity    = ref('');
const usagePerApp      = ref('');
const timesPerDay      = ref('2');
const imageFile        = ref<File | null>(null);
const previewUrl       = ref<string | null>(null);
const cosmetics        = ref<Array<Schema['Cosmetic']['type']>>([]);
const isAnalyzing      = ref(false);
const uploadedImagePath = ref('');
const updatingId       = ref<string | null>(null);

// 通知まわり
const notificationPermission = ref<NotificationPermission>('default');
const swRegistration   = ref<ServiceWorkerRegistration | null>(null);

// ユーザー設定
const notifyHour       = ref(8);          // デフォルト 8:00
const userSettingsId   = ref<string | null>(null);
const isSavingTime     = ref(false);
const savedTimeFlash   = ref(false);       // 保存成功フラッシュ

// ── 計算プロパティ ────────────────────────────────────────────────
const lowStockItems = computed(() =>
  cosmetics.value.filter(item =>
    item.currentAmount != null &&
    item.totalCapacity > 0 &&
    (item.currentAmount / item.totalCapacity) <= LOW_STOCK_THRESHOLD
  )
);

function progressClass(item: Schema['Cosmetic']['type']) {
  const ratio = item.currentAmount / item.totalCapacity;
  if (ratio <= 0.20) return 'danger';
  if (ratio <= 0.50) return 'warning';
  return 'good';
}

function daysRemaining(item: Schema['Cosmetic']['type']): string {
  const usage = item.usagePerApp ?? 0;
  const tpd   = item.timesPerDay ?? 2;
  if (!usage || !tpd || usage * tpd <= 0) return '—';
  const days = Math.floor(item.currentAmount / (usage * tpd));
  if (days <= 0) return 'もうすぐ終わり';
  return `あと約 ${days} 日`;
}

function percentageRemaining(item: Schema['Cosmetic']['type']): number {
  if (!item.totalCapacity) return 0;
  return Math.round((item.currentAmount / item.totalCapacity) * 100);
}

// ── Service Worker 初期化 ─────────────────────────────────────────
async function initServiceWorker() {
  // iOSはAPNs経由で通知（initPushNotificationsで処理済み）
  if (Capacitor.isNativePlatform()) {
    // デバイストークンがDynamoDBに保存済みなら通知許可済みとみなす
    try {
      const { data: subs } = await client.models.PushSubscription.list();
      if (subs && subs.length > 0) {
        notificationPermission.value = 'granted';
      } else {
        notificationPermission.value = 'default';
      }
    } catch {
      notificationPermission.value = 'default';
    }
    return;
  }
  // Web版はService Worker
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    swRegistration.value = reg;
    notificationPermission.value = Notification.permission;
  } catch (err) {
    console.error('SW登録失敗:', err);
  }
}

// ── 通知許可 & Push サブスクリプション ───────────────────────────
async function disableNotification() {
  try {
    const { data: subs } = await client.models.PushSubscription.list();
    for (const sub of subs) await client.models.PushSubscription.delete({ id: sub.id });
    if (userSettingsId.value) {
      await client.models.UserSettings.update({
        id: userSettingsId.value,
        notifyEnabled: false,
        notifyTime: `${String(notifyHour.value).padStart(2, '0')}:00`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    }
    notifyEnabled.value = false;
    notificationPermission.value = 'default';
  } catch (e) { console.error(e); }
}

async function requestNotificationPermission() {
  // iOSはAPNsで通知許可済み（initPushNotificationsで処理済み）
  if (Capacitor.isNativePlatform()) {
    notificationPermission.value = 'granted';
    await saveSettings();
    return;
  }
  // Web版
  if (!swRegistration.value) { alert('Service Workerがまだ準備中です'); return; }
  if (!VAPID_PUBLIC_KEY) { alert('.env に VITE_VAPID_PUBLIC_KEY を設定してください'); return; }
  const permission = await Notification.requestPermission();
  notificationPermission.value = permission;
  if (permission !== 'granted') { alert('通知が拒否されました'); return; }
  try {
    let sub = await swRegistration.value.pushManager.getSubscription();
    if (!sub) {
      sub = await swRegistration.value.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const p256dh = sub.getKey('p256dh')!;
    const auth   = sub.getKey('auth')!;
    const { data: existing } = await client.models.PushSubscription.list();
    for (const old of existing) await client.models.PushSubscription.delete({ id: old.id });
    await client.models.PushSubscription.create({
      endpoint:  sub.endpoint,
      p256dh:    btoa(String.fromCharCode(...new Uint8Array(p256dh))),
      auth:      btoa(String.fromCharCode(...new Uint8Array(auth))),
      userAgent: navigator.userAgent.slice(0, 200),
    });
  } catch (err) {
    console.error('Push設定失敗:', err);
  }
}

// ── ローカル通知（「使った」時の即時通知）────────────────────────
async function showLocalNotification(title: string, body: string) {
  if (!swRegistration.value || notificationPermission.value !== 'granted') return;
  await swRegistration.value.showNotification(title, {
    body,
    icon:     '/icons/icon-192.png',
    badge:    '/icons/badge-72.png',
    tag:      'beautify-alert',
    renotify: true,
    vibrate:  [200, 100, 200],
    data:     { url: '/' },
    actions:  [
      { action: 'open',    title: 'アプリを開く' },
      { action: 'dismiss', title: 'あとで' },
    ],
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  return new Uint8Array([...window.atob(base64)].map(c => c.charCodeAt(0)));
}

// ── ユーザー設定の読み込み & 保存 ────────────────────────────────
async function loadUserSettings() {
  const { data: settings } = await client.models.UserSettings.list();
  if (settings.length > 0) {
    const s = settings[0];
    userSettingsId.value = s.id;
    if (s.notifyTime) {
      notifyHour.value = parseInt(s.notifyTime.split(':')[0]) ?? 8;
    }
    notifyEnabled.value = s.notifyEnabled ?? false;
    notifyDaysBefore.value = (s as any).notifyDaysBefore ?? 10;
  }
}

async function saveSettings() {
  console.log('[saveSettings] 開始 userSettingsId:', userSettingsId.value);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const notifyTime = `${String(notifyHour.value).padStart(2, '0')}:00`;
  console.log('[saveSettings] timezone:', timezone, 'notifyTime:', notifyTime);
  try {
    if (userSettingsId.value) {
      const result = await client.models.UserSettings.update({
        id: userSettingsId.value,
        notifyEnabled: notifyEnabled.value,
        timezone,
        notifyTime,
      });
      console.log('[saveSettings] update結果:', result);
    } else {
      const { data: created, errors } = await client.models.UserSettings.create({
        notifyEnabled: notifyEnabled.value,
        timezone,
        notifyTime,
      });
      console.log('[saveSettings] create結果:', created, 'errors:', errors);
      userSettingsId.value = created?.id ?? null;
    }
  } catch (e) {
    console.error('[saveSettings] エラー:', e);
  }
}

async function saveNotifyHour() {
  isSavingTime.value = true;
  try {
    await saveSettings();
    // 保存成功フラッシュ
    savedTimeFlash.value = true;
    setTimeout(() => { savedTimeFlash.value = false; }, 2000);
  } finally {
    isSavingTime.value = false;
  }
}

// ── マウント ──────────────────────────────────────────────────────
onMounted(async () => {
  await initServiceWorker();
  await Promise.all([listCosmetics(), loadUserSettings()]);
});

// ── データ操作 ────────────────────────────────────────────────────
async function listCosmetics() {
  const { data: items } = await client.models.Cosmetic.list();
  cosmetics.value = items;
}

async function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  if (!target.files?.length) return;
  const file = target.files[0];
  imageFile.value = file;
  previewUrl.value = URL.createObjectURL(file);
  isAnalyzing.value = true;
  try {
    const filename = `${Date.now()}-${file.name}`;
    const uploadResult = await uploadData({ path: `images/${filename}`, data: file }).result;
    uploadedImagePath.value = uploadResult.path;
    const { data: aiResult, errors } = await client.queries.analyzeImage({ imageKey: uploadResult.path });
    if (errors) { console.error(errors); return; }
    if (aiResult) {
      const parsed = typeof aiResult === 'string' ? JSON.parse(aiResult) : aiResult;
      if (parsed.brand || parsed.name) name.value = `${parsed.brand ?? ''} ${parsed.name ?? ''}`.trim();
      if (parsed.totalCapacity) totalCapacity.value = String(parsed.totalCapacity);
    }
  } catch (err) {
    console.error('AI Error:', err);
    alert('AI解析に失敗しました💦');
  } finally {
    isAnalyzing.value = false;
  }
}

async function createCosmetic() {
  if (!name.value || !totalCapacity.value) { alert('商品名と容量は必須です'); return; }
  let finalImagePath = uploadedImagePath.value;
  if (!finalImagePath && imageFile.value) {
    const filename = `${Date.now()}-${imageFile.value.name}`;
    const result = await uploadData({ path: `images/${filename}`, data: imageFile.value }).result;
    finalImagePath = result.path;
  }
  await client.models.Cosmetic.create({
    name:          name.value,
    totalCapacity: parseFloat(totalCapacity.value),
    currentAmount: parseFloat(totalCapacity.value),
    usagePerApp:   parseFloat(usagePerApp.value) || 0,
    timesPerDay:   parseFloat(timesPerDay.value) || 2,
    imageUrl:      finalImagePath,
  });
  name.value = ''; totalCapacity.value = ''; usagePerApp.value = ''; timesPerDay.value = '2';
  imageFile.value = null; previewUrl.value = null; uploadedImagePath.value = '';
  showAddModal.value = false;
  showToast('✅ コスメを登録しました！');
  listCosmetics();
}

async function recordUsage(item: Schema['Cosmetic']['type']) {
  const usage = item.usagePerApp ?? 0;
  if (!usage) { alert('1回分の使用量が設定されていません'); return; }
  const newAmount = Math.max(0, item.currentAmount - usage);
  const newRatio  = newAmount / item.totalCapacity;
  updatingId.value = item.id;
  try {
    await client.models.Cosmetic.update({ id: item.id, currentAmount: newAmount });
    await listCosmetics();
    if (newRatio <= LOW_STOCK_THRESHOLD && notificationPermission.value === 'granted') {
      await showLocalNotification(
        `⚠️ ${item.name} の残量が少なくなっています`,
        `残量 ${Math.round(newRatio * 100)}%（${newAmount.toFixed(1)} 残）。そろそろ補充を！`
      );
    }
  } finally {
    updatingId.value = null;
  }
}

async function toggleAutoDeduct(item: any) {
  await client.models.Cosmetic.update({
    id: item.id,
    autoDeduct: !item.autoDeduct,
  });
  await listCosmetics();
}


async function deleteCosmetic(id: string) {
  if (!confirm('削除しますか？')) return;
  await client.models.Cosmetic.delete({ id });
  listCosmetics();
}
</script>

<template>
  <LoginView v-if="!isSignedIn" @signed-in="handleSignedIn" />
  <template v-else>
    <TutorialView v-if="showTutorial" @close="closeTutorial" />
    <div v-show="!showTutorial" class="app-container">

        <!-- ── ヘッダー ── -->
        <header class="sticky-header">
          <div class="header-content">
            <h1 class="logo">Beautify</h1>
            <div class="header-actions">
              <button class="hamburger-btn" @click="showDrawer = true">
                <span></span><span></span><span></span>
              </button>
            </div>
          </div>


        </header>

        <main class="main-content" :style="{ paddingTop: headerHeight + 'px' }">

          <!-- ── ⚠️ 残量アラームバナー ── -->
          <transition name="slide-down">
            <div v-if="lowStockItems.length" class="alert-banner">
              <div class="alert-pulse"></div>
              <span class="alert-icon">⚠️</span>
              <div class="alert-text">
                <strong>残量が少なくなっています！</strong>
                <span>{{ lowStockItems.map(i => i.name).join('、') }}</span>
              </div>
              <span class="alert-count">{{ lowStockItems.length }}</span>
            </div>
          </transition>

          <!-- ── 🕐 通知時刻設定パネル ── -->
          <div class="notify-panel" :class="{ 'notify-panel--active': notificationPermission === 'granted' }">
            <div class="notify-panel-left">
              <span class="notify-icon">🕐</span>
              <div class="notify-label">
                <span class="notify-label-main">通知時刻を設定</span>
                <span class="notify-label-sub">
                  {{ userSettingsId && notificationPermission === 'granted' ? `現在: ${String(notifyHour).padStart(2, '0')}:00` : '残量20%以下で通知' }}
                </span>
              </div>
            </div>
            <div class="notify-panel-right">
              <div class="time-picker-wrap">
                <select v-model="notifyHour" class="time-select" :disabled="notificationPermission !== 'granted'">
                  <option v-for="h in NOTIFY_HOURS" :key="h.value" :value="h.value">
                    {{ h.label }}
                  </option>
                </select>
                <button class="save-time-btn"
                  :class="{ saved: savedTimeFlash }"
                  :disabled="notificationPermission !== 'granted' || isSavingTime"
                  @click="saveNotifyHour"
                >
                  <span v-if="isSavingTime" class="mini-spinner"></span>
                  <span v-else-if="savedTimeFlash">✓ 保存済み</span>
                  <span v-else>{{ userSettingsId ? '変更' : '保存' }}</span>
                </button>
              </div>
              <span v-if="notificationPermission !== 'granted'" class="notify-disabled-hint">
                通知を有効にすると設定できます
              </span>
            </div>
          </div>

          <!-- ── 追加モーダル ── -->
          <transition name="fade">
            <div v-if="showAddModal" class="modal-overlay" @click.self="closeAddModal">
              <div class="modal-card">
                <div class="modal-header">
                  <h2>コスメを追加</h2>
                  <button class="modal-close" @click="closeAddModal">✕</button>
                </div>
                <div class="form-body">
                  <div class="upload-area">
                    <input type="file" accept="image/png, image/jpeg" capture="environment"
                      @change="onFileChange" id="file-input" class="file-input" :disabled="isAnalyzing" />
                    <label for="file-input" class="upload-label">
                      <div v-if="isAnalyzing" class="loading-overlay">
                        <div class="spinner"></div><span>AI解析中...</span>
                      </div>
                      <div v-else-if="previewUrl" class="preview-box">
                        <img :src="previewUrl" alt="Preview" />
                      </div>
                      <div v-else class="upload-placeholder">
                        <span class="plus-icon">📷</span><span>写真を撮る</span>
                      </div>
                    </label>
                  </div>
                  <div class="input-group">
                    <input v-model="name" placeholder="商品名 (自動入力)" class="stylish-input" />
                  </div>
                  <div class="input-row">
                    <div class="input-group">
                      <input v-model="totalCapacity" type="number" placeholder="容量" class="stylish-input" />
                      <span class="unit">ml/g</span>
                    </div>
                    <div class="input-group">
                      <input v-model="usagePerApp" type="number" placeholder="1回分" class="stylish-input" />
                      <span class="unit">使用</span>
                    </div>
                  </div>
                  <div class="input-group">
                    <label class="sub-label">1日に使う回数</label>
                    <div class="times-selector">
                      <button v-for="n in [1,2,3,4]" :key="n"
                        class="times-btn" :class="{ active: timesPerDay === String(n) }"
                        @click="timesPerDay = String(n)">{{ n }}回</button>
                    </div>
                  </div>
                  <button @click="createCosmetic" class="submit-btn" :disabled="isAnalyzing">登録する</button>
                </div>
              </div>
            </div>
          </transition>

          <!-- ── コレクションヘッダー ── -->
          <div class="collection-header">
            <div class="collection-header-left">
              <h3 class="section-title">My Collection</h3>
            </div>
            <div class="collection-header-right">
              <button class="filter-btn" @click="showFilterModal = true" :class="{ active: filterMode !== 'all' || sortMode !== 'default' }">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                フィルター
              </button>
              <div class="view-toggle">
                <button :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                </button>
                <button :class="{ active: viewMode === 'swipe' }" @click="viewMode = 'swipe'; swipeIndex = 0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                </button>
              </div>
            </div>
          </div>
          <div class="scrollable-collection">

          <!-- アイテムメニュー -->
        <transition name="fade">
          <div v-if="showItemMenu && selectedItem" class="modal-overlay" @click.self="showItemMenu = false">
            <div class="modal-card item-menu-card">
              <div class="modal-header">
                <h2>{{ selectedItem.name }}</h2>
                <button class="modal-close" @click="showItemMenu = false">✕</button>
              </div>
              <div class="item-menu-body">
                <!-- 自動記録トグル -->
                <div class="item-menu-row">
                  <div class="item-menu-row-left">
                    
                    <div>
                      <div class="item-menu-label">自動記録</div>
                      <div class="item-menu-sub">毎日の使用量を自動で記録</div>
                    </div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" :checked="selectedItem.autoDeduct" @change="toggleAutoDeduct(selectedItem); selectedItem.autoDeduct = !selectedItem.autoDeduct">
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <!-- 手動で使った -->
                <button class="item-menu-action" v-if="!selectedItem.autoDeduct"
                  :disabled="selectedItem.currentAmount <= 0"
                  @click="recordUsage(selectedItem); showItemMenu = false">
                  
                  <span>使った（手動）</span>
                </button>
                <div class="item-menu-divider"></div>
                <!-- 削除 -->
                <button class="item-menu-action danger" @click="deleteCosmetic(selectedItem.id); showItemMenu = false">
                  <span class="item-menu-icon"></span>
                  <span>削除する</span>
                </button>
              </div>
            </div>
          </div>
        </transition>

        <!-- フィルターモーダル -->
          <transition name="fade">
            <div v-if="showFilterModal" class="modal-overlay" @click.self="showFilterModal = false">
              <div class="modal-card filter-modal">
                <div class="modal-header">
                  <h2>絞り込み・並び替え</h2>
                  <button class="modal-close" @click="showFilterModal = false">✕</button>
                </div>
                <div class="filter-body">
                  <div class="filter-section">
                    <p class="filter-section-title">表示するアイテム</p>
                    <div class="filter-options">
                      <button class="filter-option" :class="{ active: filterMode === 'all' }" @click="filterMode = 'all'">
                        <span>すべて表示</span>
                      </button>
                      <button class="filter-option" :class="{ active: filterMode === 'active' }" @click="filterMode = 'active'">
                        <span>使用中のみ</span>
                      </button>
                    </div>
                  </div>
                  <div class="filter-section">
                    <p class="filter-section-title">並び替え</p>
                    <div class="filter-options">
                      <button class="filter-option" :class="{ active: sortMode === 'default' }" @click="sortMode = 'default'">
                        <span>登録順</span>
                      </button>
                      <button class="filter-option" :class="{ active: sortMode === 'low_stock' }" @click="sortMode = 'low_stock'">
                        <span>残り少ない順</span>
                      </button>
                      <button class="filter-option" :class="{ active: sortMode === 'remaining' }" @click="sortMode = 'remaining'">
                        <span>残り多い順</span>
                      </button>
                      <button class="filter-option" :class="{ active: sortMode === 'name' }" @click="sortMode = 'name'">
                        <span>名前順</span>
                      </button>
                    </div>
                  </div>
                  <button class="filter-reset" @click="filterMode = 'all'; sortMode = 'default'">リセット</button>
                </div>
              </div>
            </div>
          </transition>

          <div v-if="filteredCosmetics.length === 0 && cosmetics.length > 0" class="empty-state">
            <span>🔍</span><p>条件に一致するコスメがありません</p>
          </div>
          <div v-else-if="cosmetics.length === 0" class="empty-state">
            <span>📦</span><p>まだ登録されたコスメはありません</p>
          </div>
          <!-- グリッド表示 -->
          <div v-if="viewMode === 'grid'" class="cosmetic-grid">
            <div v-for="item in filteredCosmetics" :key="item.id"
              class="cosmetic-card"
              :class="{ 'low-stock': item.currentAmount / item.totalCapacity <= LOW_STOCK_THRESHOLD }"
            >
              <span v-if="item.currentAmount / item.totalCapacity <= LOW_STOCK_THRESHOLD" class="badge">残り少ない</span>
              <div class="image-placeholder">{{ item.name.charAt(0) }}</div>
              <div class="cosmetic-info">
                <h4>{{ item.name }}</h4>
                <div class="percentage-label" :class="progressClass(item)">{{ percentageRemaining(item) }}%</div>
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill" :class="progressClass(item)"
                    :style="{ width: Math.max(0, percentageRemaining(item)) + '%' }"></div>
                </div>
                <p class="amount-text">{{ item.currentAmount?.toFixed(1) }} / {{ item.totalCapacity }} <small>remaining</small></p>
                <p class="days-text">{{ daysRemaining(item) }}</p>
              </div>
              <div class="card-actions">
                <button class="use-btn"
                  v-if="!item.autoDeduct"
                  :disabled="updatingId === item.id || item.currentAmount <= 0"
                  @click="recordUsage(item)">
                  <span v-if="updatingId === item.id" class="mini-spinner"></span>
                  <span v-else>✓ 使った</span>
                </button>
                <span v-if="item.autoDeduct" class="auto-deduct-badge">自動</span>
                <button class="menu-btn" @click="openItemMenu(item)">⋯</button>
              </div>
            </div>
          </div>

          <!-- スワイプ表示 -->
          <div v-else-if="viewMode === 'swipe' && filteredCosmetics.length > 0" class="swipe-view"
            @touchstart="(e) => { swipeTouchStartX = e.touches[0].clientX }"
            @touchend="(e) => { const diff = swipeTouchStartX - e.changedTouches[0].clientX; if (Math.abs(diff) > 50) { if (diff > 0 && swipeIndex < filteredCosmetics.length - 1) swipeIndex++; else if (diff < 0 && swipeIndex > 0) swipeIndex--; } }"
          >
            <div class="swipe-card cosmetic-card"
              :class="{ 'low-stock': filteredCosmetics[swipeIndex].currentAmount / filteredCosmetics[swipeIndex].totalCapacity <= LOW_STOCK_THRESHOLD }"
            >
              <span v-if="filteredCosmetics[swipeIndex].currentAmount / filteredCosmetics[swipeIndex].totalCapacity <= LOW_STOCK_THRESHOLD" class="badge">残り少ない</span>
              <div class="image-placeholder large">{{ filteredCosmetics[swipeIndex].name.charAt(0) }}</div>
              <div class="cosmetic-info">
                <h4>{{ filteredCosmetics[swipeIndex].name }}</h4>
                <div class="percentage-label" :class="progressClass(filteredCosmetics[swipeIndex])">{{ percentageRemaining(filteredCosmetics[swipeIndex]) }}%</div>
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill" :class="progressClass(filteredCosmetics[swipeIndex])"
                    :style="{ width: Math.max(0, percentageRemaining(filteredCosmetics[swipeIndex])) + '%' }"></div>
                </div>
                <p class="amount-text">{{ filteredCosmetics[swipeIndex].currentAmount?.toFixed(1) }} / {{ filteredCosmetics[swipeIndex].totalCapacity }} <small>remaining</small></p>
                <p class="days-text">{{ daysRemaining(filteredCosmetics[swipeIndex]) }}</p>
              </div>
              <div class="card-actions">
                <button class="use-btn"
                  v-if="!filteredCosmetics[swipeIndex].autoDeduct"
                  :disabled="updatingId === filteredCosmetics[swipeIndex].id || filteredCosmetics[swipeIndex].currentAmount <= 0"
                  @click="recordUsage(filteredCosmetics[swipeIndex])">
                  <span v-if="updatingId === filteredCosmetics[swipeIndex].id" class="mini-spinner"></span>
                  <span v-else>✓ 使った</span>
                </button>
                <span v-if="filteredCosmetics[swipeIndex].autoDeduct" class="auto-deduct-badge">自動</span>
                <button class="menu-btn" @click="openItemMenu(filteredCosmetics[swipeIndex])">⋯</button>
              </div>
            </div>
            <div class="swipe-nav">
              <button class="swipe-arrow" :disabled="swipeIndex === 0" @click="swipeIndex--">‹</button>
              <span class="swipe-dots">
                <span v-for="(_, i) in filteredCosmetics" :key="i"
                  class="swipe-dot" :class="{ active: i === swipeIndex }"
                  @click="swipeIndex = i"></span>
              </span>
              <button class="swipe-arrow" :disabled="swipeIndex === filteredCosmetics.length - 1" @click="swipeIndex++">›</button>
            </div>
          </div>

          <!-- トースト -->
          <transition name="toast">
            <div v-if="toastMessage" class="toast">{{ toastMessage }}</div>
          </transition>
          </div>

        </main>

        <!-- ── ➕ 追加ボタン（固定） ── -->
        <div class="fab-container">
          <button class="add-fab" @click="openAddModal">
            <span class="add-fab-icon">＋</span>
            <span class="add-fab-label">コスメを追加</span>
          </button>
        </div>
    </div>

    <!-- ── ドロワーメニュー ── -->
    <transition name="drawer">
      <div v-if="showDrawer" class="drawer-overlay" @click.self="showDrawer = false">
        <div class="drawer">
          <div class="drawer-header">
            <h2 class="drawer-logo">Beautify</h2>
            <button class="drawer-close" @click="showDrawer = false">✕</button>
          </div>
          <div class="drawer-body">
            <button class="drawer-item" @click="showDrawer = false; showTutorial = true">
              <span class="drawer-item-icon"></span>
              <span>使い方</span>
              <span class="drawer-item-arrow">›</span>
            </button>
            <button class="drawer-item" @click="showDrawer = false; showNotifyModal = true">
              <span class="drawer-item-icon"></span>
              <span>通知設定</span>
              <span class="drawer-item-status">{{ notificationPermission === 'granted' ? 'ON' : 'OFF' }}</span>
              <span class="drawer-item-arrow">›</span>
            </button>
            <button class="drawer-item" @click="showDrawer = false; showAccountModal = true">
              <span class="drawer-item-icon"></span>
              <span>ログイン情報変更</span>
              <span class="drawer-item-arrow">›</span>
            </button>
            <div class="drawer-divider"></div>
            <button class="drawer-item danger" @click="showDrawer = false; handleSignOut()">
              <span class="drawer-item-icon"></span>
              <span>ログアウト</span>
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- ── 通知設定モーダル ── -->
    <transition name="fade">
      <div v-if="showNotifyModal" class="modal-overlay" @click.self="showNotifyModal = false">
        <div class="modal-card">
          <div class="modal-header">
            <h2>通知設定</h2>
            <button class="modal-close" @click="showNotifyModal = false">✕</button>
          </div>
          <div class="filter-body">
            <!-- オン/オフ -->
            <div class="notify-setting-row">
              <span>通知</span>
              <label class="toggle-switch">
                <input type="checkbox" v-model="notifyEnabled" @change="notifyEnabled ? requestNotificationPermission() : disableNotification()">
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div v-if="notifyEnabled">
              <!-- 通知時刻 -->
              <div class="notify-setting-row">
                <span>通知時刻</span>
                <select v-model="notifyHour" class="time-select">
                  <option v-for="h in NOTIFY_HOURS" :key="h.value" :value="h.value">{{ h.label }}</option>
                </select>
              </div>
              <!-- 何日前 -->
              <div class="notify-setting-row">
                <span>残り何日で通知</span>
                <div class="days-selector">
                  <button v-for="d in [3,5,7,10,14,20]" :key="d"
                    class="days-btn" :class="{ active: notifyDaysBefore === d }"
                    @click="notifyDaysBefore = d">{{ d }}日前</button>
                </div>
              </div>
            </div>
            <button class="submit-btn" @click="saveNotifyHour(); showNotifyModal = false; showToast('✅ 通知設定を保存しました')">
              保存する
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- ── アカウント設定モーダル ── -->
    <transition name="fade">
      <div v-if="showAccountModal" class="modal-overlay" @click.self="showAccountModal = false">
        <div class="modal-card">
          <div class="modal-header">
            <h2>ログイン情報変更</h2>
            <button class="modal-close" @click="showAccountModal = false">✕</button>
          </div>
          <div class="filter-body">
            <div class="filter-section">
              <p class="filter-section-title">メールアドレス変更</p>
              <input v-model="newEmail" type="email" placeholder="新しいメールアドレス" class="stylish-input" />
              <button class="submit-btn" style="margin-top:8px" @click="changeEmail" :disabled="!newEmail || isUpdatingAccount">変更する</button>
            </div>
            <div class="filter-section">
              <p class="filter-section-title">パスワード変更</p>
              <input v-model="newPassword" type="password" placeholder="新しいパスワード（8文字以上）" class="stylish-input" />
              <button class="submit-btn" style="margin-top:8px" @click="changePassword" :disabled="!newPassword || isUpdatingAccount">変更する</button>
            </div>
            <div v-if="accountMsg" class="account-msg">{{ accountMsg }}</div>
          </div>
        </div>
      </div>
    </transition>

  </template>
</template>

<style scoped>
/* ── 横スクロール完全禁止 ── */
* { box-sizing: border-box; max-width: 100%; }

/* ── コレクションヘッダー ── */
/* ── コレクションヘッダー ── */
.collection-header { display: flex; align-items: center; justify-content: space-between; padding: 0 20px; margin-bottom: 12px; }
.collection-header-left { display: flex; align-items: center; gap: 8px; }
.collection-header-right { display: flex; align-items: center; gap: 8px; }
.filter-badge { background: #3DB88A; color: white; font-size: 0.65rem; padding: 2px 8px; border-radius: 20px; font-weight: 600; }
.filter-btn { display: flex; align-items: center; gap: 4px; background: #f5f5f5; border: none; border-radius: 20px; padding: 6px 12px; font-size: 0.78rem; color: #666; cursor: pointer; transition: all 0.2s; }
.filter-btn.active { background: #E8F7F3; color: #3DB88A; border: 1px solid #B8E8D8; }
.view-toggle { display: flex; gap: 4px; background: #f5f5f5; border-radius: 8px; padding: 4px; }
.view-toggle button { background: none; border: none; padding: 6px 8px; border-radius: 6px; cursor: pointer; color: #aaa; transition: all 0.2s; }
.view-toggle button.active { background: white; color: #3DB88A; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }

/* ── フィルターモーダル ── */
.filter-modal { max-height: 80vh; overflow-y: auto; padding-bottom: env(safe-area-inset-bottom); }
.filter-body { padding: 12px 20px 16px; }
.filter-section { margin-bottom: 12px; }
.filter-section-title { font-size: 0.78rem; font-weight: 700; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px; }
.filter-options { display: flex; flex-wrap: wrap; gap: 6px; }
.filter-option { display: flex; align-items: center; background: #f8f8f8; border: 1.5px solid #eee; border-radius: 20px; padding: 7px 14px; font-size: 0.82rem; color: #555; cursor: pointer; transition: all 0.2s; }
.filter-option.active { background: #E8F7F3; border-color: #3DB88A; color: #3DB88A; font-weight: 600; }
.filter-option-icon { font-size: 1.1rem; flex-shrink: 0; }
.filter-reset { width: 100%; padding: 10px; background: none; border: 1.5px solid #eee; border-radius: 50px; font-size: 0.82rem; color: #aaa; cursor: pointer; margin-top: 8px; transition: all 0.2s; }
.filter-reset:active { background: #f5f5f5; }

/* ── スワイプビュー ── */
.swipe-view { padding: 0 20px; }
.swipe-card { width: 100% !important; }
.image-placeholder.large { width: 80px; height: 80px; font-size: 2rem; }
.swipe-nav { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 16px; padding-bottom: 8px; }
.swipe-arrow { background: none; border: 1.5px solid #eee; width: 36px; height: 36px; border-radius: 50%; font-size: 1.2rem; cursor: pointer; color: #aaa; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
.swipe-arrow:disabled { opacity: 0.3; cursor: not-allowed; }
.swipe-arrow:not(:disabled) { border-color: #3DB88A; color: #3DB88A; }
.swipe-dots { display: flex; gap: 6px; }
.swipe-dot { width: 8px; height: 8px; border-radius: 50%; background: #eee; cursor: pointer; transition: all 0.2s; }
.swipe-dot.active { background: #3DB88A; width: 20px; border-radius: 4px; }

/* ── トースト ── */
.toast { position: fixed; bottom: calc(env(safe-area-inset-bottom) + 24px); left: 50%; transform: translateX(-50%); background: #333; color: white; padding: 12px 24px; border-radius: 50px; font-size: 0.88rem; font-weight: 600; z-index: 999; white-space: nowrap; box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
.toast-enter-active, .toast-leave-active { transition: all 0.3s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(16px); }

/* ── FABボタン ── */
.fab-container { padding: 12px 20px; padding-bottom: max(12px, env(safe-area-inset-bottom)); background: #F4FCFA; border-top: 1px solid #f0f0f0; flex-shrink: 0; width: 100%; box-sizing: border-box; }
.add-fab {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; margin: 0;
  background: linear-gradient(135deg, #3DB88A, #5ECFA8);
  color: white; border: none; border-radius: 50px; padding: 14px 24px;
  font-size: 1rem; font-weight: 700; cursor: pointer;
  box-shadow: 0 6px 20px rgba(61,184,138,0.35); transition: all 0.2s;
  box-sizing: border-box;
}
.add-fab:active { transform: scale(0.98); }
.add-fab-icon { font-size: 1.2rem; }
.add-fab-label { font-size: 0.95rem; }

/* ── モーダル ── */
.modal-overlay {
  position: fixed; inset: 0; z-index: 500;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
  display: flex; align-items: flex-end; justify-content: center;
}
.modal-card {
  width: 100%; max-width: 600px; max-height: 90vh;
  background: white; border-radius: 28px 28px 0 0;
  overflow-y: auto; padding: 0 0 calc(env(safe-area-inset-bottom) + 24px);
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px 16px; border-bottom: 1px solid #f5f5f5; position: sticky; top: 0;
  background: white; z-index: 1;
}
.modal-header h2 { font-size: 1.1rem; font-weight: 700; color: #333; margin: 0; }
.modal-close {
  background: #f5f5f5; border: none; width: 32px; height: 32px;
  border-radius: 50%; font-size: 0.9rem; cursor: pointer; color: #666;
  display: flex; align-items: center; justify-content: center;
}
.modal-card .form-body { padding: 16px 24px; }

/* フェードアニメーション */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ── 基本 ── */
.app-container { font-family: 'Helvetica Neue', Arial, sans-serif; background: #F4FCFA; height: 100dvh; max-height: 100dvh; color: #333; overflow: hidden; width: 100%; display: flex; flex-direction: column; }

/* ── ヘッダー ── */
.sticky-header { position: sticky; top: 0; background: rgba(255,255,255,0.96); backdrop-filter: blur(12px); box-shadow: 0 2px 16px rgba(0,0,0,0.06); z-index: 100; flex-shrink: 0; }
.header-content { max-width: 600px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; }
.header-actions { display: flex; align-items: center; gap: 10px; }
.logo { font-family: 'Georgia', serif; font-size: 1.5rem; color: #3DB88A; margin: 0; font-weight: bold; }
.icon-btn { background: none; border: 1px solid #eee; padding: 5px 10px; border-radius: 20px; font-size: 0.8rem; color: #666; cursor: pointer; }

.help-btn { background: none; border: 1.5px solid #eee; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 1rem; font-weight: bold; color: #aaa; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
.help-btn:hover { border-color: #3DB88A; color: #3DB88A; }
.bell-label { font-size: 0.65rem; display: block; line-height: 1; }
.bell-btn { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; background: none; border: 1.5px solid #eee; padding: 4px 8px; height: 36px; border-radius: 18px; cursor: pointer; font-size: 0.85rem; gap: 1px; transition: all 0.2s; white-space: nowrap; }
.bell-btn.granted { border-color: #3DB88A; background: #E8F7F3; }
.bell-btn.denied  { opacity: 0.5; }
.bell-badge { position: absolute; top: -3px; right: -3px; width: 14px; height: 14px; background: #3DB88A; color: white; border-radius: 50%; font-size: 0.6rem; font-weight: bold; display: flex; align-items: center; justify-content: center; }

.info-bar { max-width: 600px; margin: 0 auto; display: flex; align-items: center; gap: 8px; background: #fffbf0; border-top: 1px solid #ffe082; padding: 8px 20px; font-size: 0.78rem; color: #7a5c00; }
.info-bar.success { background: #f0fff4; border-color: #b2dfdb; color: #1b5e20; }
.info-bar.denied  { background: #E8F7F3; border-color: #B8E8D8; color: #c62828; }
.enable-btn { margin-left: auto; background: #3DB88A; color: white; border: none; border-radius: 12px; padding: 4px 12px; font-size: 0.75rem; cursor: pointer; white-space: nowrap; }

/* ── アラームバナー ── */
.alert-banner { position: relative; overflow: hidden; display: flex; align-items: center; gap: 12px; margin-top: 12px; background: linear-gradient(135deg, #E8F7F3, #E8F7F3); border: 1.5px solid #3DB88A; border-radius: 18px; padding: 14px 18px; margin-bottom: 16px; }
.alert-pulse { position: absolute; inset: 0; border-radius: 18px; background: rgba(253,67,118,0.06); animation: pulse-bg 2s ease-in-out infinite; }
@keyframes pulse-bg { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.alert-icon { font-size: 1.4rem; flex-shrink: 0; }
.alert-text { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.alert-text strong { color: #3DB88A; font-size: 0.9rem; }
.alert-text span { font-size: 0.82rem; color: #555; }
.alert-count { background: #3DB88A; color: white; font-size: 0.8rem; font-weight: bold; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.slide-down-enter-active, .slide-down-leave-active { transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-12px) scale(0.97); }

/* ── 🕐 通知時刻設定パネル ── */
.notify-panel {
  display: flex; align-items: center; justify-content: space-between;
  background: white; border-radius: 18px;
  border: 1.5px solid #eee;
  padding: 14px 18px; margin-bottom: 20px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.notify-panel--active {
  border-color: #B8E8D8;
  box-shadow: 0 4px 16px rgba(61,184,138,0.1);
}
.notify-panel-left  { display: flex; align-items: center; gap: 12px; }
.notify-icon { font-size: 1.5rem; }
.notify-label { display: flex; flex-direction: column; gap: 2px; }
.notify-label-main { font-size: 0.88rem; font-weight: 600; color: #333; }
.notify-label-sub  { font-size: 0.72rem; color: #aaa; }
.notify-panel-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }

.time-picker-wrap { display: flex; align-items: center; gap: 8px; }

.time-select {
  background: #f5f5f5 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%233DB88A' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 12px center;
  -webkit-appearance: none; appearance: none;
  border: 1.5px solid #eee; border-radius: 12px; padding: 8px 36px 8px 12px;
  font-size: 0.88rem; color: #333; cursor: pointer;
}
.time-select:focus { outline: none; border-color: #3DB88A; box-shadow: 0 0 0 3px rgba(61,184,138,0.15); }
.time-select:disabled { opacity: 0.4; cursor: not-allowed; }

.save-time-btn {
  background: #3DB88A; color: white; border: none;
  border-radius: 12px; padding: 8px 16px;
  font-size: 0.82rem; font-weight: bold; cursor: pointer;
  transition: all 0.2s; min-width: 52px; display: flex; align-items: center; justify-content: center;
}
.save-time-btn:hover:not(:disabled) { background: #2AA876; }
.save-time-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.save-time-btn.saved { background: #34c759; }

.notify-disabled-hint { font-size: 0.68rem; color: #ccc; }

/* ── フォームカード ── */
.main-content { max-width: 600px; margin: 0 auto; padding: 16px 20px 0; overflow: hidden; width: 100%; box-sizing: border-box; flex: 1; display: flex; flex-direction: column; min-height: 0; }
.card { background: white; border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.04); overflow: hidden; margin-bottom: 30px; }
.card-header { background: #FFF0F5; padding: 20px; text-align: center; }
.card-header h2 { margin: 0; font-size: 1.2rem; color: #3DB88A; }
.card-header p  { margin: 5px 0 0; font-size: 0.8rem; color: #888; }
.form-body { padding: 20px; }

.upload-area { margin-bottom: 20px; text-align: center; }
.file-input { display: none; }
.upload-label { display: block; width: 120px; height: 120px; margin: 0 auto; border-radius: 20px; background: #f8f8f8; border: 2px dashed #ddd; cursor: pointer; overflow: hidden; position: relative; }
.preview-box img { width: 100%; height: 100%; object-fit: cover; }
.upload-placeholder { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; color: #aaa; font-size: 0.8rem; }
.plus-icon { font-size: 2rem; margin-bottom: 5px; }
.loading-overlay { position: absolute; inset: 0; background: rgba(255,255,255,0.9); display: flex; flex-direction: column; justify-content: center; align-items: center; color: #3DB88A; font-size: 0.8rem; font-weight: bold; }
.spinner { width: 24px; height: 24px; border: 3px solid #B8E8D8; border-top: 3px solid #3DB88A; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 5px; }
@keyframes spin { to { transform: rotate(360deg); } }

.input-group { margin-bottom: 15px; position: relative; width: 100%; }
.input-row { display: flex; gap: 10px; }
.stylish-input { width: 100%; padding: 12px 15px; border: 1px solid #eee; background: #fcfcfc; border-radius: 12px; font-size: 1rem; box-sizing: border-box; }
.stylish-input:focus { outline: none; border-color: #3DB88A; background: white; }
.unit { position: absolute; right: 15px; top: 50%; transform: translateY(-50%); color: #aaa; font-size: 0.8rem; pointer-events: none; }
.sub-label { display: block; font-size: 0.78rem; color: #888; margin-bottom: 8px; }
.times-selector { display: flex; gap: 8px; }
.times-btn { flex: 1; padding: 9px 0; border: 1.5px solid #eee; background: #f9f9f9; border-radius: 10px; font-size: 0.9rem; cursor: pointer; color: #666; transition: all 0.15s; }
.times-btn.active { border-color: #3DB88A; background: #E8F7F3; color: #3DB88A; font-weight: bold; }
.submit-btn { width: 100%; background: linear-gradient(135deg, #3DB88A, #5ECFA8); color: white; border: none; padding: 14px; border-radius: 50px; font-size: 1rem; font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(61,184,138,0.3); }
.submit-btn:disabled { opacity: 0.7; cursor: not-allowed; }

/* ── コレクション ── */
.section-title { font-size: 1.1rem; color: #333; margin-bottom: 15px; padding-left: 5px; }
.empty-state { text-align: center; padding: 40px; color: #bbb; font-size: 0.9rem; }
.empty-state span { font-size: 2.5rem; display: block; margin-bottom: 8px; }
.cosmetic-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; width: 100%; overflow: hidden; }

.cosmetic-card { background: white; border-radius: 16px; padding: 15px; box-shadow: 0 4px 10px rgba(0,0,0,0.03); display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; border: 1.5px solid transparent; transition: all 0.25s; }
.cosmetic-card.low-stock { border-color: #ff6b9d; animation: card-pulse 3s ease-in-out infinite; }
@keyframes card-pulse { 0%, 100% { box-shadow: 0 4px 20px rgba(255,107,157,0.18); } 50% { box-shadow: 0 4px 28px rgba(255,107,157,0.38); } }
.badge { position: absolute; top: 10px; right: 10px; background: #ff6b9d; color: white; font-size: 0.62rem; padding: 3px 8px; border-radius: 20px; font-weight: bold; }
.image-placeholder { width: 60px; height: 60px; background: #f0f0f0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: #ccc; margin-bottom: 10px; }
.cosmetic-info { width: 100%; }
.cosmetic-info h4 { margin: 0 0 6px; font-size: 0.95rem; color: #333; }
.percentage-label { font-size: 0.8rem; font-weight: bold; margin-bottom: 5px; }
.percentage-label.good    { color: #34c759; }
.percentage-label.warning { color: #ff9500; }
.percentage-label.danger  { color: #ff6b9d; }
.progress-bar-bg { width: 100%; height: 7px; background: #eee; border-radius: 4px; overflow: hidden; margin-bottom: 6px; }
.progress-bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
.progress-bar-fill.good    { background: linear-gradient(90deg, #3DB88A, #34c759); }
.progress-bar-fill.warning { background: linear-gradient(90deg, #ff9500, #ffb340); }
.progress-bar-fill.danger  { background: linear-gradient(90deg, #ff6b9d, #ff8fab); }
.amount-text { font-size: 0.75rem; color: #888; margin: 0 0 3px; }
.days-text   { font-size: 0.72rem; color: #aaa; margin: 0; }

.card-actions { display: flex; gap: 8px; margin-top: 12px; width: 100%; align-items: center; }
.menu-btn { background: none; border: none; color: #aaa; font-size: 1.2rem; cursor: pointer; padding: 4px 8px; margin-left: auto; flex-shrink: 0; }
.item-menu-card { max-height: 60vh; }
.item-menu-body { padding: 8px 0 16px; }
.item-menu-row { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; gap: 12px; }
.item-menu-row-left { display: flex; align-items: center; gap: 12px; }
.item-menu-icon { font-size: 1.2rem; flex-shrink: 0; }
.item-menu-label { font-size: 0.9rem; font-weight: 600; color: #333; }
.item-menu-sub { font-size: 0.75rem; color: #aaa; margin-top: 2px; }
.item-menu-action { width: 100%; display: flex; align-items: center; gap: 12px; padding: 16px 24px; background: none; border: none; font-size: 0.9rem; color: #333; cursor: pointer; transition: background 0.15s; text-align: left; }
.item-menu-action:active { background: #f8f8f8; }
.item-menu-action.danger { color: #5ECFA8; }
.item-menu-action:disabled { opacity: 0.4; cursor: not-allowed; }
.item-menu-divider { height: 1px; background: #f0f0f0; margin: 4px 0; }
.auto-deduct-badge { font-size: 0.72rem; color: #3DB88A; white-space: nowrap; flex: 1; }
.auto-toggle { position: relative; width: 36px; height: 20px; flex-shrink: 0; cursor: pointer; }
.auto-toggle input { opacity: 0; width: 0; height: 0; }
.auto-toggle-slider { position: absolute; inset: 0; background: #ccc; border-radius: 20px; transition: 0.3s; }
.auto-toggle-slider:before { content: ''; position: absolute; width: 14px; height: 14px; left: 3px; top: 3px; background: white; border-radius: 50%; transition: 0.3s; }
input:checked + .auto-toggle-slider { background: #3DB88A; }
input:checked + .auto-toggle-slider:before { transform: translateX(16px); }
.use-btn { flex: 1; background: #E8F7F3; color: #3DB88A; border: 1.5px solid #3DB88A; border-radius: 20px; padding: 7px 0; font-size: 0.82rem; font-weight: bold; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 4px; }
.use-btn:hover:not(:disabled) { background: #3DB88A; color: white; }
.use-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.delete-btn { background: none; border: 1.5px solid #eee; border-radius: 20px; padding: 7px 10px; cursor: pointer; font-size: 0.85rem; color: #ccc; transition: all 0.15s; }
.delete-btn:hover { border-color: #e05555; color: #e05555; }
.mini-spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #B8E8D8; border-top: 2px solid #3DB88A; border-radius: 50%; animation: spin 0.8s linear infinite; }

/* ── ハンバーガーボタン ── */
.hamburger-btn { background: none; border: none; cursor: pointer; padding: 8px; display: flex; flex-direction: column; gap: 5px; }
.hamburger-btn span { display: block; width: 22px; height: 2px; background: #333; border-radius: 2px; transition: all 0.2s; }

/* ── ドロワー ── */
.drawer-overlay { position: fixed; inset: 0; z-index: 600; background: rgba(0,0,0,0.4); }
.drawer { position: absolute; left: 0; top: 0; bottom: 0; width: 80%; max-width: 300px; background: white; display: flex; flex-direction: column; padding-top: env(safe-area-inset-top); }
.drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 20px 16px; border-bottom: 1px solid #f0f0f0; }
.drawer-logo { font-family: Georgia, serif; font-size: 1.4rem; color: #3DB88A; margin: 0; }
.drawer-close { background: none; border: none; font-size: 1.1rem; color: #aaa; cursor: pointer; padding: 4px 8px; }
.drawer-body { flex: 1; padding: 8px 0; overflow-y: auto; }
.drawer-item { width: 100%; background: none; border: none; display: flex; align-items: center; gap: 12px; padding: 16px 20px; font-size: 0.95rem; color: #333; cursor: pointer; text-align: left; transition: background 0.15s; }
.drawer-item:active { background: #F4FCFA; }
.drawer-item.danger { color: #5ECFA8; }
.drawer-item-icon { font-size: 1.2rem; flex-shrink: 0; }
.drawer-item-arrow { margin-left: auto; color: #ccc; font-size: 1.1rem; }
.drawer-item-status { margin-left: auto; font-size: 0.75rem; font-weight: 700; color: #3DB88A; background: #E8F7F3; padding: 2px 8px; border-radius: 20px; }
.drawer-item.danger .drawer-item-status { display: none; }
.drawer-divider { height: 1px; background: #f0f0f0; margin: 8px 0; }

/* ── ドロワーアニメーション ── */
.drawer-enter-active, .drawer-leave-active { transition: opacity 0.25s; }
.drawer-enter-active .drawer, .drawer-leave-active .drawer { transition: transform 0.25s ease; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .drawer, .drawer-leave-to .drawer { transform: translateX(-100%); }

/* ── 通知設定 ── */
.notify-setting-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f5f5f5; gap: 12px; }
.notify-setting-row span { font-size: 0.9rem; color: #333; flex-shrink: 0; }
.toggle-switch { position: relative; width: 48px; height: 26px; flex-shrink: 0; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; inset: 0; background: #ccc; border-radius: 26px; cursor: pointer; transition: 0.3s; }
.toggle-slider:before { content: ''; position: absolute; width: 20px; height: 20px; left: 3px; top: 3px; background: white; border-radius: 50%; transition: 0.3s; }
input:checked + .toggle-slider { background: #3DB88A; }
input:checked + .toggle-slider:before { transform: translateX(22px); }
.days-selector { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.days-btn { background: #f5f5f5; border: 1.5px solid #eee; border-radius: 20px; padding: 4px 10px; font-size: 0.78rem; cursor: pointer; transition: all 0.2s; color: #555; }
.days-btn.active { background: #E8F7F3; border-color: #3DB88A; color: #3DB88A; font-weight: 700; }

/* ── アカウント設定 ── */
.account-msg { text-align: center; font-size: 0.85rem; margin-top: 12px; color: #555; }
</style>
