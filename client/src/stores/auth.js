import { defineStore } from 'pinia';
import axios from 'axios';

// 全局 axios 实例：设置基础地址和超时时间，便于统一管理接口调用
const api = axios.create({
  baseURL: 'http://localhost:3000',
  timeout: 10000,
});

// 页面刷新后 Pinia 状态丢失，但 localStorage 中仍保留 token。
// /cards 接口的服务器鉴权需要 Authorization 头，此处在模块初始化时恢复。
const existingToken = localStorage.getItem('token');
if (existingToken) {
  api.defaults.headers.common['Authorization'] = `Bearer ${existingToken}`;
}

// 统一处理 token 过期 / 无效：后端返回 401 时自动登出并跳转登录。
// 不能在模块初始化时立即调用 useAuthStore（Pinia 尚未创建），因此在拦截器内部惰性获取。
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      try {
        const { useAuthStore } = require('./auth'); // 自引用获取定义的 store
        const authStore = useAuthStore();
        if (authStore.token) {
          authStore.logout();
          // 带上过期标记，便于登录页提示
          if (window?.location) {
            const url = new URL(window.location.origin + '/login');
            url.searchParams.set('expired', '1');
            window.location.href = url.toString();
          }
        }
      } catch (e) {
        // 静默失败，避免因 Pinia 尚未就绪导致的错误中断原始 promise
      }
    }
    return Promise.reject(error);
  }
);

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    username: localStorage.getItem('username') || '',
    twoFactorEnabled: JSON.parse(localStorage.getItem('twoFactorEnabled') || 'false'),
    setupInfo: null, // 2FA 设置流程中暂存二维码与 otpauth URL
  }),
  actions: {
    // 用户注册
    async register(username, password) {
      try {
        await api.post('/register', { username, password });
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e.response?.data?.message || '注册失败' };
      }
    },
    // 用户登录；如启用 2FA 且需要验证码，则不保存 token 直接提示前端继续输入验证码
    async login(username, password, totpCode) {
      try {
        const response = await api.post('/login', { username, password, totpCode });
        const { token, twoFactorEnabled } = response.data;
        this.token = token;
        this.username = username;
        this.twoFactorEnabled = twoFactorEnabled;
        localStorage.setItem('token', token);
        localStorage.setItem('username', username);
        localStorage.setItem('twoFactorEnabled', JSON.stringify(twoFactorEnabled));
        // 设置后续请求默认鉴权头
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        return { ok: true };
      } catch (e) {
        if (e.response?.data?.twoFactorRequired) {
          return { ok: false, twoFactorRequired: true, message: e.response.data.message };
        }
        return { ok: false, message: e.response?.data?.message || '登录失败' };
      }
    },
    // 退出登录：清除本地状态与存储
    logout() {
      this.token = '';
      this.username = '';
      this.twoFactorEnabled = false;
      this.setupInfo = null;
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      localStorage.removeItem('twoFactorEnabled');
      delete api.defaults.headers.common['Authorization'];
    },
    // 发起 2FA 设置：向服务器申请密钥与二维码
    async initiate2FA() {
      try {
        const response = await api.get('/2fa/setup', {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        this.setupInfo = response.data;
        return { ok: true, data: response.data };
      } catch (e) {
        return { ok: false, message: e.response?.data?.message || '启动 2FA 失败' };
      }
    },
    // 验证 2FA：提交验证码，成功后更新状态
    async verify2FA(code) {
      try {
        await api.post(
          '/2fa/verify',
          { code },
          { headers: { Authorization: `Bearer ${this.token}` } }
        );
        this.twoFactorEnabled = true;
        localStorage.setItem('twoFactorEnabled', JSON.stringify(true));
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e.response?.data?.message || '2FA 验证失败' };
      }
    },
  },
});

// 导出已配置好的 axios 实例，供其他模块复用
export { api };