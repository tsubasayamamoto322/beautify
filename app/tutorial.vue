<script setup lang="ts">
import { ref, computed } from 'vue';

const emit = defineEmits(['close']);

const currentSlide = ref(0);
const touchStartX = ref(0);
const touchEndX = ref(0);

const slides = [
  {
    icon: '✿',
    title: 'Beautifyへようこそ',
    subtitle: 'あなたのコスメを、賢く管理',
    description: 'コスメの残量を記録して、なくなる前にお知らせ。補充し忘れでお気に入りが切れることがなくなります。',
    color: '#fd4376',
    bgColor: '#fff0f5',
    illustration: 'welcome',
  },
  {
    icon: '📷',
    title: 'コスメを登録する',
    subtitle: 'カメラで撮るだけ、AIが自動入力',
    description: 'パッケージを撮影すると、AIがブランド名・商品名・容量を自動で読み取ります。手入力も可能です。',
    color: '#ff6b9d',
    bgColor: '#fff5f9',
    illustration: 'camera',
    steps: ['① 「New Item」の📷をタップ', '② コスメのパッケージを撮影', '③ 内容を確認して「登録する」'],
  },
  {
    icon: '✓',
    title: '使ったら記録する',
    subtitle: '「使った」ボタンを押すだけ',
    description: '毎日使うたびに「✓ 使った」をタップするだけ。残量が自動で減っていき、あと何日分残っているか計算します。',
    color: '#e91e8c',
    bgColor: '#fdf0f8',
    illustration: 'usage',
    steps: ['① コスメカードの「✓ 使った」をタップ', '② 残量が1回分ずつ減る', '③ 残り日数が自動計算される'],
  },
  {
    icon: '🔔',
    title: '通知アラームを設定',
    subtitle: '残量20%以下になったら通知',
    description: '毎日好きな時刻に残量チェックの通知が届きます。補充のタイミングを逃しません。',
    color: '#fd4376',
    bgColor: '#fff0f5',
    illustration: 'notification',
    steps: ['① 🔔ボタンをタップして通知を許可', '② 通知を受け取りたい時刻を設定', '③ 残量20%以下になると自動でお知らせ'],
  },
];

const isLast = computed(() => currentSlide.value === slides.length - 1);

function next() {
  if (currentSlide.value < slides.length - 1) currentSlide.value++;
  else emit('close');
}

function prev() {
  if (currentSlide.value > 0) currentSlide.value--;
}

function goTo(index: number) {
  currentSlide.value = index;
}

// スワイプ対応
function onTouchStart(e: TouchEvent) {
  touchStartX.value = e.touches[0].clientX;
}
function onTouchEnd(e: TouchEvent) {
  touchEndX.value = e.changedTouches[0].clientX;
  const diff = touchStartX.value - touchEndX.value;
  if (Math.abs(diff) > 50) {
    if (diff > 0) next();
    else prev();
  }
}
</script>

<template>
  <div class="tutorial-overlay" @touchstart="onTouchStart" @touchend="onTouchEnd">

    <!-- スキップ -->
    <button class="skip-btn" @click="emit('close')">スキップ</button>

    <!-- スライド -->
    <div class="slides-container">
      <transition :name="'slide'" mode="out-in">
        <div class="slide" :key="currentSlide" :style="{ background: slides[currentSlide].bgColor }">

          <!-- イラストエリア -->
          <div class="illustration-area" :style="{ background: slides[currentSlide].bgColor }">

            <!-- Welcome スライド -->
            <div v-if="slides[currentSlide].illustration === 'welcome'" class="illus-welcome">
              <div class="illus-orb orb1"></div>
              <div class="illus-orb orb2"></div>
              <div class="illus-flower">✿</div>
              <div class="illus-bottles">
                <div class="bottle b1">💊</div>
                <div class="bottle b2">🧴</div>
                <div class="bottle b3">💄</div>
                <div class="bottle b4">🧼</div>
              </div>
            </div>

            <!-- カメラ スライド -->
            <div v-else-if="slides[currentSlide].illustration === 'camera'" class="illus-camera">
              <div class="phone-frame">
                <div class="phone-screen">
                  <div class="camera-viewfinder">
                    <div class="scan-line"></div>
                    <div class="corner tl"></div>
                    <div class="corner tr"></div>
                    <div class="corner bl"></div>
                    <div class="corner br"></div>
                    <div class="product-preview">🧴</div>
                  </div>
                  <div class="ai-badge">✨ AI解析中...</div>
                </div>
              </div>
            </div>

            <!-- 使った スライド -->
            <div v-else-if="slides[currentSlide].illustration === 'usage'" class="illus-usage">
              <div class="usage-card">
                <div class="usage-product">🧴 化粧水</div>
                <div class="usage-bar-wrap">
                  <div class="usage-bar-track">
                    <div class="usage-bar-fill"></div>
                  </div>
                  <span class="usage-pct">65%</span>
                </div>
                <div class="usage-days">あと約 32 日</div>
                <div class="usage-btn-demo">✓ 使った</div>
              </div>
              <div class="tap-hint">← タップ！</div>
            </div>

            <!-- 通知 スライド -->
            <div v-else-if="slides[currentSlide].illustration === 'notification'" class="illus-notif">
              <div class="notif-phone">
                <div class="notif-card">
                  <div class="notif-icon">⚠️</div>
                  <div class="notif-text">
                    <div class="notif-title">Beautify - 残量アラート</div>
                    <div class="notif-body">化粧水 がもうすぐなくなります</div>
                  </div>
                </div>
                <div class="notif-time-setting">
                  <span>毎日</span>
                  <div class="notif-time-badge">08:00</div>
                  <span>に通知</span>
                </div>
              </div>
            </div>

          </div>

          <!-- テキストエリア -->
          <div class="text-area">
            <div class="slide-icon" :style="{ color: slides[currentSlide].color }">
              {{ slides[currentSlide].icon }}
            </div>
            <h2 class="slide-title">{{ slides[currentSlide].title }}</h2>
            <p class="slide-subtitle" :style="{ color: slides[currentSlide].color }">
              {{ slides[currentSlide].subtitle }}
            </p>
            <p class="slide-desc">{{ slides[currentSlide].description }}</p>

            <!-- ステップ -->
            <div v-if="slides[currentSlide].steps" class="steps">
              <div v-for="(step, i) in slides[currentSlide].steps" :key="i" class="step-item">
                {{ step }}
              </div>
            </div>
          </div>

        </div>
      </transition>
    </div>

    <!-- ドットインジケーター -->
    <div class="dots">
      <button v-for="(_, i) in slides" :key="i"
        class="dot" :class="{ active: i === currentSlide }"
        @click="goTo(i)">
      </button>
    </div>

    <!-- ナビゲーション -->
    <div class="nav-area">
      <button class="nav-prev" :class="{ invisible: currentSlide === 0 }" @click="prev">
        ←
      </button>
      <button class="nav-next" :style="{ background: `linear-gradient(135deg, ${slides[currentSlide].color}, #ff8090)` }" @click="next">
        {{ isLast ? 'はじめる 🚀' : '次へ →' }}
      </button>
    </div>

  </div>
</template>

<style scoped>
/* ── 横スクロール完全禁止 ── */
* { box-sizing: border-box; max-width: 100%; }

.tutorial-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: white;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  font-family: 'Helvetica Neue', Arial, sans-serif;
  overflow: hidden;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

/* スキップボタン */
.skip-btn {
  position: absolute;
  top: calc(env(safe-area-inset-top) + 16px);
  right: 20px;
  background: none;
  border: none;
  color: #bbb;
  font-size: 0.85rem;
  cursor: pointer;
  z-index: 10;
  padding: 4px 8px;
}

/* スライドコンテナ */
.slides-container {
  flex: 1;
  width: 100%;
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}

.slide {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

/* イラストエリア */
.illustration-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  width: 100%;
  box-sizing: border-box;
}

/* ── Welcome イラスト ── */
.illus-welcome { position: relative; width: 200px; height: 200px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.illus-orb { position: absolute; border-radius: 50%; filter: blur(40px); }
.orb1 { width: 160px; height: 160px; background: rgba(253,67,118,0.15); top: 0; right: 0; }
.orb2 { width: 120px; height: 120px; background: rgba(255,107,144,0.12); bottom: 0; left: 0; }
.illus-flower { font-size: 4rem; position: absolute; animation: float 3s ease-in-out infinite; z-index: 2; background: linear-gradient(135deg, #fd4376, #ff8090); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
.illus-bottles { position: absolute; inset: 0; }
.bottle { position: absolute; font-size: 1.8rem; animation: float 3s ease-in-out infinite; }
.b1 { top: 10%;  left: 10%;  animation-delay: 0s; }
.b2 { top: 5%;   right: 10%; animation-delay: 0.5s; }
.b3 { bottom: 15%; left: 15%; animation-delay: 1s; }
.b4 { bottom: 10%; right: 15%; animation-delay: 1.5s; }

/* ── カメライラスト ── */
.illus-camera { display: flex; align-items: center; justify-content: center; }
.phone-frame { width: 140px; height: 200px; background: #222; border-radius: 24px; padding: 10px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); flex-shrink: 0; }
.phone-screen { width: 100%; height: 100%; background: #111; border-radius: 16px; overflow: hidden; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.camera-viewfinder { width: 110px; height: 110px; position: relative; display: flex; align-items: center; justify-content: center; }
.scan-line { position: absolute; width: 100%; height: 2px; background: rgba(253,67,118,0.8); animation: scan 2s ease-in-out infinite; top: 0; box-shadow: 0 0 8px #fd4376; }
@keyframes scan { 0%{top:0} 50%{top:100%} 100%{top:0} }
.corner { position: absolute; width: 16px; height: 16px; border-color: #fd4376; border-style: solid; }
.tl { top: 0; left: 0; border-width: 2px 0 0 2px; }
.tr { top: 0; right: 0; border-width: 2px 2px 0 0; }
.bl { bottom: 0; left: 0; border-width: 0 0 2px 2px; }
.br { bottom: 0; right: 0; border-width: 0 2px 2px 0; }
.product-preview { font-size: 2.5rem; }
.ai-badge { margin-top: 8px; background: rgba(253,67,118,0.9); color: white; font-size: 0.65rem; padding: 4px 10px; border-radius: 20px; font-weight: bold; }

/* ── 使ったイラスト ── */
.illus-usage { display: flex; align-items: center; gap: 12px; max-width: 100%; overflow: hidden; }
.usage-card { background: white; border-radius: 20px; padding: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); width: 160px; flex-shrink: 0; overflow: hidden; }
.usage-product { font-size: 0.85rem; font-weight: 600; color: #333; margin-bottom: 10px; }
.usage-bar-wrap { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.usage-bar-track { flex: 1; height: 8px; background: #eee; border-radius: 4px; overflow: hidden; }
.usage-bar-fill { width: 65%; height: 100%; background: linear-gradient(90deg, #34c759, #30d158); border-radius: 4px; }
.usage-pct { font-size: 0.75rem; font-weight: bold; color: #34c759; }
.usage-days { font-size: 0.72rem; color: #aaa; margin-bottom: 12px; }
.usage-btn-demo { background: linear-gradient(135deg, #fd4376, #ff8090); color: white; text-align: center; padding: 8px; border-radius: 20px; font-size: 0.82rem; font-weight: bold; animation: pulse-btn 2s ease-in-out infinite; }
@keyframes pulse-btn { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
.tap-hint { font-size: 0.75rem; color: #fd4376; font-weight: bold; writing-mode: horizontal-tb; }

/* ── 通知イラスト ── */
.illus-notif { display: flex; flex-direction: column; align-items: center; gap: 16px; width: 100%; overflow: hidden; }
.notif-phone { display: flex; flex-direction: column; gap: 12px; width: 200px; max-width: 80vw; overflow: hidden; }
.notif-card { background: white; border-radius: 16px; padding: 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.1); display: flex; gap: 10px; align-items: center; animation: slide-in 0.5s ease-out; }
@keyframes slide-in { from{transform:translateY(-20px);opacity:0} to{transform:translateY(0);opacity:1} }
.notif-icon { font-size: 1.4rem; flex-shrink: 0; }
.notif-title { font-size: 0.72rem; font-weight: bold; color: #333; }
.notif-body  { font-size: 0.68rem; color: #888; margin-top: 2px; }
.notif-time-setting { display: flex; align-items: center; gap: 8px; background: white; border-radius: 14px; padding: 12px 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); font-size: 0.82rem; color: #555; justify-content: center; }
.notif-time-badge { background: linear-gradient(135deg, #fd4376, #ff8090); color: white; font-weight: bold; padding: 4px 12px; border-radius: 20px; font-size: 0.9rem; }

/* テキストエリア */
.text-area {
  padding: 16px 28px 12px;
  text-align: center;
  background: white;
  border-radius: 28px 28px 0 0;
  box-shadow: 0 -8px 24px rgba(0,0,0,0.04);
  box-sizing: border-box;
  width: 100%;
  overflow: hidden;
  flex-shrink: 0;
}
.slide-icon { font-size: 1.8rem; margin-bottom: 8px; }
.slide-title { font-size: 1.2rem; font-weight: 800; color: #222; margin: 0 0 4px; }
.slide-subtitle { font-size: 0.82rem; font-weight: 600; margin: 0 0 10px; }
.slide-desc { font-size: 0.82rem; color: #666; line-height: 1.6; margin: 0; }

.steps { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; text-align: left; }
.step-item { font-size: 0.78rem; color: #555; background: #fafafa; padding: 8px 12px; border-radius: 10px; border-left: 3px solid #fd4376; }

/* ドット */
.dots { display: flex; gap: 8px; padding: 12px 0; }
.dot { width: 8px; height: 8px; border-radius: 50%; border: none; background: #eee; cursor: pointer; transition: all 0.3s; padding: 0; }
.dot.active { width: 24px; border-radius: 4px; background: #fd4376; }

/* ナビ */
.nav-area { display: flex; align-items: center; justify-content: center; width: 100%; padding: 0 24px 16px; box-sizing: border-box; position: relative; overflow: hidden; }
.nav-prev { background: none; border: 1.5px solid #eee; color: #aaa; font-size: 1rem; width: 44px; height: 44px; border-radius: 50%; cursor: pointer; transition: all 0.2s; position: absolute; left: 24px; flex-shrink: 0; }
.nav-prev.invisible { opacity: 0; pointer-events: none; }
.nav-next { width: 200px; max-width: calc(100% - 80px); padding: 14px 0; color: white; border: none; border-radius: 50px; font-size: 0.95rem; font-weight: 700; cursor: pointer; box-shadow: 0 6px 20px rgba(253,67,118,0.3); transition: all 0.2s; text-align: center; }

/* スライドアニメーション */
.slide-enter-active, .slide-leave-active { transition: all 0.3s ease; }
.slide-enter-from { opacity: 0; transform: translateX(30px); }
.slide-leave-to   { opacity: 0; transform: translateX(-30px); }
</style>
