/**
 * EchoCRM Chrome Extension Configuration Resolver
 *
 * Resolves Supabase credentials safely without committing them to source control.
 *
 * Precedence:
 * 1. globalThis.__ECHOCRM_CONFIG__ (from config.local.js, if present)
 * 2. chrome.storage.local (runtime configured via extension settings)
 * 3. Unconfigured fallback (prompts user to configure)
 */

(function () {
  const DEFAULT_BUCKET = 'meeting-recordings';

  /**
   * Resolves the active EchoCRM public configuration asynchronously.
   * @returns {Promise<{ url: string, anonKey: string, bucket: string, isConfigured: boolean }>}
   */
  async function getEchoCRMConfig() {
    // 1. Check if global configuration object is set (e.g. from config.local.js)
    if (
      typeof globalThis.__ECHOCRM_CONFIG__ === 'object' &&
      globalThis.__ECHOCRM_CONFIG__ !== null &&
      globalThis.__ECHOCRM_CONFIG__.url &&
      globalThis.__ECHOCRM_CONFIG__.anonKey &&
      !globalThis.__ECHOCRM_CONFIG__.url.includes('your-project')
    ) {
      return {
        url: globalThis.__ECHOCRM_CONFIG__.url.replace(/\/$/, ''),
        anonKey: globalThis.__ECHOCRM_CONFIG__.anonKey,
        bucket: globalThis.__ECHOCRM_CONFIG__.bucket || DEFAULT_BUCKET,
        isConfigured: true
      };
    }

    // 2. Check chrome.storage.local for runtime user/admin configuration
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const stored = await chrome.storage.local.get([
          'echocrm_supabase_url',
          'echocrm_supabase_anon_key',
          'echocrm_supabase_bucket'
        ]);
        if (stored.echocrm_supabase_url && stored.echocrm_supabase_anon_key) {
          return {
            url: stored.echocrm_supabase_url.replace(/\/$/, ''),
            anonKey: stored.echocrm_supabase_anon_key,
            bucket: stored.echocrm_supabase_bucket || DEFAULT_BUCKET,
            isConfigured: true
          };
        }
      }
    } catch (e) {
      /* chrome.storage unavailable */
    }

    // 3. Fallback: Unconfigured
    return {
      url: '',
      anonKey: '',
      bucket: DEFAULT_BUCKET,
      isConfigured: false
    };
  }

  /**
   * Save runtime configuration into chrome.storage.local.
   * @param {{ url: string, anonKey: string, bucket?: string }} config
   */
  async function setEchoCRMConfig(config) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      throw new Error('chrome.storage.local is not available in this context');
    }
    await chrome.storage.local.set({
      echocrm_supabase_url: config.url ? config.url.replace(/\/$/, '') : '',
      echocrm_supabase_anon_key: config.anonKey || '',
      echocrm_supabase_bucket: config.bucket || DEFAULT_BUCKET
    });
  }

  globalThis.getEchoCRMConfig = getEchoCRMConfig;
  globalThis.setEchoCRMConfig = setEchoCRMConfig;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getEchoCRMConfig, setEchoCRMConfig, DEFAULT_BUCKET };
  }
})();
