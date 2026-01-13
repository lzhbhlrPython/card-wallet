<template>
  <div class="auth-container">
    <h2>登录</h2>
    <!-- 新增：登录过期信息提示 -->
    <p v-if="expiredMessage" class="info">{{ expiredMessage }}</p>
    <form @submit.prevent="onSubmit" class="form">
      <div class="field">
        <label for="username">用户名</label>
        <input id="username" v-model="username" type="text" required autofocus />
      </div>
      <div class="field">
        <label for="password">密码</label>
        <input id="password" v-model="password" type="password" required />
      </div>
      <transition name="fade">
        <div v-if="requireTotp" class="field">
          <label for="totp">动态验证码</label>
          <input id="totp" v-model="totpCode" type="text" inputmode="numeric" pattern="\d*" autocomplete="one-time-code" required />
        </div>
      </transition>
      <div class="actions">
        <button type="submit" class="primary-button">登录</button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </form>
    <p class="secondary">
      还没有账号？
      <router-link to="/register">去注册</router-link>
    </p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { md5 } from '@/utils/md5';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const username = ref('');
const password = ref('');
const totpCode = ref('');
const requireTotp = ref(false);
const error = ref('');

// 新增：根据 URL 查询参数判断是否为 token 过期自动跳转
const expired = computed(() => route.query.expired === '1');
const expiredMessage = computed(() => expired.value ? '登录已过期或凭证失效，请重新登录。' : '');

onMounted(() => {
  // 如果是过期情况，不把它当作错误（避免红色惊吓），保持 info 颜色，同时清空 error
  if (expired.value) error.value = '';
});

async function onSubmit() {
  error.value = '';
  const passwordMd5 = md5(password.value);
  const response = await auth.login(username.value, passwordMd5, requireTotp.value ? totpCode.value : undefined);
  if (response.ok) {
    const redirect = route.query.redirect || '/cards';
    router.push(redirect);
  } else if (response.twoFactorRequired) {
    requireTotp.value = true;
    error.value = '需要动态验证码，请输入认证器中的 6 位数字。';
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
.form { display: flex; flex-direction: column; }
.field { margin-bottom: 1rem; display: flex; flex-direction: column; }
label { margin-bottom: 0.25rem; font-size: 0.875rem; }
input { padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 8px; font-size: 1rem; transition: border-color 0.2s; }
input:focus { outline: none; border-color: #007aff; }
.actions { margin-top: 1rem; display: flex; justify-content: flex-end; }
.primary-button { background-color: #007aff; color: white; padding: 0.5rem 1rem; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer; transition: background-color 0.2s; }
.primary-button:hover { background-color: #0060d3; }
.error { margin-top: 0.5rem; color: #d32f2f; font-size: 0.875rem; }
.secondary { margin-top: 1rem; font-size: 0.875rem; text-align: center; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
/* 新增 info 提示样式 */
.info { margin-bottom: 0.75rem; padding: 0.5rem 0.75rem; background:#f0f7ff; border:1px solid #b6ddff; color:#05528c; border-radius:6px; font-size:0.8125rem; }
</style>