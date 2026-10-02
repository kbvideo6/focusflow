/**
 * usePushNotifications
 * =====================
 * React hook that handles:
 *  - Service Worker registration
 *  - Push subscription / unsubscription via Web Push API
 *  - Syncing subscriptions to the FocusFlow backend
 *  - Listening for SW messages (e.g. navigation events from notification clicks)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

export type PushStatus = 'idle' | 'unsupported' | 'denied' | 'pending' | 'subscribed' | 'error';

export interface UsePushNotificationsReturn {
  pushStatus: PushStatus;
  subscription: PushSubscription | null;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  sendTest: () => Promise<boolean>;
  isSupported: boolean;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const { token, apiUrl } = useAuth();
  const [pushStatus, setPushStatus] = useState<PushStatus>('idle');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const swRegistration = useRef<ServiceWorkerRegistration | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  // ── Fetch VAPID public key once ──────────────────────────────
  useEffect(() => {
    if (!isSupported || !token) return;
    fetch(`${apiUrl}/notifications/vapid-public-key`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.publicKey) setVapidKey(data.publicKey);
      })
      .catch(() => {});
  }, [isSupported, token, apiUrl]);

  // ── Register Service Worker ──────────────────────────────────
  useEffect(() => {
    if (!isSupported) {
      setPushStatus('unsupported');
      return;
    }

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(async (registration) => {
        swRegistration.current = registration;

        // Check current permission state
        if (Notification.permission === 'denied') {
          setPushStatus('denied');
          return;
        }

        // Check if already subscribed
        const existingSub = await registration.pushManager.getSubscription();
        if (existingSub) {
          setSubscription(existingSub);
          setPushStatus('subscribed');
        } else {
          setPushStatus('idle');
        }
      })
      .catch((err) => {
        console.error('[sw] Registration failed:', err);
        setPushStatus('error');
      });

    // Listen for SW messages (e.g., navigate on notification click)
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        window.location.href = event.data.url;
      }
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        // Re-register subscription with server
        const newSub = event.data.subscription as PushSubscription;
        if (newSub && token) {
          const subJson = newSub.toJSON();
          fetch(`${apiUrl}/notifications/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys })
          }).catch(() => {});
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, [isSupported, token, apiUrl]);

  // ── Subscribe ────────────────────────────────────────────────
  const subscribe = useCallback(async () => {
    if (!isSupported || !swRegistration.current || !vapidKey || !token) return;

    try {
      setPushStatus('pending');

      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus(permission === 'denied' ? 'denied' : 'idle');
        return;
      }

      // Subscribe via Push API
      const sub = await swRegistration.current.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });

      setSubscription(sub);

      // Register on backend
      const subJson = sub.toJSON();
      const res = await fetch(`${apiUrl}/notifications/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys })
      });

      if (res.ok) {
        setPushStatus('subscribed');
      } else {
        throw new Error('Failed to register subscription on server.');
      }
    } catch (err) {
      console.error('[push] Subscribe error:', err);
      setPushStatus('error');
    }
  }, [isSupported, vapidKey, token, apiUrl]);

  // ── Unsubscribe ──────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    if (!subscription || !token) return;
    try {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      setSubscription(null);
      setPushStatus('idle');

      await fetch(`${apiUrl}/notifications/unsubscribe`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ endpoint })
      });
    } catch (err) {
      console.error('[push] Unsubscribe error:', err);
    }
  }, [subscription, token, apiUrl]);

  // ── Test ─────────────────────────────────────────────────────
  const sendTest = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch(`${apiUrl}/notifications/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [token, apiUrl]);

  return { pushStatus, subscription, subscribe, unsubscribe, sendTest, isSupported };
}
