<template>
  <div class="backup-container">
    <h2>数据库备份 (WebDAV)</h2>
    <form @submit.prevent="onSubmit" class="backup-form">
      <div class="field">
        <label for="url">WebDAV 地址</label>
        <input id="url" v-model="url" type="text" placeholder="https://example.com/remote.php/webdav/" required />
      </div>
      <div class="field">
        <label for="username">WebDAV 用户名</label>
        <input id="username" v-model="username" type="text" required />
      </div>
      <div class="field">
        <label for="password">WebDAV 密码</label>
        <input id="password" v-model="password" type="password" required />
      </div>
      <div class="field">
        <label for="subdir">远程子目录 (可选)</label>
        <input id="subdir" v-model="subdir" type="text" placeholder="例如 backups/2025" />
      </div>
      <div class="actions">
        <button type="submit" class="primary-button">立即备份</button>
      </div>
      <p v-if="message" :class="{'success': success, 'error': !success}">{{ message }}</p>
    </form>
    <TwoFactorPrompt
      :show="showPrompt"
      title="输入验证码以开始备份"
      @confirm="onConfirm"
      @cancel="onCancel"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { api } from '@/stores/auth';
import TwoFactorPrompt from '@/components/TwoFactorPrompt.vue';

const url = ref('');
const username = ref('');
const password = ref('');
const subdir = ref('');
const message = ref('');
const success = ref(false);
const showPrompt = ref(false);

let pendingBackupData = null;

function onSubmit() {
  message.value = '';
  // Store credentials temporarily and show prompt
  pendingBackupData = { url: url.value, username: username.value, password: password.value, subdir: subdir.value };
  showPrompt.value = true;
}

async function onConfirm(code) {
  showPrompt.value = false;
  try {
    const res = await api.post('/backup', { ...pendingBackupData, totpCode: code });
    message.value = (res.data.message || '备份完成') + (res.data.path ? ` (路径: ${res.data.path})` : '');
    success.value = true;
  } catch (e) {
    message.value = e.response?.data?.message || '备份失败';
    success.value = false;
  }
  pendingBackupData = null;
}

function onCancel() {
  showPrompt.value = false;
  pendingBackupData = null;
}
</script>

<style scoped>
.backup-container {
  max-width: 500px;
  margin: 2rem auto;
  background: #ffffff;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.04);
}
.backup-form {
  display: flex;
  flex-direction: column;
}
.field {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
}
label {
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
}
input {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.2s;
}
input:focus {
  outline: none;
  border-color: #007aff;
}
.actions {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
}
.primary-button {
  background-color: #007aff;
  color: white;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s;
}
.primary-button:hover {
  background-color: #0060d3;
}
.success {
  color: #388e3c;
  margin-top: 0.5rem;
}
.error {
  color: #d32f2f;
  margin-top: 0.5rem;
}
</style>