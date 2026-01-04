<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Authenticator } from "@aws-amplify/ui-vue";
import "@aws-amplify/ui-vue/styles.css";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { uploadData } from "aws-amplify/storage";
import type { Schema } from "../amplify/data/resource";
import outputs from "../amplify_outputs.json";

Amplify.configure(outputs);

const client = generateClient<Schema>();

// 状態変数
const name = ref('');
const totalCapacity = ref('');
const usagePerApp = ref('');
const imageFile = ref<File | null>(null);
const previewUrl = ref<string | null>(null);
const cosmetics = ref<Array<Schema['Cosmetic']['type']>>([]);
const isAnalyzing = ref(false); // AI解析中かどうか
const uploadedImagePath = ref(''); // アップロード完了した画像のパス

onMounted(() => {
  listCosmetics();
});

async function listCosmetics() {
  const { data: items } = await client.models.Cosmetic.list();
  cosmetics.value = items;
}

// ✨ 画像が選択されたら、自動アップロード＆AI解析開始！
async function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    const file = target.files[0];
    imageFile.value = file;
    previewUrl.value = URL.createObjectURL(file);
    
    // AI解析スタート
    isAnalyzing.value = true;
    
    try {
      alert('🚩 1. スタート：画像をアップロードします'); // 🕵️‍♀️ チェックポイント1

      // 1. 先に画像をアップロードする
      const filename = `${Date.now()}-${file.name}`;
      const uploadResult = await uploadData({
        path: `images/${filename}`,
        data: file,
      }).result;
      
      uploadedImagePath.value = uploadResult.path;
      alert('🚀 2. アップロード成功！次はAIを呼び出します'); // 🕵️‍♀️ チェックポイント2

      // 2. アップロードした画像をAIに解析させる
      // エラー情報も受け取るように書き換え
      const { data: aiResult, errors } = await client.queries.analyzeImage({
        imageKey: uploadResult.path
      });

      // 通信エラーがあれば表示
      if (errors) {
        alert('❌ AI呼び出しエラー: ' + JSON.stringify(errors));
        console.error(errors);
        return;
      }

      alert('📩 3. AIから返事が来ました！中身を確認します'); // 🕵️‍♀️ チェックポイント3
      console.log("AI Raw Data:", aiResult); // コンソールにも出す

      // 3. AIの結果があればフォームに入力
      if (aiResult) {
        const parsed = typeof aiResult === 'string' ? JSON.parse(aiResult) : aiResult;
        
        alert(`✨ 4. 解析成功！\n名前: ${parsed.name}\n容量: ${parsed.totalCapacity}`); // 🕵️‍♀️ チェックポイント4
        
        if (parsed.name) name.value = parsed.name;
        if (parsed.totalCapacity) totalCapacity.value = String(parsed.totalCapacity);
        if (parsed.brand) {
           name.value = `${parsed.brand} ${parsed.name || ''}`.trim();
        }
      } else {
        alert('⚠️ AIの返事が空っぽでした...');
      }

    } catch (error) {
      // どんなエラーが起きたか画面に出す
      alert('💀 エラー発生！\n' + error); 
      console.error("AI Error:", error);
    } finally {
      isAnalyzing.value = false;
    }
  }
}

async function createCosmetic() {
  if (!name.value || !totalCapacity.value) {
    alert('商品名と容量は必須です');
    return;
  }

  try {
    // 画像パスは、AI解析時にアップロード済みならそれを使う
    let finalImagePath = uploadedImagePath.value;

    // もしAIを使わず、画像だけ選択してアップロードが終わってない場合（通常はないが念のため）
    if (!finalImagePath && imageFile.value) {
       const filename = `${Date.now()}-${imageFile.value.name}`;
       const result = await uploadData({
        path: `images/${filename}`,
        data: imageFile.value,
      }).result;
      finalImagePath = result.path;
    }

    await client.models.Cosmetic.create({
      name: name.value,
      totalCapacity: parseFloat(totalCapacity.value),
      currentAmount: parseFloat(totalCapacity.value),
      usagePerApp: parseFloat(usagePerApp.value) || 0,
      imageUrl: finalImagePath,
    });

    alert('✨ 登録しました！');
    
    // リセット
    name.value = '';
    totalCapacity.value = '';
    usagePerApp.value = '';
    imageFile.value = null;
    previewUrl.value = null;
    uploadedImagePath.value = '';
    listCosmetics();

  } catch (error) {
    console.error('Error:', error);
    alert('登録に失敗しました💦');
  }
}
</script>

<template>
  <authenticator :hide-sign-up="false">
    <template v-slot="{ signOut }">
      <div class="app-container">
        <header class="sticky-header">
          <div class="header-content">
            <h1 class="logo">Beautify</h1>
            <button @click="signOut" class="icon-btn">
              <span class="material-icon">Log out</span>
            </button>
          </div>
        </header>

        <main class="main-content">
          <div class="card form-card">
            <div class="card-header">
              <h2>New Item</h2>
              <p>コスメを撮影するとAIが自動入力します ✨</p>
            </div>
            
            <div class="form-body">
              <div class="upload-area" :class="{ 'has-image': previewUrl, 'analyzing': isAnalyzing }">
                <input type="file" accept="image/png, image/jpeg" capture="environment" @change="onFileChange" id="file-input" class="file-input" :disabled="isAnalyzing" />
                <label for="file-input" class="upload-label">
                  <div v-if="isAnalyzing" class="loading-overlay">
                    <div class="spinner"></div>
                    <span>AI解析中...</span>
                  </div>

                  <div v-else-if="previewUrl" class="preview-box">
                    <img :src="previewUrl" alt="Preview" />
                  </div>
                  <div v-else class="upload-placeholder">
                    <span class="plus-icon">📷</span>
                    <span>写真を撮る</span>
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

              <button @click="createCosmetic" class="submit-btn" :disabled="isAnalyzing">
                登録する
              </button>
            </div>
          </div>

          <h3 class="section-title">My Collection</h3>
          <div class="cosmetic-grid">
            <div v-for="item in cosmetics" :key="item.id" class="cosmetic-card">
              <div class="cosmetic-image-area">
                <div class="image-placeholder">{{ item.name.charAt(0) }}</div>
              </div>
              <div class="cosmetic-info">
                <h4>{{ item.name }}</h4>
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill" :style="{ width: (item.currentAmount / item.totalCapacity * 100) + '%' }"></div>
                </div>
                <p class="amount-text">{{ item.currentAmount }} / {{ item.totalCapacity }} <small>remaining</small></p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </template>
  </authenticator>
</template>

<style scoped>
/* 基本スタイル */
.app-container {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  background-color: #FAFAFA;
  min-height: 100vh;
  color: #333;
}
.sticky-header {
  position: sticky;
  top: 0;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  z-index: 100;
  padding: 15px 20px;
}
.header-content {
  max-width: 600px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.logo {
  font-family: 'Georgia', serif;
  font-size: 1.5rem;
  color: #fd4376;
  margin: 0;
  font-weight: bold;
}
.icon-btn {
  background: none;
  border: 1px solid #eee;
  padding: 5px 10px;
  border-radius: 20px;
  font-size: 0.8rem;
  color: #666;
  cursor: pointer;
}
.main-content {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}
.card {
  background: white;
  border-radius: 24px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.04);
  overflow: hidden;
  margin-bottom: 30px;
}
.card-header {
  background: #FFF0F5;
  padding: 20px;
  text-align: center;
}
.card-header h2 { margin: 0; font-size: 1.2rem; color: #fd4376; }
.card-header p { margin: 5px 0 0; font-size: 0.8rem; color: #888; }
.form-body { padding: 20px; }

/* 画像アップロード & ローディング */
.upload-area { margin-bottom: 20px; text-align: center; }
.file-input { display: none; }
.upload-label {
  display: block;
  width: 120px;
  height: 120px;
  margin: 0 auto;
  border-radius: 20px;
  background: #f8f8f8;
  border: 2px dashed #ddd;
  cursor: pointer;
  overflow: hidden;
  position: relative;
  transition: all 0.2s;
}
.preview-box img { width: 100%; height: 100%; object-fit: cover; }
.upload-placeholder {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: #aaa;
  font-size: 0.8rem;
}
.plus-icon { font-size: 2rem; margin-bottom: 5px; }

/* ローディングスピナー */
.loading-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(255,255,255,0.9);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #fd4376;
  font-size: 0.8rem;
  font-weight: bold;
}
.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #ffd1dc;
  border-top: 3px solid #fd4376;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 5px;
}
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

/* 入力フォーム */
.input-group { margin-bottom: 15px; position: relative; width: 100%; }
.input-row { display: flex; gap: 10px; }
.stylish-input {
  width: 100%;
  padding: 12px 15px;
  border: 1px solid #eee;
  background: #fcfcfc;
  border-radius: 12px;
  font-size: 1rem;
  box-sizing: border-box;
}
.stylish-input:focus { outline: none; border-color: #fd4376; background: white; }
.unit {
  position: absolute;
  right: 15px; top: 50%; transform: translateY(-50%);
  color: #aaa; font-size: 0.8rem; pointer-events: none;
}
.submit-btn {
  width: 100%;
  background: linear-gradient(135deg, #fd4376 0%, #ff8090 100%);
  color: white; border: none; padding: 14px; border-radius: 50px;
  font-size: 1rem; font-weight: bold; cursor: pointer;
  box-shadow: 0 4px 15px rgba(253, 67, 118, 0.3);
}
.submit-btn:disabled { opacity: 0.7; cursor: not-allowed; }

/* リスト */
.section-title { font-size: 1.1rem; color: #333; margin-bottom: 15px; padding-left: 5px; }
.cosmetic-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
.cosmetic-card {
  background: white; border-radius: 16px; padding: 15px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.03);
  display: flex; flex-direction: column; align-items: center; text-align: center;
}
.image-placeholder {
  width: 60px; height: 60px; background: #f0f0f0; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.5rem; color: #ccc; margin-bottom: 10px;
}
.cosmetic-info h4 { margin: 0 0 10px; font-size: 0.95rem; color: #333; }
.progress-bar-bg { width: 100%; height: 6px; background: #eee; border-radius: 3px; overflow: hidden; margin-bottom: 5px; }
.progress-bar-fill { height: 100%; background: #fd4376; border-radius: 3px; }
.amount-text { font-size: 0.75rem; color: #888; margin: 0; }
</style>