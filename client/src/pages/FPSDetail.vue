<template>
  <div class="detail-wrapper" v-if="detailLoaded">
    <h2 class="title">FPS 账户详情</h2>
    <div class="card">
      <p><strong>FPS ID：</strong><span class="mono">{{ detail.fps_id }}</span></p>
      <p><strong>收款人：</strong>{{ detail.recipient }}</p>
      <p><strong>银行：</strong>{{ detail.bank }}</p>
      <p v-if="detail.note"><strong>备注：</strong><span class="note mono">{{ detail.note }}</span></p>
      <div class="actions">
        <router-link :to="`/fps/${detail.id}/edit`" class="primary-button link-btn">编辑</router-link>
        <router-link to="/fps" class="secondary-button link-btn">返回</router-link>
      </div>
    </div>
    <p v-if="error" class="error-text">{{ error }}</p>
  </div>
  <div v-else class="loading">加载中...</div>
  <TwoFactorPrompt :show="showPrompt" title="查看 FPS 备注" @confirm="confirm" @cancel="cancel" />
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/stores/auth';
import TwoFactorPrompt from '@/components/TwoFactorPrompt.vue';

const route = useRoute();
const router = useRouter();
const id = route.params.id;
const showPrompt = ref(true);
const detailLoaded = ref(false);
const detail = ref({});
const error = ref('');

async function fetchDetail(code){
  try {
    const res = await api.get(`/fps/${id}`, { params:{ totpCode: code } });
    detail.value = res.data;
    detailLoaded.value = true;
  } catch(e){
    error.value = e.response?.data?.message || '加载失败';
  }
}
function confirm(code){ showPrompt.value=false; fetchDetail(code); }
function cancel(){ showPrompt.value=false; router.push('/fps'); }

onMounted(()=>{});
</script>

<style scoped>
.detail-wrapper { max-width:620px; margin:0 auto; }
.title { font-size:1.2rem; font-weight:600; margin:0 0 1rem; }
.card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:1rem 1.2rem; }
.card p { margin:.4rem 0; font-size:.85rem; }
.mono { font-family:'SF Mono','Menlo',monospace; letter-spacing:1px; }
.note { white-space:pre-wrap; display:inline-block; }
.actions { display:flex; justify-content:flex-end; margin-top:.8rem; }
.primary-button.link-btn { text-decoration:none; background:#007bff; padding:.55rem 1rem; border-radius:8px; font-size:.8rem; color:#fff; margin-right:.5rem; }
.primary-button.link-btn:hover { background:#0056b3; }
.secondary-button.link-btn { text-decoration:none; background:#f1f3f5; padding:.55rem 1rem; border-radius:8px; font-size:.8rem; color:#333; }
.secondary-button.link-btn:hover { background:#e6e8ea; }
.loading { text-align:center; margin-top:2rem; color:#666; }
.error-text { color:#d32f2f; font-size:.75rem; margin-top:.5rem; }
</style>
