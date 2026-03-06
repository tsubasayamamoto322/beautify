<script setup lang="ts">
import { ref } from 'vue';
import { signIn, signUp, confirmSignUp, resetPassword, confirmResetPassword } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import { Amplify } from 'aws-amplify';
import outputs from '../amplify_outputs.json';
import type { Schema } from '../amplify/data/resource';

Amplify.configure(outputs);
const client = generateClient<Schema>();

async function sendEmailNotification(toEmail: string, emailType: 'welcome' | 'password_changed') {
  try {
    await client.queries.sendEmail(
      { toEmail, emailType },
      { authMode: 'iam' }
    );
    console.log(`[sendEmail] ${emailType} → ${toEmail}`);
  } catch (e) {
    console.error('[sendEmail] 失敗:', e);
  }
}

// ── 画面モード ───────────────────────────────────────────────────
type Mode = 'login' | 'signup' | 'confirm' | 'forgot' | 'forgot_confirm';
const mode = ref<Mode>('login');

// ── フォーム入力 ─────────────────────────────────────────────────
const email        = ref('');
const password     = ref('');
const confirmCode  = ref('');
const newPassword  = ref('');
const showPassword = ref(false);
const isLoading    = ref(false);
const errorMsg     = ref('');
const successMsg   = ref('');

const emit = defineEmits(['signed-in']);

function clearMessages() { errorMsg.value = ''; successMsg.value = ''; }

// ── ログイン ─────────────────────────────────────────────────────
async function handleLogin() {
  clearMessages();
  isLoading.value = true;
  try {
    // 既存セッションが残っている場合は先にサインアウト
    try {
      const { signOut } = await import('aws-amplify/auth');
      await signOut();
    } catch (_) { /* 未ログイン状態でも無視 */ }

    await signIn({ username: email.value, password: password.value });
    emit('signed-in');
  } catch (e: any) {
    errorMsg.value = e.message?.includes('Incorrect') ? 'メールアドレスまたはパスワードが違います' :
                     e.message?.includes('not confirmed') ? 'メール確認が完了していません' :
                     e.message ?? 'ログインに失敗しました';
  } finally { isLoading.value = false; }
}

// ── 新規登録 ─────────────────────────────────────────────────────
async function handleSignUp() {
  clearMessages();
  isLoading.value = true;
  try {
    await signUp({ username: email.value, password: password.value,
      options: { userAttributes: { email: email.value } } });
    mode.value = 'confirm';
    successMsg.value = '確認コードをメールに送信しました';
  } catch (e: any) {
    errorMsg.value = e.message?.includes('already exists') ? 'このメールアドレスは既に登録済みです' :
                     e.message ?? '登録に失敗しました';
  } finally { isLoading.value = false; }
}

// ── メール確認 ───────────────────────────────────────────────────
async function handleConfirm() {
  clearMessages();
  isLoading.value = true;
  try {
    await confirmSignUp({ username: email.value, confirmationCode: confirmCode.value });
    await sendEmailNotification(email.value, 'welcome');
    mode.value = 'login';
    successMsg.value = '登録が完了しました！ログインしてください';
  } catch (e: any) {
    errorMsg.value = 'コードが違います。もう一度お試しください';
  } finally { isLoading.value = false; }
}

// ── パスワードリセット ────────────────────────────────────────────
async function handleForgot() {
  clearMessages();
  isLoading.value = true;
  try {
    await resetPassword({ username: email.value });
    mode.value = 'forgot_confirm';
    successMsg.value = 'リセットコードをメールに送信しました';
  } catch (e: any) {
    errorMsg.value = e.message ?? '送信に失敗しました';
  } finally { isLoading.value = false; }
}

async function handleForgotConfirm() {
  clearMessages();
  isLoading.value = true;
  try {
    await confirmResetPassword({ username: email.value, confirmationCode: confirmCode.value, newPassword: newPassword.value });
    await sendEmailNotification(email.value, 'password_changed');
    mode.value = 'login';
    successMsg.value = 'パスワードを変更しました！ログインしてください';
  } catch (e: any) {
    errorMsg.value = e.message ?? '変更に失敗しました';
  } finally { isLoading.value = false; }
}
</script>

<template>
  <div class="auth-container">
    <!-- 背景装飾 -->
    <div class="bg-orb orb1"></div>
    <div class="bg-orb orb2"></div>
    <div class="bg-orb orb3"></div>

    <div class="auth-card">
      <!-- ロゴ -->
      <div class="auth-logo">
        <div class="logo-icon">✿</div>
        <h1 class="logo-text">Beautify</h1>
        <p class="logo-sub">あなたのコスメを、賢く管理</p>
      </div>

      <!-- ログイン -->
      <form v-if="mode === 'login'" @submit.prevent="handleLogin" class="auth-form">
        <h2 class="form-title">ログイン</h2>

        <div class="field">
          <label>メールアドレス</label>
          <input v-model="email" type="email" placeholder="hello@example.com" required autocomplete="email" />
        </div>
        <div class="field">
          <label>パスワード</label>
          <div class="password-wrap">
            <input v-model="password" :type="showPassword ? 'text' : 'password'"
              placeholder="••••••••" required autocomplete="current-password" />
            <button type="button" class="eye-btn" @click="showPassword = !showPassword">
              {{ showPassword ? '🙈' : '👁' }}
            </button>
          </div>
        </div>

        <div v-if="errorMsg"   class="msg error">{{ errorMsg }}</div>
        <div v-if="successMsg" class="msg success">{{ successMsg }}</div>

        <button type="submit" class="primary-btn" :disabled="isLoading">
          <span v-if="isLoading" class="btn-spinner"></span>
          <span v-else>ログイン</span>
        </button>

        <div class="auth-links">
          <button type="button" @click="mode = 'forgot'; clearMessages()">パスワードを忘れた方</button>
          <span class="divider">|</span>
          <button type="button" @click="mode = 'signup'; clearMessages()">新規登録</button>
        </div>
      </form>

      <!-- 新規登録 -->
      <form v-else-if="mode === 'signup'" @submit.prevent="handleSignUp" class="auth-form">
        <h2 class="form-title">新規登録</h2>

        <div class="field">
          <label>メールアドレス</label>
          <input v-model="email" type="email" placeholder="hello@example.com" required />
        </div>
        <div class="field">
          <label>パスワード（8文字以上）</label>
          <div class="password-wrap">
            <input v-model="password" :type="showPassword ? 'text' : 'password'"
              placeholder="••••••••" required minlength="8" />
            <button type="button" class="eye-btn" @click="showPassword = !showPassword">
              {{ showPassword ? '🙈' : '👁' }}
            </button>
          </div>
        </div>

        <div v-if="errorMsg"   class="msg error">{{ errorMsg }}</div>
        <div v-if="successMsg" class="msg success">{{ successMsg }}</div>

        <button type="submit" class="primary-btn" :disabled="isLoading">
          <span v-if="isLoading" class="btn-spinner"></span>
          <span v-else">アカウントを作成</span>
        </button>

        <div class="auth-links">
          <button type="button" @click="mode = 'login'; clearMessages()">← ログインに戻る</button>
        </div>
      </form>

      <!-- メール確認 -->
      <form v-else-if="mode === 'confirm'" @submit.prevent="handleConfirm" class="auth-form">
        <h2 class="form-title">メール確認</h2>
        <p class="form-desc">{{ email }} に送信した確認コードを入力してください</p>

        <div class="field">
          <label>確認コード</label>
          <input v-model="confirmCode" type="text" placeholder="123456" required maxlength="6" class="code-input" />
        </div>

        <div v-if="errorMsg"   class="msg error">{{ errorMsg }}</div>
        <div v-if="successMsg" class="msg success">{{ successMsg }}</div>

        <button type="submit" class="primary-btn" :disabled="isLoading">
          <span v-if="isLoading" class="btn-spinner"></span>
          <span v-else>確認する</span>
        </button>
        <div class="auth-links">
          <button type="button" @click="mode = 'signup'; clearMessages()">← 戻る</button>
        </div>
      </form>

      <!-- パスワードリセット -->
      <form v-else-if="mode === 'forgot'" @submit.prevent="handleForgot" class="auth-form">
        <h2 class="form-title">パスワードリセット</h2>
        <p class="form-desc">登録済みのメールアドレスを入力してください</p>

        <div class="field">
          <label>メールアドレス</label>
          <input v-model="email" type="email" placeholder="hello@example.com" required />
        </div>

        <div v-if="errorMsg"   class="msg error">{{ errorMsg }}</div>
        <div v-if="successMsg" class="msg success">{{ successMsg }}</div>

        <button type="submit" class="primary-btn" :disabled="isLoading">
          <span v-if="isLoading" class="btn-spinner"></span>
          <span v-else>リセットコードを送信</span>
        </button>
        <div class="auth-links">
          <button type="button" @click="mode = 'login'; clearMessages()">← ログインに戻る</button>
        </div>
      </form>

      <!-- 新パスワード設定 -->
      <form v-else-if="mode === 'forgot_confirm'" @submit.prevent="handleForgotConfirm" class="auth-form">
        <h2 class="form-title">新しいパスワード</h2>

        <div class="field">
          <label>確認コード</label>
          <input v-model="confirmCode" type="text" placeholder="123456" required class="code-input" />
        </div>
        <div class="field">
          <label>新しいパスワード</label>
          <div class="password-wrap">
            <input v-model="newPassword" :type="showPassword ? 'text' : 'password'"
              placeholder="••••••••" required minlength="8" />
            <button type="button" class="eye-btn" @click="showPassword = !showPassword">
              {{ showPassword ? '🙈' : '👁' }}
            </button>
          </div>
        </div>

        <div v-if="errorMsg"   class="msg error">{{ errorMsg }}</div>
        <div v-if="successMsg" class="msg success">{{ successMsg }}</div>

        <button type="submit" class="primary-btn" :disabled="isLoading">
          <span v-if="isLoading" class="btn-spinner"></span>
          <span v-else>パスワードを変更</span>
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
/* ── 変数 ── */
:root {
  --pink:      #fd4376;
  --pink-soft: #ff8090;
  --pink-pale: #fff0f5;
}

/* ── 背景 ── */
.auth-container {
  height: 100vh;
  max-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff8fa;
  position: fixed;
  inset: 0;
  overflow: hidden;
  padding: env(safe-area-inset-top) 20px env(safe-area-inset-bottom);
  font-family: 'Helvetica Neue', Arial, sans-serif;
  box-sizing: border-box;
}

/* 背景の装飾円 */
.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  pointer-events: none;
}
.orb1 { width: 300px; height: 300px; background: rgba(253,67,118,0.12); top: -80px; right: -60px; }
.orb2 { width: 200px; height: 200px; background: rgba(255,128,144,0.10); bottom: 40px; left: -60px; }
.orb3 { width: 150px; height: 150px; background: rgba(253,67,118,0.07); top: 40%; left: 30%; }

/* ── カード ── */
.auth-card {
  width: 100%;
  max-width: 380px;
  background: white;
  border-radius: 32px;
  padding: 40px 32px 36px;
  box-shadow:
    0 20px 60px rgba(253,67,118,0.10),
    0 4px 20px rgba(0,0,0,0.04);
  position: relative;
  z-index: 1;
}

/* ── ロゴ ── */
.auth-logo { text-align: center; margin-bottom: 32px; }
.logo-icon {
  font-size: 2.4rem;
  display: block;
  margin-bottom: 6px;
  background: linear-gradient(135deg, #fd4376, #ff8090);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: float 3s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-4px); }
}
.logo-text {
  font-family: 'Georgia', serif;
  font-size: 2rem;
  color: #fd4376;
  margin: 0;
  letter-spacing: 0.05em;
}
.logo-sub {
  font-size: 0.78rem;
  color: #bbb;
  margin: 4px 0 0;
  letter-spacing: 0.02em;
}

/* ── フォーム ── */
.auth-form { display: flex; flex-direction: column; gap: 16px; }
.form-title { font-size: 1.1rem; font-weight: 700; color: #333; margin: 0 0 4px; text-align: center; }
.form-desc  { font-size: 0.78rem; color: #888; margin: 0; text-align: center; line-height: 1.5; }

.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 0.75rem; font-weight: 600; color: #666; letter-spacing: 0.02em; }
.field input {
  padding: 13px 16px;
  border: 1.5px solid #eee;
  border-radius: 14px;
  font-size: 0.95rem;
  background: #fafafa;
  outline: none;
  transition: all 0.2s;
  -webkit-appearance: none;
}
.field input:focus { border-color: #fd4376; background: white; box-shadow: 0 0 0 3px rgba(253,67,118,0.08); }

.password-wrap { position: relative; }
.password-wrap input { width: 100%; box-sizing: border-box; padding-right: 48px; }
.eye-btn {
  position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer; font-size: 1rem; padding: 4px;
}

.code-input { letter-spacing: 0.3em; font-size: 1.4rem; text-align: center; font-weight: bold; }

/* ── ボタン ── */
.primary-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #fd4376 0%, #ff8090 100%);
  color: white;
  border: none;
  border-radius: 50px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(253,67,118,0.35);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 4px;
  -webkit-appearance: none;
}
.primary-btn:active { transform: scale(0.98); box-shadow: 0 3px 12px rgba(253,67,118,0.3); }
.primary-btn:disabled { opacity: 0.7; cursor: not-allowed; }

.btn-spinner {
  width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── リンク ── */
.auth-links {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}
.auth-links button {
  background: none; border: none; color: #fd4376;
  font-size: 0.78rem; cursor: pointer; padding: 4px;
  text-decoration: underline; text-underline-offset: 2px;
}
.divider { color: #ddd; font-size: 0.8rem; }

/* ── メッセージ ── */
.msg { font-size: 0.78rem; padding: 10px 14px; border-radius: 10px; text-align: center; line-height: 1.4; }
.msg.error   { background: #fff1f1; color: #e53935; border: 1px solid #ffcdd2; }
.msg.success { background: #f0fff4; color: #2e7d32; border: 1px solid #b2dfdb; }
</style>
