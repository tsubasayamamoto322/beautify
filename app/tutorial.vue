<script setup lang="ts">
import { ref, computed } from 'vue';

const emit = defineEmits(['close']);

const currentSlide = ref(0);
const touchStartX = ref(0);

const slides = [
  {
    icon: '✿',
    title: 'Beautifyへようこそ',
    subtitle: 'あなたのコスメを、賢く管理',
    description: 'コスメの残量を記録して、なくなる前にお知らせ。補充し忘れでお気に入りが切れることがなくなります。',
    color: '#3DB88A',
    bgColor: '#E8F7F3',
  },
  {
    icon: '📷',
    title: 'コスメを登録する',
    subtitle: '＋ボタンからカメラで撮影',
    description: '画面下の「コスメを追加」ボタンをタップ。パッケージを撮影するとAIがブランド名・商品名・容量を自動入力します。',
    color: '#3DB88A',
    bgColor: '#E8F7F3',
    steps: ['① 画面下の「コスメを追加」をタップ', '② コスメのパッケージを撮影', '③ 内容を確認して「登録する」'],
  },
  {
    icon: '✓',
    title: '使ったら記録する',
    subtitle: '「使った」ボタンを押すだけ',
    description: 'My Collectionのコスメカードにある「✓ 使った」をタップするだけ。残量が自動で減り、あと何日分残っているか計算します。',
    color: '#3DB88A',
    bgColor: '#E8F7F3',
    steps: ['① コスメカードの「✓ 使った」をタップ', '② 残量が1回分ずつ減る', '③ 残り日数が自動計算される'],
  },
  {
    icon: '☰',
    title: '設定・通知を管理する',
    subtitle: '右上のメニューから設定',
    description: '右上のメニュー（☰）から通知設定・使い方・ログイン情報の変更ができます。通知をONにすると残量が減った時にお知らせします。',
    color: '#3DB88A',
    bgColor: '#E8F7F3',
    steps: ['① 右上の☰をタップ', '② 「通知設定」で時刻・タイミングを設定', '③ 残量が設定日数を切るとお知らせ'],
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
function goTo(index: number) { currentSlide.value = index; }

function onTouchStart(e: TouchEvent) { touchStartX.value = e.touches[0].clientX; }
function onTouchEnd(e: TouchEvent) {
  const diff = touchStartX.value - e.changedTouches[0].clientX;
  if (Math.abs(diff) > 50) { if (diff > 0) next(); else prev(); }
}
</script>

<template>
  <div class="tutorial-overlay" @touchstart="onTouchStart" @touchend="onTouchEnd">
    <button class="skip-btn" @click="emit('close')">スキップ</button>

    <div class="slides-container">
      <transition name="slide" mode="out-in">
        <div class="slide" :key="currentSlide" :style="{ background: slides[currentSlide].bgColor }">

          <!-- イラストエリア -->
          <div class="illustration-area" :style="{ background: slides[currentSlide].bgColor }">
            <div class="illus-welcome">
              <div class="illus-orb orb1"></div>
              <div class="illus-orb orb2"></div>
              <div class="slide-big-icon" :style="{ color: slides[currentSlide].color }">
                {{ slides[currentSlide].icon }}
              </div>
            </div>
          </div>

          <!-- テキストエリア -->
          <div class="text-area">
            <h2 class="slide-title">{{ slides[currentSlide].title }}</h2>
            <p class="slide-subtitle" :style="{ color: slides[currentSlide].color }">
              {{ slides[currentSlide].subtitle }}
            </p>
            <p class="slide-desc">{{ slides[currentSlide].description }}</p>
            <div v-if="slides[currentSlide].steps" class="steps">
              <div v-for="(step, i) in slides[currentSlide].steps" :key="i" class="step-item">
                {{ step }}
              </div>
            </div>
          </div>

        </div>
      </transition>
    </div>

    <div class="dots">
      <button v-for="(_, i) in slides" :key="i"
        class="dot" :class="{ active: i === currentSlide }"
        @click="goTo(i)">
      </button>
    </div>

    <div class="nav-area">
      <button class="nav-prev" :class="{ invisible: currentSlide === 0 }" @click="prev">←</button>
      <button class="nav-next" @click="next">
        {{ isLast ? 'はじめる 🚀' : '次へ →' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; max-width: 100%; }
.tutorial-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; flex-direction: column; align-items: center;
  background: white; overflow: hidden;
  width: 100%; height: 100%;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
.skip-btn {
  position: absolute; top: calc(env(safe-area-inset-top) + 16px); right: 20px;
  background: none; border: none; color: #bbb; font-size: 0.85rem; cursor: pointer; z-index: 10;
}
.slides-container { flex: 1; width: 100%; overflow: hidden; position: relative; }
.slide { width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.illustration-area {
  flex: 1; display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden; width: 100%;
}
.illus-welcome { position: relative; width: 200px; height: 200px; display: flex; align-items: center; justify-content: center; }
.illus-orb { position: absolute; border-radius: 50%; filter: blur(40px); }
.orb1 { width: 160px; height: 160px; background: rgba(61,184,138,0.15); top: 0; right: 0; }
.orb2 { width: 120px; height: 120px; background: rgba(61,184,138,0.10); bottom: 0; left: 0; }
.slide-big-icon {
  font-size: 5rem; z-index: 2; animation: float 3s ease-in-out infinite;
  display: flex; align-items: center; justify-content: center;
}
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
.text-area {
  padding: 20px 28px 12px; text-align: center; background: white;
  border-radius: 28px 28px 0 0; box-shadow: 0 -8px 24px rgba(0,0,0,0.04);
  width: 100%; overflow: hidden; flex-shrink: 0;
}
.slide-title { font-size: 1.2rem; font-weight: 800; color: #222; margin: 0 0 4px; }
.slide-subtitle { font-size: 0.82rem; font-weight: 600; margin: 0 0 10px; }
.slide-desc { font-size: 0.82rem; color: #666; line-height: 1.6; margin: 0; }
.steps { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; text-align: left; }
.step-item { font-size: 0.78rem; color: #555; background: #fafafa; padding: 8px 12px; border-radius: 10px; border-left: 3px solid #3DB88A; }
.dots { display: flex; gap: 8px; padding: 12px 0; }
.dot { width: 8px; height: 8px; border-radius: 50%; border: none; background: #eee; cursor: pointer; transition: all 0.3s; padding: 0; }
.dot.active { width: 24px; border-radius: 4px; background: #3DB88A; }
.nav-area {
  display: flex; align-items: center; justify-content: center;
  width: 100%; padding: 0 24px 16px; gap: 12px; box-sizing: border-box; position: relative;
}
.nav-prev {
  background: none; border: 1.5px solid #eee; color: #aaa; font-size: 1rem;
  width: 44px; height: 44px; border-radius: 50%; cursor: pointer; transition: all 0.2s;
  position: absolute; left: 24px; flex-shrink: 0;
}
.nav-prev.invisible { opacity: 0; pointer-events: none; }
.nav-next {
  width: 200px; max-width: calc(100% - 80px); padding: 14px 0; color: white; border: none;
  border-radius: 50px; font-size: 0.95rem; font-weight: 700; cursor: pointer;
  background: linear-gradient(135deg, #3DB88A, #5ECFA8);
  box-shadow: 0 6px 20px rgba(61,184,138,0.35); transition: all 0.2s; text-align: center;
}
.slide-enter-active, .slide-leave-active { transition: all 0.3s ease; }
.slide-enter-from { opacity: 0; transform: translateX(30px); }
.slide-leave-to { opacity: 0; transform: translateX(-30px); }
</style>
