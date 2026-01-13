<template>
  <div class="form-container">
    <h2>{{ isEdit ? '编辑证件' : '新增证件' }}</h2>
    <form @submit.prevent="onSubmit" class="document-form">
      <div class="field">
        <label for="documentType">证件类型</label>
        <BankSelect
          v-model="documentTypeText"
          :options="documentTypeOptions"
          placeholder="选择证件类型"
          :readonly="true"
          :allow-create="false"
          :allow-clear="false"
        />
      </div>
      <div class="field">
        <label for="holderName">持有人姓名</label>
        <input
          id="holderName"
          v-model="holderName"
          type="text"
          placeholder="持有人本国语言姓名"
          required
        />
      </div>
      <div class="field">
        <label for="holderNameLatin">姓名（拉丁转写）</label>
        <input
          id="holderNameLatin"
          v-model="holderNameLatin"
          type="text"
          placeholder="可选：国际证件的拉丁字母转写"
        />
        <small class="hint">国际证件建议填写拉丁字母转写（如护照）</small>
      </div>
      <div class="field">
        <label for="documentNumber">证件号码</label>
        <input
          id="documentNumber"
          v-model="documentNumber"
          type="text"
          placeholder="证件号码"
          required
        />
      </div>
      <div class="field">
        <label>签发日期</label>
        <Calendar
          v-model="issueDate"
          placeholder="选择签发日期（可选）"
          :format="expiryDateFormat"
        />
      </div>
      <div class="field">
        <label>有效期至</label>
        <Calendar
          v-model="expiryDate"
          v-model:permanent="expiryDatePermanent"
          placeholder="选择有效期"
          :allow-permanent="true"
          :format="expiryDateFormat"
        />
        <small class="hint">选择有效期截止日期，或勾选"长期"</small>
      </div>
      <div class="field">
        <label for="expiryDateFormat">日期显示格式</label>
        <BankSelect
          v-model="expiryDateFormatText"
          :options="dateFormatOptions"
          placeholder="选择日期格式"
          :readonly="true"
          :allow-create="false"
          :allow-clear="false"
        />
      </div>
      <div class="field">
        <label for="issuePlace">签发地点</label>
        <input
          id="issuePlace"
          v-model="issuePlace"
          type="text"
          placeholder="可选：证件签发地点"
        />
      </div>
      <div class="field">
        <label for="note">备注</label>
        <textarea
          id="note"
          v-model="note"
          rows="3"
          placeholder="可选：其他备注信息 (最多500字)"
          maxlength="500"
        />
      </div>
      <div class="actions">
        <button type="submit" class="primary-button">{{ isEdit ? '更新' : '添加' }}</button>
        <router-link to="/documents" class="secondary-button">取消</router-link>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </form>
    <TwoFactorPrompt
      v-if="isEdit"
      :show="showPrompt"
      :title="promptTitle"
      @confirm="handlePromptConfirm"
      @cancel="handlePromptCancel"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useDocumentsStore } from '@/stores/documents';
import TwoFactorPrompt from '@/components/TwoFactorPrompt.vue';
import BankSelect from '@/components/BankSelect.vue';
import Calendar from '@/components/Calendar.vue';

const documentsStore = useDocumentsStore();
const router = useRouter();
const route = useRoute();

const docId = route.params.id;
const isEdit = computed(() => !!docId);

const documentType = ref('');
const documentTypeText = ref('');
const holderName = ref('');
const holderNameLatin = ref('');
const documentNumber = ref('');
const issueDate = ref('');
const expiryDate = ref('');
const expiryDatePermanent = ref(false);
const expiryDateFormat = ref('YMD');
const expiryDateFormatText = ref('年/月/日 (YMD)');
const issuePlace = ref('');
const note = ref('');
const error = ref('');

const showPrompt = ref(false);
const promptTitle = ref('');
const pendingData = ref(null);

const documentTypeOptions = [
  { value: 'passport', label: '护照' },
  { value: 'id_card', label: '身份证（ID卡）' },
  { value: 'travel_permit', label: '出入境通行证' },
  { value: 'drivers_license', label: '驾驶证' }
].map(item => item.label);

const dateFormatOptions = [
  '年/月/日 (YMD)',
  '月/日/年 (MDY)',
  '日/月/年 (DMY)'
];

function documentTypeToText(v) {
  if (v === 'passport') return '护照';
  if (v === 'id_card') return '身份证（ID卡）';
  if (v === 'travel_permit') return '出入境通行证';
  if (v === 'drivers_license') return '驾驶证';
  return '';
}

function textToDocumentType(v) {
  const s = String(v || '').trim();
  if (s === '护照') return 'passport';
  if (s === '身份证（ID卡）') return 'id_card';
  if (s === '出入境通行证') return 'travel_permit';
  if (s === '驾驶证') return 'drivers_license';
  return '';
}

function formatToText(v) {
  if (v === 'YMD') return '年/月/日 (YMD)';
  if (v === 'MDY') return '月/日/年 (MDY)';
  if (v === 'DMY') return '日/月/年 (DMY)';
  return '年/月/日 (YMD)';
}

function textToFormat(v) {
  const s = String(v || '').trim();
  if (s.includes('MDY')) return 'MDY';
  if (s.includes('DMY')) return 'DMY';
  return 'YMD';
}

watch(documentTypeText, (v) => {
  const t = textToDocumentType(v);
  if (t) documentType.value = t;
});

watch(documentType, (v) => {
  const txt = documentTypeToText(v);
  if (documentTypeText.value !== txt) documentTypeText.value = txt;
});

watch(expiryDateFormatText, (v) => {
  const f = textToFormat(v);
  if (f) expiryDateFormat.value = f;
});

watch(expiryDateFormat, (v) => {
  const txt = formatToText(v);
  if (expiryDateFormatText.value !== txt) expiryDateFormatText.value = txt;
});

onMounted(async () => {
  if (isEdit.value) {
    // 加载现有数据需要2FA
    promptTitle.value = '验证身份以加载证件';
    showPrompt.value = true;
  }
});

async function loadDocument(code) {
  const result = await documentsStore.fetchDocumentDetails(docId, code);
  if (result.ok) {
    const data = result.data;
    documentType.value = data.document_type;
    documentTypeText.value = documentTypeToText(data.document_type);
    holderName.value = data.holder_name;
    holderNameLatin.value = data.holder_name_latin || '';
    documentNumber.value = data.document_number;
    issueDate.value = data.issue_date || '';
    expiryDate.value = data.expiry_date || '';
    expiryDatePermanent.value = data.expiry_date_permanent === 1;
    expiryDateFormat.value = data.expiry_date_format || 'YMD';
    expiryDateFormatText.value = formatToText(data.expiry_date_format || 'YMD');
    issuePlace.value = data.issue_place || '';
    note.value = data.note || '';
  } else {
    error.value = result.message;
    setTimeout(() => {
      router.push('/documents');
    }, 2000);
  }
}

async function onSubmit() {
  error.value = '';
  if (!documentType.value || !holderName.value || !documentNumber.value) {
    error.value = '请填写所有必填字段';
    return;
  }
  if (!expiryDatePermanent.value && !expiryDate.value) {
    error.value = '请选择有效期或勾选“长期”';
    return;
  }
  const data = {
    documentType: documentType.value,
    holderName: holderName.value,
    holderNameLatin: holderNameLatin.value || undefined,
    documentNumber: documentNumber.value,
    issueDate: issueDate.value || undefined,
    expiryDate: expiryDate.value || undefined,
    expiryDatePermanent: expiryDatePermanent.value,
    expiryDateFormat: expiryDateFormat.value,
    issuePlace: issuePlace.value || undefined,
    note: note.value || undefined,
  };
  if (isEdit.value) {
    // 编辑需要2FA
    pendingData.value = data;
    promptTitle.value = '验证身份以更新证件';
    showPrompt.value = true;
  } else {
    // 新增不需要2FA
    const result = await documentsStore.addDocument(data);
    if (result.ok) {
      router.push('/documents');
    } else {
      error.value = result.message;
    }
  }
}

async function handlePromptConfirm(code) {
  showPrompt.value = false;
  if (isEdit.value && !pendingData.value) {
    // 加载文档
    await loadDocument(code);
  } else if (isEdit.value && pendingData.value) {
    // 更新文档
    const result = await documentsStore.updateDocument(docId, pendingData.value, code);
    if (result.ok) {
      router.push('/documents');
    } else {
      error.value = result.message;
    }
    pendingData.value = null;
  }
}

function handlePromptCancel() {
  showPrompt.value = false;
  pendingData.value = null;
  if (isEdit.value && !holderName.value) {
    // 如果取消加载，返回列表
    router.push('/documents');
  }
}
</script>

<style scoped>
.form-container {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
}

.form-container h2 {
  margin-bottom: 20px;
}

.document-form {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.field {
  margin-bottom: 15px;
}

.field label {
  display: block;
  font-weight: 600;
  margin-bottom: 5px;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.field textarea {
  resize: vertical;
}

.hint {
  display: block;
  color: #888;
  font-size: 11px;
  margin-top: 4px;
}

.actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 20px;
}

.primary-button,
.secondary-button {
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 1rem;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s;
}

.primary-button {
  background-color: #007aff;
  color: white;
  border: none;
}

.primary-button:hover {
  background-color: #0060d3;
}

.secondary-button {
  background: none;
  color: #007aff;
  border: 1px solid #d1d5db;
}

.secondary-button:hover {
  background-color: #f3f4f6;
}

.error {
  color: #dc3545;
  margin-top: 10px;
}
</style>
