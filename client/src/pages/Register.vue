<template>
  <div class="auth-container">
    <h2>注册</h2>
    <form @submit.prevent="onSubmit" class="form">
      <div class="field">
        <label for="username">用户名</label>
        <input id="username" v-model="username" type="text" required autofocus />
      </div>
      <div class="field">
        <label for="password">密码</label>
        <input id="password" v-model="password" type="password" required />
      </div>
      <div class="field">
        <label for="confirm">确认密码</label>
        <input id="confirm" v-model="confirm" type="password" required />
      </div>
      <div class="actions">
        <button type="submit" class="primary-button">注册</button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="success" class="success">注册成功，请 <router-link to="/login">前往登录</router-link>。</p>
    </form>
    <p class="secondary">
      已有账号？
      <router-link to="/login">去登录</router-link>
    </p>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const username = ref('');
const password = ref('');
const confirm = ref('');
const error = ref('');
const success = ref(false);

async function onSubmit() {
  error.value = '';
  success.value = false;
  if (password.value !== confirm.value) {
    error.value = '两次输入的密码不一致';
    return;
  }
  const response = await auth.register(username.value, password.value);
  if (response.ok) {
    success.value = true;
    username.value = '';
    password.value = '';
    confirm.value = '';
  } else {
    error.value = response.message;
  }
}
</script>

<style scoped>
.auth-container {
  max-width: 400px;
  margin: 2rem auto;
  background: #ffffff;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.04);
}
.form {
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
.error {
  margin-top: 0.5rem;
  color: #d32f2f;
  font-size: 0.875rem;
}
.success {
  margin-top: 0.5rem;
  color: #388e3c;
  font-size: 0.875rem;
}
.secondary {
  margin-top: 1rem;
  font-size: 0.875rem;
  text-align: center;
}
</style>