'use client';
import { useCallback, useEffect, useState } from 'react';
export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (body !== undefined && !navigator.onLine)
    throw new Error('Internet connection required to record time.');
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new Error(
      body === undefined
        ? 'Unable to connect. Check your internet connection.'
        : 'No confirmation received. Check your connection and refresh your status before retrying.',
    );
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Request failed.');
  return result;
}
export function useApi<T>(path: string, refreshMs = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setData(await api<T>(path));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load.');
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    setLoading(true);
    void refresh();
    if (refreshMs) {
      const timer = setInterval(refresh, refreshMs);
      return () => clearInterval(timer);
    }
  }, [refresh, refreshMs]);
  return { data, error, loading, refresh };
}
export function time(value: string | null | undefined, zone = 'America/Toronto') {
  return value
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(value))
    : '—';
}
export function date(value: string, zone = 'America/Toronto') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}
export function duration(start: string, end?: string | null) {
  return (Math.max(0, +(end ? new Date(end) : new Date()) - +new Date(start)) / 3600000).toFixed(2);
}
export function pretty(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (v) => v.toUpperCase());
}
