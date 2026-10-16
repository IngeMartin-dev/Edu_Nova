/* eslint-disable no-undef */
// Service worker de Firebase Cloud Messaging (push con la pestaña cerrada).
// Recibe la configuración pública por query string al registrarse (ver src/services/firebasePush.js),
// que a su vez la toma del backend (backend/.env).

importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

const params = new URLSearchParams(self.location.search);
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId')
};

if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Notificación cuando la app/pestaña está en segundo plano o cerrada.
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'EduNova';
    const body = payload.notification?.body || '';

    self.registration.showNotification(title, {
      body,
      icon: '/logo-symbol.svg',
      badge: '/logo-symbol.svg',
      tag: 'edunova-push',
      data: payload.data || {}
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsArr) => {
      const hadWindowToFocus = clientsArr.some((client) => {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          return true;
        }
        return false;
      });
      if (!hadWindowToFocus) {
        self.clients.openWindow('/');
      }
    })
  );
});