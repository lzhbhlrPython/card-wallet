<template>
  <div id="app" class="app-container">
    <!-- Simple navigation bar.  We conditionally show links when
         authenticated.  The logout button clears the auth store.
         Using a nav element helps screen readers understand the
         structure of the page. -->
    <nav class="navbar">
      <div class="nav-content">
        <span class="brand">卡片管理</span>
        <div class="spacer"></div>
        <template v-if="isAuthenticated">
          <router-link to="/cards" class="nav-link">卡片</router-link>
          <router-link to="/fps" class="nav-link">转数快</router-link>
          <router-link to="/backup" class="nav-link">备份</router-link>
          <router-link to="/2fa-reset" class="nav-link">重置TOTP</router-link>
          <button class="danger-link" @click="showPurge = true">清空所有卡片</button>
          <button class="link-button" @click="logout">登出</button>
        </template>
        <template v-else>
          <router-link to="/login" class="nav-link">登录</router-link>
          <router-link to="/register" class="nav-link">注册</router-link>
        </template>
      </div>
    </nav>
    <!-- Main outlet -->
    <main class="main-content">
      <router-view />
    </main>

    <div v-if="showPurge" class="modal-backdrop" @click.self="closePurge">
      <div class="modal">
        <h3 class="modal-title">清空所有卡片</h3>
        <p class="modal-desc">此操作将删除当前账户的全部卡片记录，且不可恢复。请再次确认。</p>
        <form @submit.prevent="submitPurge" class="form">
          <label class="field">
            <span>主密码</span>
            <input v-model="purgePassword" type="password" required placeholder="输入登录密码" />
          </label>
          <label v-if="authStore.twoFactorEnabled" class="field">
            <span>2FA 验证码</span>
            <input v-model="purgeTotp" inputmode="numeric" pattern="\d{6}" maxlength="6" placeholder="6位验证码" />
          </label>
          <div class="actions">
            <button type="button" class="btn secondary" @click="closePurge">取消</button>
            <button type="submit" class="btn danger" :disabled="purging">{{ purging ? '执行中...' : '确认清空' }}</button>
          </div>
          <p v-if="purgeError" class="error-text">{{ purgeError }}</p>
          <p v-if="purgeSuccess" class="success-text">已清空 {{ purgeDeleted }} 条。</p>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { useCardsStore } from './stores/cards';

const authStore = useAuthStore();
const cardsStore = useCardsStore();
const router = useRouter();
const isAuthenticated = computed(() => !!authStore.token);

const showPurge = ref(false);
const purgePassword = ref('');
const purgeTotp = ref('');
const purgeError = ref('');
const purgeSuccess = ref(false);
const purgeDeleted = ref(0);
const purging = ref(false);

function logout() {
  authStore.logout();
  router.push({ path: '/login' });
}
function closePurge() {
  if (purging.value) return;
  showPurge.value = false;
  purgePassword.value = '';
  purgeTotp.value = '';
  purgeError.value = '';
  purgeSuccess.value = false;
  purgeDeleted.value = 0;
}
async function submitPurge() {
  purgeError.value = '';
  purgeSuccess.value = false;
  purging.value = true;
  const res = await cardsStore.purgeAll(purgePassword.value, purgeTotp.value);
  purging.value = false;
  if (res.ok) {
    purgeSuccess.value = true;
    purgeDeleted.value = res.data.deleted || 0;
    // 清空成功后 2 秒自动关闭
    setTimeout(closePurge, 2000);
  } else {
    purgeError.value = res.message || '清空失败';
  }
}
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: #f9f9fb;
  color: #333;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
}

.navbar {
  background-color: #ffffff;
  border-bottom: 1px solid #e0e0e5;
  padding: 0.5rem 1rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.nav-content {
  display: flex;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
}
.brand {
  font-weight: 600;
  font-size: 1.25rem;
}
.spacer {
  flex: 1;
}
.nav-link {
  margin-right: 1rem;
  text-decoration: none;
  color: #007aff;
  font-weight: 500;
}
.nav-link:hover {
  text-decoration: underline;
}
.link-button {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: #007aff;
  cursor: pointer;
}
.danger-link {
  background: none;
  border: none;
  padding: 0;
  margin-right: 1rem;
  font: inherit;
  color: #d90000;
  cursor: pointer;
  font-weight: 600;
}
.danger-link:hover { text-decoration: underline; }
.main-content {
  flex: 1;
  max-width: 800px;
  width: 100%;
  margin: 0 auto;
  padding: 1rem;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}
.modal {
  background: #fff;
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
  animation: pop .18s ease-out;
}
@keyframes pop {
  from {
    transform: scale(.92);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
.modal-title {
  margin: 0 0 .5rem;
  font-size: 1.15rem;
  font-weight: 600;
}
.modal-desc {
  margin: 0 0 1rem;
  font-size: .875rem;
  line-height: 1.4;
  color: #555;
}
.field {
  display: flex;
  flex-direction: column;
  margin-bottom: .75rem;
}
.field span {
  font-size: .75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .5px;
  color: #444;
  margin-bottom: .25rem;
}
.field input {
  border: 1px solid #ccd1d9;
  border-radius: 6px;
  padding: .55rem .65rem;
  font-size: .9rem;
  outline: none;
  transition: border .15s, box-shadow .15s;
}
.field input:focus {
  border-color: #007aff;
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.15);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: .75rem;
  margin-top: .25rem;
}
.btn {
  font: inherit;
  border: none;
  border-radius: 6px;
  padding: .55rem 1rem;
  cursor: pointer;
  font-size: .85rem;
  font-weight: 600;
  letter-spacing: .3px;
  display: inline-flex;
  align-items: center;
}
.btn.secondary {
  background: #f1f3f5;
  color: #333;
}
.btn.secondary:hover {
  background: #e6e8ea;
}
.btn.danger {
  background: #d90000;
  color: #fff;
}
.btn.danger:hover {
  background: #c40000;
}
.btn:disabled {
  opacity: .55;
  cursor: not-allowed;
}
.error-text {
  color: #d90000;
  font-size: .75rem;
  margin: .5rem 0 0;
}
.success-text {
  color: #059669;
  font-size: .75rem;
  margin: .5rem 0 0;
}
</style>