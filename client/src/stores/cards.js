import { defineStore } from 'pinia';
import { api } from './auth';

// 管理卡片的 Pinia Store。所有方法都捕获接口错误并返回统一的 { ok, message } 结构。
// 添加 / 更新 / 删除后会刷新本地列表。完整卡详情仅在需要时单独请求。
export const useCardsStore = defineStore('cards', {
  state: () => ({
    cards: [],
  }),
  actions: {
    async fetchCards() {
      try {
        const response = await api.get('/cards');
        this.cards = response.data;
        localStorage.setItem('cards', JSON.stringify(this.cards));
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e.response?.data?.message || '加载卡片失败' };
      }
    },
    async addCard(card) {
      try {
        const response = await api.post('/cards', card);
        // 服务端返回 id 与 network，随后刷新列表
        await this.fetchCards();
        return { ok: true, id: response.data.id };
      } catch (e) {
        return { ok: false, message: e.response?.data?.message || '新增卡片失败' };
      }
    },
    async updateCard(id, data, totpCode) {
      try {
        await api.put(`/cards/${id}`, { ...data, totpCode });
        await this.fetchCards();
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e.response?.data?.message || '更新卡片失败' };
      }
    },
    async deleteCard(id, totpCode) {
      try {
        await api.delete(`/cards/${id}`, { params: { totpCode } });
        await this.fetchCards();
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e.response?.data?.message || '删除卡片失败' };
      }
    },
    async fetchCardDetails(id, totpCode) {
      try {
        const response = await api.get(`/cards/${id}`, { params: { totpCode } });
        return { ok: true, data: response.data };
      } catch (e) {
        return { ok: false, message: e.response?.data?.message || '加载卡片详情失败' };
      }
    },
    async purgeAll(masterPassword, totpCode) {
      try {
        const response = await api.post('/cards/purge', { masterPassword, totpCode });
        this.cards = [];
        localStorage.removeItem('cards');
        return { ok: true, data: response.data };
      } catch (e) {
        return { ok: false, message: e.response?.data?.message || '清空失败' };
      }
    }
  },
});