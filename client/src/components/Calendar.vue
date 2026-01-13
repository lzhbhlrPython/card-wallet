<template>
  <div class="calendar-wrapper">
    <div class="calendar-input-row">
      <input
        type="text"
        :value="formattedDate"
        @click="togglePicker"
        readonly
        :placeholder="placeholder"
        class="calendar-input"
        :class="{ 'permanent-active': isPermanent }"
      />
      <label v-if="allowPermanent" class="permanent-checkbox" :class="{ 'checked': isPermanent }">
        <input type="checkbox" v-model="isPermanent" @change="handlePermanentChange" />
        <span>长期</span>
      </label>
    </div>
    <div v-if="showPicker && !isPermanent" class="calendar-picker">
      <div class="calendar-header">
        <button type="button" @click="prevMonth" class="nav-btn">‹</button>
        <div class="date-selectors">
          <select v-model="currentYear" class="year-select">
            <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option>
          </select>
          <select v-model="currentMonth" class="month-select">
            <option v-for="(month, index) in monthNames" :key="index" :value="index">{{ month }}</option>
          </select>
        </div>
        <button type="button" @click="nextMonth" class="nav-btn">›</button>
      </div>
      <div class="calendar-grid">
        <div class="weekday-header" v-for="day in weekdays" :key="day">{{ day }}</div>
        <div
          v-for="(date, index) in calendarDates"
          :key="index"
          @click="selectDate(date)"
          class="calendar-day"
          :class="{
            'other-month': date.isOtherMonth,
            'selected': isSelected(date),
            'today': isToday(date)
          }"
        >
          {{ date.day }}
        </div>
      </div>
      <div class="calendar-footer">
        <button type="button" @click="closePicker" class="close-btn">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '选择日期' },
  allowPermanent: { type: Boolean, default: false },
  permanent: { type: Boolean, default: false },
  format: { type: String, default: 'YMD' }
});

const emit = defineEmits(['update:modelValue', 'update:permanent']);

const showPicker = ref(false);
const isPermanent = ref(props.permanent);
const currentYear = ref(new Date().getFullYear());
const currentMonth = ref(new Date().getMonth());

const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Generate year options (current year - 50 to current year + 50)
const yearOptions = computed(() => {
  const currentYr = new Date().getFullYear();
  const years = [];
  for (let i = currentYr - 50; i <= currentYr + 50; i++) {
    years.push(i);
  }
  return years;
});

watch(() => props.permanent, (val) => {
  isPermanent.value = val;
});

const formattedDate = computed(() => {
  if (isPermanent.value) return '长期';
  if (!props.modelValue) return '';
  
  const parts = props.modelValue.split(/[-/]/);
  if (parts.length !== 3) return props.modelValue;
  
  if (props.format === 'MDY') {
    return `${parts[1]}/${parts[2]}/${parts[0]}`;
  } else if (props.format === 'DMY') {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  } else {
    return `${parts[0]}-${parts[1]}-${parts[2]}`;
  }
});

const calendarDates = computed(() => {
  const firstDay = new Date(currentYear.value, currentMonth.value, 1);
  const lastDay = new Date(currentYear.value, currentMonth.value + 1, 0);
  const prevLastDay = new Date(currentYear.value, currentMonth.value, 0);
  
  const dates = [];
  const firstDayOfWeek = firstDay.getDay();
  
  // 上月日期
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    dates.push({
      day: prevLastDay.getDate() - i,
      month: currentMonth.value - 1,
      year: currentYear.value,
      isOtherMonth: true
    });
  }
  
  // 当月日期
  for (let i = 1; i <= lastDay.getDate(); i++) {
    dates.push({
      day: i,
      month: currentMonth.value,
      year: currentYear.value,
      isOtherMonth: false
    });
  }
  
  // 下月日期
  const remainingDays = 42 - dates.length;
  for (let i = 1; i <= remainingDays; i++) {
    dates.push({
      day: i,
      month: currentMonth.value + 1,
      year: currentYear.value,
      isOtherMonth: true
    });
  }
  
  return dates;
});

function togglePicker() {
  if (!isPermanent.value) {
    showPicker.value = !showPicker.value;
  }
}

function closePicker() {
  showPicker.value = false;
}

function prevMonth() {
  if (currentMonth.value === 0) {
    currentMonth.value = 11;
    currentYear.value--;
  } else {
    currentMonth.value--;
  }
}

function nextMonth() {
  if (currentMonth.value === 11) {
    currentMonth.value = 0;
    currentYear.value++;
  } else {
    currentMonth.value++;
  }
}

function selectDate(date) {
  if (date.isOtherMonth) {
    // 如果选择了其他月份的日期，切换到那个月
    if (date.month < currentMonth.value || (date.month === 11 && currentMonth.value === 0)) {
      prevMonth();
    } else {
      nextMonth();
    }
    return;
  }
  
  const month = String(currentMonth.value + 1).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  const dateStr = `${currentYear.value}-${month}-${day}`;
  
  emit('update:modelValue', dateStr);
  showPicker.value = false;
}

function handlePermanentChange() {
  emit('update:permanent', isPermanent.value);
  if (isPermanent.value) {
    emit('update:modelValue', '');
    showPicker.value = false;
  }
}

function isSelected(date) {
  if (!props.modelValue || date.isOtherMonth) return false;
  const parts = props.modelValue.split(/[-/]/);
  if (parts.length !== 3) return false;
  return parseInt(parts[0]) === date.year && 
         parseInt(parts[1]) === date.month + 1 && 
         parseInt(parts[2]) === date.day;
}

function isToday(date) {
  if (date.isOtherMonth) return false;
  const today = new Date();
  return today.getFullYear() === date.year && 
         today.getMonth() === date.month && 
         today.getDate() === date.day;
}
</script>

<style scoped>
.calendar-wrapper {
  position: relative;
  width: 100%;
}

.calendar-input-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.calendar-input {
  flex: 1;
  padding: 0.4rem 0.6rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  font-size: 0.85rem;
  line-height: 1.2;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s, color 0.2s;
}

.calendar-input:focus {
  outline: none;
  border-color: #007aff;
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.15);
}

.calendar-input:disabled,
.calendar-input[readonly].permanent-active {
  background-color: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
  border-color: #e5e7eb;
}

.permanent-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  font-size: 0.85rem;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  border: 1.5px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  transition: all 0.2s;
}

.permanent-checkbox:hover {
  border-color: #007aff;
  background-color: #f0f9ff;
}

.permanent-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #007aff;
}

.permanent-checkbox.checked {
  border-color: #007aff;
  background-color: #eff6ff;
}

.permanent-checkbox span {
  font-weight: 500;
  color: #374151;
}

.calendar-picker {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 0.5rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 10px rgba(0, 0, 0, 0.05);
  padding: 1rem;
  z-index: 1000;
  min-width: 300px;
}

.calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #f3f4f6;
}

.date-selectors {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.year-select,
.month-select {
  padding: 0.4rem 0.6rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  color: #374151;
}

.year-select:hover,
.month-select:hover {
  border-color: #d1d5db;
  background: #fff;
}

.year-select:focus,
.month-select:focus {
  outline: none;
  border-color: #007aff;
  background: #fff;
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.1);
}

.year-select {
  min-width: 80px;
}

.month-select {
  min-width: 70px;
}

.nav-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 1.25rem;
  font-weight: 600;
  cursor: pointer;
  color: #374151;
  transition: all 0.2s;
  flex-shrink: 0;
}

.nav-btn:hover {
  background: #007aff;
  border-color: #007aff;
  color: #fff;
}

.nav-btn:active {
  transform: scale(0.95);
}

.month-year {
  font-weight: 600;
  font-size: 0.9rem;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.25rem;
}

.weekday-header {
  text-align: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  padding: 0.5rem 0.25rem;
}

.calendar-day {
  text-align: center;
  padding: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s;
  font-weight: 500;
  color: #374151;
}

.calendar-day:hover {
  background-color: #f0f9ff;
  transform: scale(1.05);
}

.calendar-day.other-month {
  color: #d1d5db;
  font-weight: 400;
}

.calendar-day.selected {
  background: linear-gradient(135deg, #007aff 0%, #0060d3 100%);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 122, 255, 0.3);
}

.calendar-day.today {
  font-weight: 600;
  color: #007aff;
  background-color: #eff6ff;
  border: 1.5px solid #007aff;
}

.calendar-day.selected.today {
  color: #fff;
  border-color: transparent;
}

.calendar-footer {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #f3f4f6;
  display: flex;
  justify-content: flex-end;
}

.close-btn {
  padding: 0.4rem 1rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  color: #374151;
}

.close-btn:hover {
  background-color: #007aff;
  border-color: #007aff;
  color: #fff;
}
</style>
