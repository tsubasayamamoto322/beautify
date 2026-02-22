<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Authenticator } from "@aws-amplify/ui-vue";
import "@aws-amplify/ui-vue/styles.css";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { uploadData } from "aws-amplify/storage";
import type { Schema } from "../amplify/data/resource";
import outputs from "../amplify_outputs.json";

Amplify.configure(outputs);
const client = generateClient<Schema>();

// ── 定数 ─────────────────────────────────────────────────────────
const LOW_STOCK_THRESHOLD = 0.20;
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
  if (days <= 0) return 'もうすぐ終わり！🚨';
  return `あと約 ${days} 日`;
}

function percentageRemaining(item: Schema['Cosmetic']['type']): number {
  if (!item.totalCapacity) return 0;
  return Math.round((item.currentAmount / item.totalCapacity) * 100);
}

// ── Service Worker 初期化 ─────────────────────────────────────────
async function initServiceWorker() {
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
async function requestNotificationPermission() {
  if (!swRegistration.value) { alert('Service Workerがまだ準備中です'); return; }
  if (!VAPID_PUBLIC_KEY)     { alert('.env に VITE_VAPID_PUBLIC_KEY を設定してください'); return; }

  const permission = await Notification.requestPermission();
  notificationPermission.value = permission;
  if (permission !== 'granted') { alert('通知が拒否されました。ブラウザ設定から許可してください。'); return; }

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
    const p256dhBase64 = btoa(String.fromCharCode(...new Uint8Array(p256dh)));
    const authBase64   = btoa(String.fromCharCode(...new Uint8Array(auth)));

    // 古いサブスクリプションを削除して新規保存
    const { data: existing } = await client.models.PushSubscription.list();
    for (const old of existing) await client.models.PushSubscription.delete({ id: old.id });

    await client.models.PushSubscription.create({
      endpoint:  sub.endpoint,
      p256dh:    p256dhBase64,
      auth:      authBase64,
      userAgent: navigator.userAgent.slice(0, 200),
    });

    await showLocalNotification(
      '✅ 通知を有効にしました',
      `毎日 ${notifyHour.value}:00 と残量が少なくなった時にお知らせします！`
    );
  } catch (err) {
    console.error('Push設定失敗:', err);
    alert('通知の設定に失敗しました: ' + err);
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
    notifyHour.value     = s.notifyHour ?? 8;
  }
}

async function saveNotifyHour() {
  isSavingTime.value = true;
  try {
    if (userSettingsId.value) {
      await client.models.UserSettings.update({
        id:         userSettingsId.value,
        notifyHour: notifyHour.value,
      });
    } else {
      const { data: created } = await client.models.UserSettings.create({
        notifyHour: notifyHour.value,
      });
      userSettingsId.value = created?.id ?? null;
    }
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

async function deleteCosmetic(id: string) {
  if (!confirm('削除しますか？')) return;
  await client.models.Cosmetic.delete({ id });
  listCosmetics();
}
</script>

<template>
  <authenticator :hide-sign-up="false">
    <template v-slot="{ signOut }">
      <div class="app-container">

        <!-- ── ヘッダー ── -->
        <header class="sticky-header">
          <div class="header-content">
            <h1 class="logo">Beautify</h1>
            <div class="header-actions">
              <button class="bell-btn"
                :class="{ granted: notificationPermission === 'granted', denied: notificationPermission === 'denied' }"
                @click="requestNotificationPermission"
                :title="notificationPermission === 'granted' ? '通知有効' : '通知を有効にする'"
              >
                <span>{{ notificationPermission === 'denied' ? '🔕' : '🔔' }}</span>
                <span v-if="notificationPermission !== 'granted'" class="bell-badge">!</span>
              </button>
              <button @click="signOut" class="icon-btn">Log out</button>
            </div>
          </div>

          <!-- 通知ステータスバー -->
          <div v-if="notificationPermission === 'granted'" class="info-bar success">
            <span>🔔</span>
            <span>通知有効 — 毎日 {{ notifyHour }}:00 ＋ 残量 20% 以下の時にお知らせします</span>
          </div>
          <div v-else-if="notificationPermission === 'default'" class="info-bar">
            <span>🔔</span>
            <span>残量アラームのために通知を有効にしましょう</span>
            <button @click="requestNotificationPermission" class="enable-btn">有効にする</button>
          </div>
          <div v-else class="info-bar denied">
            <span>🔕</span>
            <span>通知が拒否されています。ブラウザ設定から許可してください。</span>
          </div>
        </header>

        <main class="main-content">

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
                <span class="notify-label-main">毎日の通知時刻</span>
                <span class="notify-label-sub">残量 20% 以下のコスメがある日に送信</span>
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
                  <span v-else-if="savedTimeFlash">✓</span>
                  <span v-else>保存</span>
                </button>
              </div>
              <span v-if="notificationPermission !== 'granted'" class="notify-disabled-hint">
                通知を有効にすると設定できます
              </span>
            </div>
          </div>

          <!-- ── 登録フォーム ── -->
          <div class="card form-card">
            <div class="card-header">
              <h2>New Item</h2>
              <p>コスメを撮影するとAIが自動入力します ✨</p>
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

          <!-- ── コレクション ── -->
          <h3 class="section-title">My Collection</h3>
          <div v-if="cosmetics.length === 0" class="empty-state">
            <span>📦</span><p>まだ登録されたコスメはありません</p>
          </div>
          <div class="cosmetic-grid">
            <div v-for="item in cosmetics" :key="item.id"
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
                  :disabled="updatingId === item.id || item.currentAmount <= 0"
                  @click="recordUsage(item)">
                  <span v-if="updatingId === item.id" class="mini-spinner"></span>
                  <span v-else>✓ 使った</span>
                </button>
                <button class="delete-btn" @click="deleteCosmetic(item.id)">🗑</button>
              </div>
            </div>
          </div>

        </main>
      </div>
    </template>
  </authenticator>
</template>

<style scoped>
/* ── 基本 ── */
.app-container { font-family: 'Helvetica Neue', Arial, sans-serif; background: #FAFAFA; min-height: 100vh; color: #333; }

/* ── ヘッダー ── */
.sticky-header { position: sticky; top: 0; background: rgba(255,255,255,0.96); backdrop-filter: blur(12px); box-shadow: 0 2px 16px rgba(0,0,0,0.06); z-index: 100; }
.header-content { max-width: 600px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; }
.header-actions { display: flex; align-items: center; gap: 10px; }
.logo { font-family: 'Georgia', serif; font-size: 1.5rem; color: #fd4376; margin: 0; font-weight: bold; }
.icon-btn { background: none; border: 1px solid #eee; padding: 5px 10px; border-radius: 20px; font-size: 0.8rem; color: #666; cursor: pointer; }

.bell-btn { position: relative; background: none; border: 1.5px solid #eee; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 1rem; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
.bell-btn.granted { border-color: #fd4376; background: #fff0f5; }
.bell-btn.denied  { opacity: 0.5; }
.bell-badge { position: absolute; top: -3px; right: -3px; width: 14px; height: 14px; background: #fd4376; color: white; border-radius: 50%; font-size: 0.6rem; font-weight: bold; display: flex; align-items: center; justify-content: center; }

.info-bar { max-width: 600px; margin: 0 auto; display: flex; align-items: center; gap: 8px; background: #fffbf0; border-top: 1px solid #ffe082; padding: 8px 20px; font-size: 0.78rem; color: #7a5c00; }
.info-bar.success { background: #f0fff4; border-color: #b2dfdb; color: #1b5e20; }
.info-bar.denied  { background: #fff5f5; border-color: #ffcdd2; color: #c62828; }
.enable-btn { margin-left: auto; background: #fd4376; color: white; border: none; border-radius: 12px; padding: 4px 12px; font-size: 0.75rem; cursor: pointer; white-space: nowrap; }

/* ── アラームバナー ── */
.alert-banner { position: relative; overflow: hidden; display: flex; align-items: center; gap: 12px; background: linear-gradient(135deg, #fff1f1, #fff5f5); border: 1.5px solid #fd4376; border-radius: 18px; padding: 14px 18px; margin-bottom: 16px; }
.alert-pulse { position: absolute; inset: 0; border-radius: 18px; background: rgba(253,67,118,0.06); animation: pulse-bg 2s ease-in-out infinite; }
@keyframes pulse-bg { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.alert-icon { font-size: 1.4rem; flex-shrink: 0; }
.alert-text { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.alert-text strong { color: #fd4376; font-size: 0.9rem; }
.alert-text span { font-size: 0.82rem; color: #555; }
.alert-count { background: #fd4376; color: white; font-size: 0.8rem; font-weight: bold; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
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
  border-color: #ffd1dc;
  box-shadow: 0 4px 16px rgba(253,67,118,0.08);
}
.notify-panel-left  { display: flex; align-items: center; gap: 12px; }
.notify-icon { font-size: 1.5rem; }
.notify-label { display: flex; flex-direction: column; gap: 2px; }
.notify-label-main { font-size: 0.88rem; font-weight: 600; color: #333; }
.notify-label-sub  { font-size: 0.72rem; color: #aaa; }
.notify-panel-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }

.time-picker-wrap { display: flex; align-items: center; gap: 8px; }

.time-select {
  appearance: none;
  background: #fff0f5 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23fd4376' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 10px center;
  border: 1.5px solid #ffd1dc;
  border-radius: 12px;
  padding: 8px 32px 8px 14px;
  font-size: 1rem; font-weight: bold; color: #fd4376;
  cursor: pointer; transition: all 0.15s;
}
.time-select:focus { outline: none; border-color: #fd4376; box-shadow: 0 0 0 3px rgba(253,67,118,0.12); }
.time-select:disabled { opacity: 0.4; cursor: not-allowed; }

.save-time-btn {
  background: #fd4376; color: white; border: none;
  border-radius: 12px; padding: 8px 16px;
  font-size: 0.82rem; font-weight: bold; cursor: pointer;
  transition: all 0.2s; min-width: 52px; display: flex; align-items: center; justify-content: center;
}
.save-time-btn:hover:not(:disabled) { background: #e03366; }
.save-time-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.save-time-btn.saved { background: #34c759; }

.notify-disabled-hint { font-size: 0.68rem; color: #ccc; }

/* ── フォームカード ── */
.main-content { max-width: 600px; margin: 0 auto; padding: 20px; }
.card { background: white; border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.04); overflow: hidden; margin-bottom: 30px; }
.card-header { background: #FFF0F5; padding: 20px; text-align: center; }
.card-header h2 { margin: 0; font-size: 1.2rem; color: #fd4376; }
.card-header p  { margin: 5px 0 0; font-size: 0.8rem; color: #888; }
.form-body { padding: 20px; }

.upload-area { margin-bottom: 20px; text-align: center; }
.file-input { display: none; }
.upload-label { display: block; width: 120px; height: 120px; margin: 0 auto; border-radius: 20px; background: #f8f8f8; border: 2px dashed #ddd; cursor: pointer; overflow: hidden; position: relative; }
.preview-box img { width: 100%; height: 100%; object-fit: cover; }
.upload-placeholder { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; color: #aaa; font-size: 0.8rem; }
.plus-icon { font-size: 2rem; margin-bottom: 5px; }
.loading-overlay { position: absolute; inset: 0; background: rgba(255,255,255,0.9); display: flex; flex-direction: column; justify-content: center; align-items: center; color: #fd4376; font-size: 0.8rem; font-weight: bold; }
.spinner { width: 24px; height: 24px; border: 3px solid #ffd1dc; border-top: 3px solid #fd4376; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 5px; }
@keyframes spin { to { transform: rotate(360deg); } }

.input-group { margin-bottom: 15px; position: relative; width: 100%; }
.input-row { display: flex; gap: 10px; }
.stylish-input { width: 100%; padding: 12px 15px; border: 1px solid #eee; background: #fcfcfc; border-radius: 12px; font-size: 1rem; box-sizing: border-box; }
.stylish-input:focus { outline: none; border-color: #fd4376; background: white; }
.unit { position: absolute; right: 15px; top: 50%; transform: translateY(-50%); color: #aaa; font-size: 0.8rem; pointer-events: none; }
.sub-label { display: block; font-size: 0.78rem; color: #888; margin-bottom: 8px; }
.times-selector { display: flex; gap: 8px; }
.times-btn { flex: 1; padding: 9px 0; border: 1.5px solid #eee; background: #f9f9f9; border-radius: 10px; font-size: 0.9rem; cursor: pointer; color: #666; transition: all 0.15s; }
.times-btn.active { border-color: #fd4376; background: #fff0f5; color: #fd4376; font-weight: bold; }
.submit-btn { width: 100%; background: linear-gradient(135deg, #fd4376, #ff8090); color: white; border: none; padding: 14px; border-radius: 50px; font-size: 1rem; font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(253,67,118,0.3); }
.submit-btn:disabled { opacity: 0.7; cursor: not-allowed; }

/* ── コレクション ── */
.section-title { font-size: 1.1rem; color: #333; margin-bottom: 15px; padding-left: 5px; }
.empty-state { text-align: center; padding: 40px; color: #bbb; font-size: 0.9rem; }
.empty-state span { font-size: 2.5rem; display: block; margin-bottom: 8px; }
.cosmetic-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }

.cosmetic-card { background: white; border-radius: 16px; padding: 15px; box-shadow: 0 4px 10px rgba(0,0,0,0.03); display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; border: 1.5px solid transparent; transition: all 0.25s; }
.cosmetic-card.low-stock { border-color: #fd4376; animation: card-pulse 3s ease-in-out infinite; }
@keyframes card-pulse { 0%, 100% { box-shadow: 0 4px 20px rgba(253,67,118,0.18); } 50% { box-shadow: 0 4px 28px rgba(253,67,118,0.35); } }
.badge { position: absolute; top: 10px; right: 10px; background: #fd4376; color: white; font-size: 0.62rem; padding: 3px 8px; border-radius: 20px; font-weight: bold; }
.image-placeholder { width: 60px; height: 60px; background: #f0f0f0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: #ccc; margin-bottom: 10px; }
.cosmetic-info { width: 100%; }
.cosmetic-info h4 { margin: 0 0 6px; font-size: 0.95rem; color: #333; }
.percentage-label { font-size: 0.8rem; font-weight: bold; margin-bottom: 5px; }
.percentage-label.good    { color: #34c759; }
.percentage-label.warning { color: #ff9500; }
.percentage-label.danger  { color: #fd4376; }
.progress-bar-bg { width: 100%; height: 7px; background: #eee; border-radius: 4px; overflow: hidden; margin-bottom: 6px; }
.progress-bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
.progress-bar-fill.good    { background: linear-gradient(90deg, #34c759, #30d158); }
.progress-bar-fill.warning { background: linear-gradient(90deg, #ff9500, #ffb340); }
.progress-bar-fill.danger  { background: linear-gradient(90deg, #fd4376, #ff6b90); }
.amount-text { font-size: 0.75rem; color: #888; margin: 0 0 3px; }
.days-text   { font-size: 0.72rem; color: #aaa; margin: 0; }

.card-actions { display: flex; gap: 8px; margin-top: 12px; width: 100%; }
.use-btn { flex: 1; background: #fff0f5; color: #fd4376; border: 1.5px solid #fd4376; border-radius: 20px; padding: 7px 0; font-size: 0.82rem; font-weight: bold; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 4px; }
.use-btn:hover:not(:disabled) { background: #fd4376; color: white; }
.use-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.delete-btn { background: none; border: 1.5px solid #eee; border-radius: 20px; padding: 7px 10px; cursor: pointer; font-size: 0.85rem; color: #ccc; transition: all 0.15s; }
.delete-btn:hover { border-color: #ff6b6b; color: #ff6b6b; }
.mini-spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #ffd1dc; border-top: 2px solid #fd4376; border-radius: 50%; animation: spin 0.8s linear infinite; }
</style>
