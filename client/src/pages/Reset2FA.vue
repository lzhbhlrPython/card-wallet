<template>
  <div class="reset2fa-container">
    <h2>重置 TOTP</h2>
    <div v-if="step === 1" class="step">
      <p>此操作将生成新的 TOTP 秘钥，需要用新二维码在身份验证器中重新添加账号。</p>
      <p class="warn">重置后旧的验证码将全部失效，请确保可以立即访问新秘钥。</p>
      <div class="field">
        <label for="password">请输入账号密码以确认重绑</label>
        <input id="password" v-model="password" type="password" placeholder="账号密码" />
      </div>
      <button class="primary-button" @click="initReset" :disabled="loading">{{ loading ? '处理中...' : '生成新密钥' }}</button>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
    <div v-else-if="step === 2" class="step">
      <p>请使用身份验证器扫描下方二维码或手动导入。</p>
      <div v-if="qrCode" class="qr"><img :src="qrCode" alt="QR" /></div>
      <p class="mono" v-if="otpauthUrl">{{ otpauthUrl }}</p>
      <div class="actions">
        <button class="primary-button" @click="finish" :disabled="loading">完成</button>
        <button class="secondary-button" @click="cancel">取消</button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
    <div v-else-if="step === 3" class="step">
      <p class="success">TOTP 重置已生成，请使用新秘钥登录。</p>
      <button class="primary-button" @click="back">返回</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { api } from '@/stores/auth';

const step = ref(1);
const qrCode = ref('');
const otpauthUrl = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function initReset() {
  error.value = '';
  loading.value = true;
  try {
    if (!password.value) { error.value = '请输入账号密码'; loading.value = false; return; }
    const res = await api.post('/2fa/reset/init', { password: password.value });
    qrCode.value = res.data.qrCode;
    otpauthUrl.value = res.data.otpauth_url;
    step.value = 2;
  } catch (e) {
    error.value = e.response?.data?.message || '生成失败';
  } finally {
    loading.value = false;
  }
}

function finish() {
  step.value = 3;
}

function cancel() { step.value = 1; qrCode.value = ''; otpauthUrl.value=''; code.value=''; error.value=''; }
function back() { step.value = 1; qrCode.value=''; otpauthUrl.value=''; code.value=''; error.value=''; }
</script>

<style scoped>
.reset2fa-container { max-width:520px; margin:2rem auto; background:#fff; padding:2rem; border-radius:12px; box-shadow:0 4px 8px rgba(0,0,0,0.06); }
h2 { margin-top:0; }
.step { display:flex; flex-direction:column; gap:0.75rem; }
.warn { color:#b58900; font-size:0.8rem; }
.field { display:flex; flex-direction:column; gap:0.25rem; }
input { padding:0.5rem; border:1px solid #d1d5db; border-radius:8px; }
input:focus { outline:none; border-color:#007aff; }
.actions { display:flex; gap:0.75rem; }
.primary-button, .secondary-button { padding:0.5rem 1rem; border-radius:8px; cursor:pointer; font-size:0.85rem; }
.primary-button { background:#007aff; color:#fff; border:none; }
.primary-button:disabled { opacity:0.6; cursor:not-allowed; }
.secondary-button { background:none; color:#007aff; border:1px solid #d1d5db; }
.secondary-button:hover { background:#f3f4f6; }
.error { color:#d32f2f; font-size:0.75rem; }
.success { color:#388e3c; font-size:0.85rem; }
.qr img { width:180px; height:180px; border:1px solid #eee; border-radius:8px; }
.mono { font-family:Menlo,monospace; font-size:0.7rem; word-break:break-all; background:#f8f9fa; padding:0.5rem; border-radius:6px; }
</style>
