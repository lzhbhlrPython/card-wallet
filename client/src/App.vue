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
          <router-link to="/backup" class="nav-link">备份</router-link>
          <router-link to="/2fa-reset" class="nav-link">重置TOTP</router-link>
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
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth';

const authStore = useAuthStore();
const router = useRouter();
const isAuthenticated = computed(() => !!authStore.token);

function logout() {
  authStore.logout();
  router.push({ path: '/login' });
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
.main-content {
  flex: 1;
  max-width: 800px;
  width: 100%;
  margin: 0 auto;
  padding: 1rem;
}
</style>