<template>
  <div class="form-container">
    <h2>{{ isEdit ? '编辑 FPS 账户' : '新增 FPS 账户' }}</h2>
    <form @submit.prevent="onSubmit" class="fps-form">
      <div class="field">
        <label for="fpsId">FPS ID</label>
        <input id="fpsId" v-model="fpsId" :disabled="isEdit" required pattern="\d{8,12}" placeholder="8-12 位数字" />
      </div>
      <div class="field">
        <label for="recipient">收款人</label>
        <input id="recipient" v-model="recipient" required maxlength="100" />
      </div>
      <div class="field">
        <label>银行</label>
        <InlineFilterSelect v-model="bank" :options="bankOptions" placeholder="银行" />
        <small class="hint">清空选择后可填写其他银行；Logo 按缩写大写存储。</small>
      </div>
      <div class="field" v-if="manualBank">
        <label for="otherBank">其他银行</label>
        <input id="otherBank" v-model="otherBank" maxlength="100" placeholder="英文缩写或名称 (如未提供 svg 将回退 fps.png)" />
      </div>
      <div class="field">
        <label for="note">备注 (详情/编辑需 2FA 才可查看)</label>
        <textarea id="note" v-model="note" rows="3" maxlength="500" placeholder="500 字以内" />
      </div>
      <div class="actions">
        <button type="submit" class="primary-button">{{ isEdit ? '更新' : '创建' }}</button>
        <router-link to="/fps" class="secondary-button">返回</router-link>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="success" class="success">{{ success }}</p>
    </form>
    <TwoFactorPrompt
      :show="showPrompt"
      :title="promptTitle"
      @confirm="handlePromptConfirm"
      @cancel="handlePromptCancel"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import InlineFilterSelect from '@/components/InlineFilterSelect.vue';
import TwoFactorPrompt from '@/components/TwoFactorPrompt.vue';
import { api } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const id = route.params.id;
const isEdit = computed(()=> !!id);

const fpsId = ref('');
const recipient = ref('');
const bank = ref('');
const otherBank = ref('');
const note = ref('');
const error = ref('');
const success = ref('');
const banks = ref([]);

const showPrompt = ref(false);
const promptTitle = ref('');
const pendingAction = ref(null);

async function loadBanks(){ try { const r = await api.get('/fps/banks'); banks.value = r.data; } catch {} }
const bankOptions = computed(()=> banks.value.map(b=> ({ value:b, label:b })));
const manualBank = computed(()=> !bank.value );

onMounted(async () => {
  await loadBanks();
  if (isEdit.value) {
    promptTitle.value = '输入 2FA 验证码以加载详情';
    pendingAction.value = 'load';
    showPrompt.value = true;
  }
});

function handlePromptCancel(){ showPrompt.value=false; pendingAction.value=null; if(isEdit.value) router.push('/fps'); }
async function handlePromptConfirm(code){
  showPrompt.value=false;
  if (pendingAction.value==='load') {
    try { const r = await api.get(`/fps/${id}`, { params:{ totpCode: code } });
      fpsId.value = r.data.fps_id; recipient.value = r.data.recipient; bank.value = banks.value.includes(r.data.bank)? r.data.bank : ''; if(!bank.value) otherBank.value = r.data.bank; note.value = r.data.note || '';
    } catch(e){ error.value = e.response?.data?.message || '加载失败'; }
  } else if (pendingAction.value==='update') {
    try { const realBank = bank.value || otherBank.value.trim().toUpperCase(); await api.put(`/fps/${id}`, { recipient: recipient.value.trim(), bank: realBank, note: note.value.trim(), totpCode: code }); success.value='更新成功'; setTimeout(()=> router.push('/fps'), 1000); }
    catch(e){ error.value = e.response?.data?.message || '更新失败'; }
  }
  pendingAction.value=null;
}

function logoFileName(bank){ return bank.toUpperCase().replace(/[^A-Z0-9]+/g,'_').toLowerCase() + '.svg'; }
// 预留：多级回退逻辑（与列表一致）
function logoSrcFor(bank){ const base = bank.toUpperCase().replace(/[^A-Z0-9]+/g,'_').toLowerCase(); return { base, svg:`http://localhost:3000/logos/${base}.svg`, png:`http://localhost:3000/logos/${base}.png` }; }

async function onSubmit(){
  error.value=''; success.value='';
  if (isEdit.value) { promptTitle.value='输入 2FA 验证码以更新'; pendingAction.value='update'; showPrompt.value=true; return; }
  if(!/^\d{8,12}$/.test(fpsId.value)){ error.value='FPS ID 格式不正确'; return; }
  if(!recipient.value.trim()){ error.value='收款人必填'; return; }
  const realBank = bank.value || otherBank.value.trim().toUpperCase(); if(!realBank){ error.value='银行必填'; return; }
  try { await api.post('/fps', { fpsId: fpsId.value.trim(), recipient: recipient.value.trim(), bank: realBank, note: note.value.trim() }); success.value='创建成功'; setTimeout(()=> router.push('/fps'), 800); }
  catch(e){ error.value = e.response?.data?.message || '创建失败'; }
}
</script>

<style scoped>
.form-container { max-width:500px; margin:2rem auto; background:#fff; padding:2rem; border-radius:12px; box-shadow:0 4px 8px rgba(0,0,0,0.04); }
.fps-form { display:flex; flex-direction:column; }
.field { margin-bottom:1rem; display:flex; flex-direction:column; }
.field label { margin-bottom:0.25rem; font-size:0.875rem; }
.field input, .field textarea { padding:0.5rem; border:1px solid #d1d5db; border-radius:8px; font-size:1rem; transition:border-color .2s; font-family:inherit; }
.field input:focus, .field textarea:focus { outline:none; border-color:#007aff; }
textarea { resize:vertical; min-height:80px; }
.actions { margin-top:1rem; display:flex; gap:0.5rem; }
.primary-button, .secondary-button { padding:0.5rem 1rem; border-radius:8px; font-size:1rem; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; transition:background-color .2s; }
.primary-button { background:#007aff; color:#fff; border:none; }
.primary-button:hover { background:#0060d3; }
.secondary-button { background:none; color:#007aff; border:1px solid #d1d5db; }
.secondary-button:hover { background:#f3f4f6; }
.error { margin-top:0.5rem; color:#d32f2f; font-size:0.875rem; }
.success { margin-top:0.5rem; color:#0a7d22; font-size:0.75rem; }
.hint { display:block; margin-top:4px; font-size:11px; color:#6b7280; }
</style>
