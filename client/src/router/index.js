import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

// Lazy loaded route components.  Splitting the pages into chunks
// improves initial load time and allows for better caching.  Each
// component corresponds to a view under `pages/`.
const Login = () => import('@/pages/Login.vue');
const Register = () => import('@/pages/Register.vue');
const Setup2FA = () => import('@/pages/Setup2FA.vue');
const CardList = () => import('@/pages/CardList.vue');
const CardForm = () => import('@/pages/CardForm.vue');
const Backup = () => import('@/pages/Backup.vue');
const CardDetails = () => import('@/pages/CardDetails.vue');
const Reset2FA = () => import('@/pages/Reset2FA.vue');

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/cards' },
    { path: '/login', component: Login },
    { path: '/register', component: Register },
    { path: '/setup-2fa', component: Setup2FA, meta: { requiresAuth: true } },
    { path: '/cards', component: CardList, meta: { requiresAuth: true } },
    { path: '/cards/new', component: CardForm, meta: { requiresAuth: true } },
    { path: '/cards/:id/edit', component: CardForm, props: true, meta: { requiresAuth: true } },
    { path: '/cards/:id', component: CardDetails, props: true, meta: { requiresAuth: true } },
    { path: '/backup', component: Backup, meta: { requiresAuth: true } },
    { path: '/2fa-reset', component: Reset2FA, meta: { requiresAuth: true } },
  ],
});

// Global navigation guard.  Redirects unauthenticated users to the
// login page.  If the user is logged in but has not completed 2FA
// setup, redirect to the setup page unless they are already on it.
router.beforeEach((to, from, next) => {
  const auth = useAuthStore();
  // Wait for Pinia store to be initialised in SSR/hydration
  if (to.matched.some(record => record.meta.requiresAuth)) {
    if (!auth.token) {
      return next({ path: '/login', query: { redirect: to.fullPath } });
    }
    // If the user does not have two‑factor enabled and is going to a
    // protected route other than setup, force them to set it up first.
    if (!auth.twoFactorEnabled && to.path !== '/setup-2fa') {
      return next({ path: '/setup-2fa' });
    }
  }
  // 若已登出且访问除登录/注册以外的任意路由，统一跳转登录
  if (!auth.token && !['/login','/register'].includes(to.path)) {
    return next({ path: '/login', query: { redirect: to.fullPath } });
  }
  next();
});

export default router;