import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from './router';
import App from './App.vue';
import './assets/main.css';

// Create the Vue application.  We register Pinia for state
// management and the router for client side routing.  The CSS
// import pulls in our global styles, including the minimalist
// aesthetic inspired by Apple’s design language.
const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');