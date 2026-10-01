/**
 * EchoCRM Chrome Extension - Example Local Configuration
 * 
 * In development, copy this file to 'config.local.js' (which is gitignored)
 * or run:
 *   npm run config:extension
 * to automatically generate config.local.js from your project's .env file.
 *
 * In production, this can also be configured dynamically at runtime
 * via chrome.storage.local keys:
 *   - 'echocrm_supabase_url'
 *   - 'echocrm_supabase_anon_key'
 *   - 'echocrm_supabase_bucket'
 */

globalThis.__ECHOCRM_CONFIG__ = {
  url: 'https://your-project-id.supabase.co',
  anonKey: 'your-anon-publishable-key',
  bucket: 'meeting-recordings'
};
