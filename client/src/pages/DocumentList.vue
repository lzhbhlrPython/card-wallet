<template>
  <div class="document-list-container">
    <div class="header">
      <h2>我的证件</h2>
      <div class="header-actions">
        <button class="primary-button" @click="refreshDocuments" :disabled="loading || refreshing">
          {{ refreshing ? '刷新中...' : '刷新' }}
        </button>
        <router-link to="/documents/new" class="primary-button">新增证件</router-link>
      </div>
    </div>
    <div class="filters enhanced">
      <div class="filter-group">
        <label class="filter-label">证件类型</label>
        <InlineFilterSelect
          v-model="typeFilter"
          :options="allTypesForOptions"
          placeholder="类型"
          :multiple="true"
        />
      </div>
      <div class="filter-group sort-group">
        <span class="filter-label">排序</span>
        <div class="sort-radios">
          <div class="sort-radio">
            <input type="radio" id="sort-default" value="default" v-model="sortOption" />
            <label for="sort-default">默认</label>
          </div>
          <div class="sort-radio">
            <input type="radio" id="sort-type" value="type" v-model="sortOption" />
            <label for="sort-type">按类型</label>
          </div>
        </div>
      </div>
    </div>
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else>
      <div v-if="sortedDocuments.length === 0" class="empty">暂无证件。</div>
      <div v-else class="documents-grid">
        <DocumentItem
          v-for="doc in sortedDocuments"
          :key="doc.id"
          :document="doc"
          @view="viewDetails"
          @edit="goEdit"
          @delete="confirmDelete"
        />
      </div>
    </div>
    <!-- 输入 TOTP（用于查看详情 / 删除） -->
    <TwoFactorPrompt
      :show="showPrompt"
      :title="promptTitle"
      @confirm="handlePromptConfirm"
      @cancel="handlePromptCancel"
    />
    <!-- 详情弹窗 -->
    <div v-if="details" class="overlay">
      <div class="modal" :style="modalStyle(details)">
        <div class="modal-inner">
          <h3>证件详情</h3>
          <div class="detail-section">
            <div class="detail-label">证件类型</div>
            <div class="detail-value">{{ formatDocumentType(details.document_type) }}</div>
          </div>
          <div class="detail-section">
            <div class="detail-label">持有人姓名</div>
            <div class="detail-value">{{ details.holder_name }}</div>
          </div>
          <div v-if="details.holder_name_latin" class="detail-section">
            <div class="detail-label">拉丁转写</div>
            <div class="detail-value">{{ details.holder_name_latin }}</div>
          </div>
          <div class="detail-section">
            <div class="detail-label">证件号码</div>
            <div class="detail-value mono">{{ details.document_number }}</div>
            <button class="mini-btn" @click="copy(details.document_number, '证件号码')">复制</button>
          </div>
          <div v-if="details.issue_date" class="detail-section">
            <div class="detail-label">签发日期</div>
            <div class="detail-value mono">{{ formatDate(details.issue_date, details.expiry_date_format) }}</div>
            <button class="mini-btn" @click="copy(details.issue_date, '签发日期')">复制</button>
          </div>
          <div class="detail-section">
            <div class="detail-label">有效期至</div>
            <div class="detail-value mono">
              {{ details.expiry_date_permanent ? '长期' : formatDate(details.expiry_date, details.expiry_date_format) }}
            </div>
            <button v-if="!details.expiry_date_permanent" class="mini-btn" @click="copy(details.expiry_date, '有效期')">复制</button>
          </div>
          <div v-if="details.issue_place" class="detail-section">
            <div class="detail-label">签发地点</div>
            <div class="detail-value">{{ details.issue_place }}</div>
          </div>
          <div v-if="details.note" class="detail-section">
            <div class="detail-label">备注</div>
            <div class="detail-value" style="white-space:pre-wrap;">{{ details.note }}</div>
          </div>
          <div class="actions">
            <button class="primary-button" @click="details = null">关闭</button>
          </div>
          <div v-if="copyMessage" class="copy-toast">{{ copyMessage }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useDocumentsStore } from '@/stores/documents';
import TwoFactorPrompt from '@/components/TwoFactorPrompt.vue';
import InlineFilterSelect from '@/components/InlineFilterSelect.vue';
import DocumentItem from '@/components/DocumentItem.vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const documentsStore = useDocumentsStore();

const loading = ref(true);
const documents = ref([]);
const showPrompt = ref(false);
const promptTitle = ref('');
const pendingAction = ref(null);
const pendingDocId = ref(null);
const details = ref(null);
const refreshing = ref(false);
const typeFilter = ref([]);
const sortOption = ref('default');
const copyMessage = ref('');

const DOCUMENT_TYPE_MAP = {
  passport: '护照',
  id_card: '身份证',
  travel_permit: '出入境通行证',
  drivers_license: '驾驶证',
};

const DOCUMENT_TYPE_ORDER = ['passport', 'id_card', 'travel_permit', 'drivers_license'];

function formatDocumentType(type) {
  return DOCUMENT_TYPE_MAP[type] || type;
}

function formatDate(date, format) {
  if (!date) return '—';
  // date格式为 YYYY-MM-DD
  const parts = date.split(/[-/]/);
  if (parts.length !== 3) return date;
  
  const [year, month, day] = parts;
  if (format === 'MDY') {
    return `${month}/${day}/${year}`;
  } else if (format === 'DMY') {
    return `${day}/${month}/${year}`;
  } else {
    return `${year}-${month}-${day}`;
  }
}

const allTypes = computed(() => {
  const set = new Set();
  documents.value.forEach(d => { if (d.document_type) set.add(d.document_type); });
  return Array.from(set);
});

const allTypesForOptions = computed(() => {
  const present = new Set(allTypes.value);
  return DOCUMENT_TYPE_ORDER.filter(t => present.has(t)).map(t => ({
    value: t,
    label: formatDocumentType(t),
  }));
});

const filteredDocuments = computed(() => {
  return documents.value.filter(d => {
    const typeOk = !typeFilter.value.length || typeFilter.value.includes(d.document_type);
    return typeOk;
  });
});

const sortedDocuments = computed(() => {
  const list = [...filteredDocuments.value];
  if (sortOption.value === 'type') {
    list.sort((a, b) => {
      const ia = DOCUMENT_TYPE_ORDER.indexOf(a.document_type);
      const ib = DOCUMENT_TYPE_ORDER.indexOf(b.document_type);
      return ia - ib;
    });
  }
  return list;
});

async function refreshDocuments() {
  refreshing.value = true;
  const result = await documentsStore.fetchDocuments();
  if (result.ok) {
    documents.value = documentsStore.documents;
  } else {
    alert(result.message);
  }
  refreshing.value = false;
}

function viewDetails(id) {
  pendingAction.value = 'view';
  pendingDocId.value = id;
  promptTitle.value = '查看证件详情';
  showPrompt.value = true;
}

function goEdit(id) {
  router.push(`/documents/${id}/edit`);
}

function confirmDelete(id) {
  pendingAction.value = 'delete';
  pendingDocId.value = id;
  promptTitle.value = '删除证件';
  showPrompt.value = true;
}

async function handlePromptConfirm(code) {
  if (pendingAction.value === 'view') {
    const result = await documentsStore.fetchDocumentDetails(pendingDocId.value, code);
    if (result.ok) {
      details.value = result.data;
    } else {
      alert(result.message);
    }
  } else if (pendingAction.value === 'delete') {
    const result = await documentsStore.deleteDocument(pendingDocId.value, code);
    if (result.ok) {
      documents.value = documentsStore.documents;
      alert('删除成功');
    } else {
      alert(result.message);
    }
  }
  showPrompt.value = false;
  pendingAction.value = null;
  pendingDocId.value = null;
}

function handlePromptCancel() {
  showPrompt.value = false;
  pendingAction.value = null;
  pendingDocId.value = null;
}

function copy(text, label) {
  navigator.clipboard.writeText(text).then(() => {
    copyMessage.value = `${label}已复制`;
    setTimeout(() => { copyMessage.value = ''; }, 2000);
  });
}

// 生成基于证件信息的渐变背景（用于模态框）
function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { 
    h ^= s.charCodeAt(i); 
    h = Math.imul(h, 16777619) >>> 0; 
  }
  return h;
}

function modalStyle(details) {
  if (!details) return {};
  const seed = String(details.id || '') + '|' + (details.document_type || '');
  const h = hashString(seed);
  const h1 = (h % 360);
  const h2 = ((h >> 8) % 360);
  const sat = 62; 
  const light1 = 48; 
  const light2 = 64;
  const c1 = `hsl(${h1} ${sat}% ${light1}%)`;
  const c2 = `hsl(${h2} ${sat}% ${light2}%)`;
  return { 
    background: `linear-gradient(135deg, ${c1}, ${c2})`, 
    color: '#08233a', 
    boxShadow: '0 8px 30px rgba(10,30,50,0.25)' 
  };
}

onMounted(async () => {
  loading.value = true;
  await refreshDocuments();
  loading.value = false;
});
</script>

<style scoped>
.document-list-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.header h2 {
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.primary-button {
  background-color: #007aff;
  color: #fff;
  padding: 0.5rem 1rem;
  min-height: 40px;
  line-height: 1;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  text-decoration: none;
  transition: background-color 0.2s;
}

.header-actions .primary-button {
  padding: 0.5rem 1rem;
  min-height: 40px;
}

.primary-button:hover {
  background-color: #0060d3;
}

.primary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.filters {
  margin-bottom: 0.75rem;
  display: flex;
  gap: 1rem;
  align-items: center;
  font-size: 0.85rem;
}

.filters.enhanced {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: #f8f9fb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  flex-direction: column;
  min-width: 160px;
}

.filter-label {
  font-size: 0.7rem;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: #6b7280;
  margin-bottom: 0.25rem;
}

.sort-group {
  min-width: 200px;
}

.sort-radios {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.sort-radio {
  position: relative;
}

.sort-radio input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.sort-radio label {
  display: inline-flex;
  align-items: center;
  padding: 0.32rem 0.7rem;
  font-size: 0.7rem;
  letter-spacing: 0.5px;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 20px;
  cursor: pointer;
  user-select: none;
  line-height: 1;
  transition: background 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s;
}

.sort-radio input:checked + label {
  background: #007aff;
  color: #fff;
  border-color: #007aff;
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.15);
}

.sort-radio label:hover {
  border-color: #007aff;
}

.sort-radio input:focus-visible + label {
  outline: 2px solid #007aff;
  outline-offset: 2px;
}

.loading, .empty {
  text-align: center;
  padding: 40px;
  color: #666;
}

.documents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.mono {
  font-family: 'Courier New', monospace;
  letter-spacing: 1px;
}

.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 12px;
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  padding: 1.5rem;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
}

.modal-inner {
  background: linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.85));
  padding: 1rem;
  border-radius: 10px;
}

.modal-inner h3 {
  margin-top: 0;
  margin-bottom: 1rem;
}

.detail-section {
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.detail-label {
  font-weight: 600;
  color: #666;
  font-size: 0.85rem;
  min-width: 80px;
  flex-shrink: 0;
}

.detail-value {
  color: #333;
  font-size: 0.9rem;
  flex: 1;
}

.mono {
  font-family: 'SF Mono', 'Menlo', monospace;
}

.mini-btn {
  background: #1a88ff;
  border: 1px solid #1474d6;
  color: #fff;
  font-size: 0.65rem;
  padding: 3px 8px;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.15s;
}

.mini-btn:hover {
  background: #0f75e3;
}

.mini-btn:active {
  background: #0b5fb8;
}

.actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.copy-toast {
  position: absolute;
  bottom: 12px;
  right: 16px;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  padding: 4px 10px;
  font-size: 0.65rem;
  border-radius: 12px;
  animation: fadeIn 0.2s;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
