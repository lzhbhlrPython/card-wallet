<template>
  <div class="setup-container">
    <h2>启用双重验证 (2FA)</h2>
    <p>使用认证器应用（如 Microsoft Authenticator 或 Google Authenticator）扫描下方二维码，然后输入当前 6 位验证码。</p>
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="setupInfo" class="setup-info">
      <img :src="setupInfo.qrCode" alt="二维码" class="qr" />
      <p class="code-text">无法扫码？请手动在认证器中输入以下键值：</p>
      <div class="secret-box">{{ setupInfo.otpauth_url }}</div>
      <form @submit.prevent="verify" class="verify-form">
        <label for="code">验证码</label>
        <input id="code" v-model="code" type="text" inputmode="numeric" pattern="\d*" required />
        <button type="submit" class="primary-button">验证并启用</button>
        <p v-if="error" class="error">{{ error }}</p>
      </form>
    </div>
    <div v-else class="error">无法加载 2FA 初始化信息。</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const loading = ref(true);
const setupInfo = ref(null);
const code = ref('');
const error = ref('');

onMounted(async () => {
  const result = await auth.initiate2FA();
  if (result.ok) {
    setupInfo.value = result.data;
  } else {
    error.value = result.message;
  }
  loading.value = false;
});

async function verify() {
  error.value = '';
  const result = await auth.verify2FA(code.value);
  if (result.ok) {
    router.push('/cards');
  } else {
    error.value = result.message;
  }
}
</script>

<style scoped>
.setup-container {
  max-width: 500px;
  margin: 2rem auto;
  background: #ffffff;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.04);
}
h2 {
  margin-bottom: 1rem;
}
.loading {
  text-align: center;
}
.setup-info {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.qr {
  width: 200px;
  height: 200px;
  margin-bottom: 1rem;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}
.code-text {
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
  text-align: center;
}
.secret-box {
  word-break: break-all;
  background: #f0f2f5;
  padding: 0.5rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-size: 0.75rem;
  width: 100%;
}
.verify-form {
  display: flex;
  flex-direction: column;
  width: 100%;
  align-items: center;
}
.verify-form input {
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  width: 100%;
}
.verify-form .primary-button {
  background-color: #007aff;
  color: white;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s;
}
.verify-form .primary-button:hover {
  background-color: #0060d3;
}
.error {
  color: #d32f2f;
  margin-top: 0.5rem;
  font-size: 0.875rem;
}
</style>