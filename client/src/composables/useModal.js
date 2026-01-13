import { ref } from 'vue';

const modalState = ref({
  show: false,
  title: '提示',
  message: '',
  type: 'info',
  confirmText: '确定',
  cancelText: '取消',
  showCancel: false,
  hideClose: false,
  onConfirm: null,
  onCancel: null
});

export function useModal() {
  function showModal(options) {
    return new Promise((resolve) => {
      modalState.value = {
        show: true,
        title: options.title || '提示',
        message: options.message || '',
        type: options.type || 'info',
        confirmText: options.confirmText || '确定',
        cancelText: options.cancelText || '取消',
        showCancel: options.showCancel !== undefined ? options.showCancel : false,
        hideClose: options.hideClose || false,
        onConfirm: () => {
          modalState.value.show = false;
          resolve(true);
        },
        onCancel: () => {
          modalState.value.show = false;
          resolve(false);
        }
      };
    });
  }

  function alert(message, title = '提示', type = 'info') {
    return showModal({
      title,
      message,
      type,
      showCancel: false
    });
  }

  function confirm(message, title = '确认', type = 'warning') {
    return showModal({
      title,
      message,
      type,
      showCancel: true
    });
  }

  function success(message, title = '成功') {
    return alert(message, title, 'success');
  }

  function error(message, title = '错误') {
    return alert(message, title, 'error');
  }

  function warning(message, title = '警告') {
    return alert(message, title, 'warning');
  }

  return {
    modalState,
    showModal,
    alert,
    confirm,
    success,
    error,
    warning
  };
}
