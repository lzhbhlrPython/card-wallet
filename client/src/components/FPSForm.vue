<template>
  <div class="form-card">
    <form @submit.prevent="submit">
      <div class="grid">
        <label class="field">
          <span>FPS ID (8-12位数字)</span>
          <input v-model="model.fpsId" required pattern="\d{8,12}" placeholder="例如 12345678" />
        </label>
        <label class="field">
          <span>收款人</span>
          <input v-model="model.recipient" required maxlength="100" placeholder="姓名 / 公司" />
        </label>
        <label class="field">
          <span>银行</span>
          <InlineFilterSelect v-model="bankValue" :options="bankOptions" placeholder="银行" :multiple="false" />
        </label>
        <label class="field span-2">
          <span>备注</span>
          <textarea v-model="model.note" maxlength="500" rows="2" placeholder="可选备注 (最多500字)"></textarea>
        </label>
      </div>
      <div class="actions">
        <button type="submit" class="primary-button" :disabled="submitting">{{ submitting ? '提交中...' : '创建' }}</button>
        <button type="button" class="secondary-button" v-if="showCancel" @click="$emit('cancel')">取消</button>
      </div>
      <p v-if="error" class="error-text">{{ error }}</p>
      <p v-if="success" class="success-text">创建成功</p>
    </form>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import InlineFilterSelect from '@/components/InlineFilterSelect.vue';
import { api } from '@/stores/auth';

const props = defineProps({
  banks: { type: Array, default: () => [] },
  showCancel: { type: Boolean, default: false }
});
const emit = defineEmits(['created','cancel','bank-added']);

const model = ref({ fpsId: '', recipient: '', bank: '', note: '' });
const bankValue = ref('');
const submitting = ref(false);
const error = ref('');
const success = ref(false);

const bankOptions = computed(()=> props.banks.map(b=>({ value:b, label:b })));

watch(bankValue, (v)=> { model.value.bank = v; });

async function submit() {
  error.value=''; success.value=false;
  if(!model.value.fpsId || !model.value.recipient || !model.value.bank){ error.value='必填字段缺失'; return; }
  submitting.value=true;
  try {
    const payload = { fpsId: model.value.fpsId.trim(), recipient: model.value.recipient.trim(), bank: model.value.bank.trim().toUpperCase(), note: model.value.note.trim() };
    const res = await api.post('/fps', payload);
    success.value=true;
    emit('created', { id: res.data.id, ...payload });
    if(!props.banks.includes(payload.bank)) emit('bank-added', payload.bank);
    model.value = { fpsId: '', recipient: '', bank: '', note: '' }; bankValue.value='';
  } catch (e){
    error.value = e.response?.data?.message || '创建失败';
  }
  submitting.value=false;
}
</script>

<style scoped>
.form-card { background:#fff; border:1px solid #e5e7eb; padding:1rem; border-radius:12px; margin-bottom:1rem; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:0.75rem 1rem; }
.field { display:flex; flex-direction:column; }
.field span { font-size:.7rem; letter-spacing:.5px; font-weight:600; margin-bottom:.25rem; color:#555; }
.field input, .field textarea { border:1px solid #ccd1d9; border-radius:8px; padding:.5rem .6rem; font-size:.8rem; resize:vertical; }
.field input:focus, .field textarea:focus { outline:none; border-color:#007aff; box-shadow:0 0 0 2px rgba(0,122,255,.15); }
.span-2 { grid-column:1 / -1; }
.actions { display:flex; justify-content:flex-end; gap:.75rem; margin-top:.5rem; }
.primary-button { background:#007aff; color:#fff; border:none; padding:.55rem 1rem; border-radius:8px; cursor:pointer; font-size:.85rem; }
.primary-button:hover { background:#0060d3; }
.secondary-button { background:#f1f3f5; border:none; padding:.55rem 1rem; border-radius:8px; cursor:pointer; font-size:.85rem; }
.secondary-button:hover { background:#e6e8ea; }
.error-text { color:#d32f2f; font-size:.7rem; margin-top:.4rem; }
.success-text { color:#0a7d22; font-size:.7rem; margin-top:.4rem; }
</style>
