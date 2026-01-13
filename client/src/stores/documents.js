import { defineStore } from 'pinia';
import { api } from './auth';

// 管理证件的 Pinia Store。遵循与 cards store 相同的模式。
// 列表接口返回掩码后的数据；完整详情需要 2FA 验证。
export const useDocumentsStore = defineStore('documents', {
  state: () => ({
    documents: [],
  }),
  actions: {
    async fetchDocuments() {
      try {
        const response = await api.get('/documents');
        this.documents = response.data;
        localStorage.setItem('documents', JSON.stringify(this.documents));
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e.response?.data?.message || '加载证件失败' };
      }
    },
    async addDocument(document) {
      try {
        const response = await api.post('/documents', document);
        await this.fetchDocuments();
        return { ok: true, id: response.data.id };
      } catch (e) {
        return { ok: false, message: e.response?.data?.message || '新增证件失败' };
      }
    },
    async updateDocument(id, data, totpCode) {
      try {
        await api.put(`/documents/${id}`, { ...data, totpCode });
        await this.fetchDocuments();
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e.response?.data?.message || '更新证件失败' };
      }
    },
    async deleteDocument(id, totpCode) {
      try {
        await api.delete(`/documents/${id}`, { params: { totpCode } });
        await this.fetchDocuments();
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e.response?.data?.message || '删除证件失败' };
      }
    },
    async fetchDocumentDetails(id, totpCode) {
      try {
        const response = await api.get(`/documents/${id}`, { params: { totpCode } });
        return { ok: true, data: response.data };
      } catch (e) {
        return { ok: false, message: e.response?.data?.message || '加载证件详情失败' };
      }
    },
  },
});
