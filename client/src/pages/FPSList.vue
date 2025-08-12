<template>
  <div class="card-list-container"><!-- 复用与 CardList 相同的根类名以保持样式统一 -->
    <div class="header">
      <h2>我的 FPS 账户</h2>
      <div class="header-actions">
        <button class="primary-button" @click="refresh" :disabled="loading || refreshing">{{ refreshing ? '刷新中...' : '刷新' }}</button>
        <router-link to="/fps/new" class="primary-button">新增账户</router-link>
      </div>
    </div>
    <div class="filters enhanced">
      <div class="filter-group">
        <label class="filter-label">银行</label>
        <InlineFilterSelect v-model="bankFilter" :options="bankOptions" placeholder="银行" :multiple="true" />
      </div>
      <div class="filter-group sort-group">
        <span class="filter-label">排序</span>
        <div class="sort-radios">
          <div class="sort-radio">
            <input type="radio" id="sort-default" value="default" v-model="sortOption" />
            <label for="sort-default">默认</label>
          </div>
          <div class="sort-radio">
            <input type="radio" id="sort-bank" value="bank" v-model="sortOption" />
            <label for="sort-bank">按银行</label>
          </div>
        </div>
      </div>
    </div>
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else>
      <div v-if="sortedAccounts.length === 0" class="empty">暂无账户。</div>
      <div v-else class="cards-grid"><!-- 使用与 CardList 相同的网格类名 -->
        <div v-for="a in sortedAccounts" :key="a.id" class="card-item"><!-- 复用 card-item 外观 -->
          <div class="card-top">
            <p class="network-logo-wrapper">
              <img :src="bankLogo(a.bank)" :alt="a.bank" class="network-logo" @error="e=> e.target.src = fallbackLogo" />
            </p>
            <span class="bank-name">{{ a.bank }}</span>
          </div>
          <div class="card-middle">
            <span class="card-number mono">{{ a.fps_id }}</span>
          </div>
          <div class="card-bottom">
            <span class="expiration">收款人 {{ a.recipient }}</span>
          </div>
          <div class="actions">
            <router-link :to="`/fps/${a.id}`" class="secondary-button">详情</router-link>
            <router-link :to="`/fps/${a.id}/edit`" class="secondary-button">编辑</router-link>
            <button class="danger-button" @click="confirmDelete(a.id)">删除</button>
          </div>
        </div>
      </div>
    </div>
    <TwoFactorPrompt :show="showPrompt" title="删除 FPS 账户" @confirm="handlePromptConfirm" @cancel="cancelPrompt" />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { api } from '@/stores/auth';
import TwoFactorPrompt from '@/components/TwoFactorPrompt.vue';
import InlineFilterSelect from '@/components/InlineFilterSelect.vue';

const accounts = ref([]);
const loading = ref(true);
const refreshing = ref(false);
const banks = ref([]);
const bankFilter = ref([]);
const sortOption = ref('default');
const deleteId = ref(null);
const showPrompt = ref(false);
const fallbackLogo = 'http://localhost:3000/logos/fps.png';

async function loadBanks(){ try { const r = await api.get('/fps/banks'); banks.value = r.data; } catch(e){} }
async function loadAccounts(initial=false){ if(initial) loading.value=true; try { const r = await api.get('/fps'); accounts.value = r.data; } catch(e){} if(initial) loading.value=false; }
async function refresh(){ refreshing.value=true; await loadAccounts(false); refreshing.value=false; }
function bankLogo(bank){ const file = bank.toUpperCase().replace(/[^A-Z0-9]+/g,'_') + '.svg'; return `http://localhost:3000/logos/${file}`; }
function confirmDelete(id){ deleteId.value=id; showPrompt.value=true; }
async function handlePromptConfirm(code){ showPrompt.value=false; try { await api.delete(`/fps/${deleteId.value}`, { params:{ totpCode: code } }); await loadAccounts(); } catch(e){ alert(e.response?.data?.message || '删除失败'); } deleteId.value=null; }
function cancelPrompt(){ showPrompt.value=false; deleteId.value=null; }

const bankOptions = computed(()=> { const set = new Set(); accounts.value.forEach(a=> set.add(a.bank)); return Array.from(set).sort().map(b=>({ value:b, label:b })); });
const filteredAccounts = computed(()=> accounts.value.filter(a=> !bankFilter.value.length || bankFilter.value.includes(a.bank)) );
const sortedAccounts = computed(()=> { const arr = filteredAccounts.value.slice(); if(sortOption.value==='bank') arr.sort((a,b)=> a.bank.localeCompare(b.bank,'zh-CN')); return arr; });

onMounted(async ()=> { await Promise.all([loadBanks(), loadAccounts(true)]); });
</script>

<style scoped>
/* 复用 CardList 相关样式 (必要部分复制，以免全局耦合) */
.card-list-container { display:flex; flex-direction:column; }
.header { display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; }
.header-actions { display:flex; gap:.5rem; align-items:center; }
.primary-button { background-color:#007aff; color:#fff; padding:0.5rem 1rem; min-height:40px; line-height:1; border:none; border-radius:8px; font-size:1rem; font-weight:500; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; transition:background-color .2s; text-decoration:none; }
.primary-button:hover { background-color:#0060d3; }
.primary-button:disabled { opacity:.6; cursor:not-allowed; }
.filters.enhanced { display:flex; align-items:flex-end; gap:1rem; padding:.75rem 1rem; background:#f8f9fb; border:1px solid #e5e7eb; border-radius:10px; margin-bottom:1rem; flex-wrap:wrap; }
.filter-group { display:flex; flex-direction:column; min-width:160px; }
.filter-label { font-size:.7rem; letter-spacing:.5px; text-transform:uppercase; color:#6b7280; margin-bottom:.25rem; }
.sort-group { min-width:160px; }
.sort-radios { display:flex; gap:.4rem; flex-wrap:wrap; }
.sort-radio { position:relative; }
.sort-radio input { position:absolute; opacity:0; pointer-events:none; }
.sort-radio label { display:inline-flex; align-items:center; padding:0.32rem .7rem; font-size:.7rem; letter-spacing:.5px; border:1px solid #d1d5db; background:#fff; border-radius:20px; cursor:pointer; user-select:none; line-height:1; transition:background .2s,border-color .2s,color .2s,box-shadow .2s; }
.sort-radio input:checked + label { background:#007aff; color:#fff; border-color:#007aff; box-shadow:0 0 0 2px rgba(0,122,255,.15); }
.sort-radio label:hover { border-color:#007aff; }
.loading, .empty { text-align:center; color:#666; margin-top:1rem; }
.cards-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:1rem; }
.card-item { background:#fff; border-radius:12px; padding:1rem; box-shadow:0 2px 4px rgba(0,0,0,.05); display:flex; flex-direction:column; justify-content:space-between; }
.card-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:.5rem; }
.network-logo { height:24px; object-fit:contain; }
.bank-name { font-weight:500; font-size:0.9rem; color:#333; }
.card-middle { margin-bottom:.5rem; font-size:1rem; letter-spacing:1px; }
.card-number { font-size:1.05rem; }
.card-bottom { font-size:.8rem; color:#666; }
.actions { margin-top:.5rem; display:flex; justify-content:space-between; }
.secondary-button, .danger-button { padding:0.25rem 0.5rem; border:1px solid #d1d5db; border-radius:6px; background:none; cursor:pointer; font-size:0.85rem; transition:background-color .2s; text-decoration:none; display:inline-flex; align-items:center; }
.secondary-button:hover { background:#f3f4f6; }
.danger-button { color:#d32f2f; border-color:#d32f2f; }
.danger-button:hover { background:#fdecea; }
.mono { font-family:'SF Mono','Menlo',monospace; }
</style>
