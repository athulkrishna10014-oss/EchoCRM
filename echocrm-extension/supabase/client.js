/**
 * EchoCRM Supabase Client for Browser Extension
 * Uses standard REST & Storage APIs with the client-side anon key.
 * Authenticates as the signed-in CRM user so RLS owner policies are satisfied,
 * then performs idempotent database upserts and WebM audio uploads.
 */

const DEFAULT_BUCKET = 'meeting-recordings';
const SESSION_STORAGE_KEY = 'echocrmSession';

class SupabaseExtensionClient {
  constructor(config = null) {
    this._config = config;
    this.url = config && config.url ? config.url.replace(/\/$/, '') : '';
    this.anonKey = config && config.anonKey ? config.anonKey : '';
    this.bucket = config && config.bucket ? config.bucket : DEFAULT_BUCKET;
  }

  /**
   * Lazily and dynamically resolves Supabase configuration from:
   * 1. Explicit constructor arguments
   * 2. globalThis.__ECHOCRM_CONFIG__ (from config.local.js or build-time injection)
   * 3. chrome.storage.local ('echocrm_supabase_url', 'echocrm_supabase_anon_key')
   * 4. globalThis.getEchoCRMConfig() resolver
   */
  async ensureConfig() {
    if (this.url && this.anonKey && !this.url.includes('your-project')) {
      return { url: this.url, anonKey: this.anonKey, bucket: this.bucket };
    }

    // 1. Check global configuration object
    if (
      typeof globalThis.__ECHOCRM_CONFIG__ === 'object' &&
      globalThis.__ECHOCRM_CONFIG__ !== null &&
      globalThis.__ECHOCRM_CONFIG__.url &&
      globalThis.__ECHOCRM_CONFIG__.anonKey &&
      !globalThis.__ECHOCRM_CONFIG__.url.includes('your-project')
    ) {
      this.url = globalThis.__ECHOCRM_CONFIG__.url.replace(/\/$/, '');
      this.anonKey = globalThis.__ECHOCRM_CONFIG__.anonKey;
      this.bucket = globalThis.__ECHOCRM_CONFIG__.bucket || DEFAULT_BUCKET;
      return { url: this.url, anonKey: this.anonKey, bucket: this.bucket };
    }

    // 2. Check chrome.storage.local
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const stored = await chrome.storage.local.get([
          'echocrm_supabase_url',
          'echocrm_supabase_anon_key',
          'echocrm_supabase_bucket'
        ]);
        if (stored.echocrm_supabase_url && stored.echocrm_supabase_anon_key) {
          this.url = stored.echocrm_supabase_url.replace(/\/$/, '');
          this.anonKey = stored.echocrm_supabase_anon_key;
          this.bucket = stored.echocrm_supabase_bucket || DEFAULT_BUCKET;
          return { url: this.url, anonKey: this.anonKey, bucket: this.bucket };
        }
      }
    } catch (e) {
      /* chrome.storage unavailable in this context */
    }

    // 3. Check getEchoCRMConfig if defined in config.js
    if (typeof globalThis.getEchoCRMConfig === 'function') {
      try {
        const cfg = await globalThis.getEchoCRMConfig();
        if (cfg && cfg.url && cfg.anonKey && cfg.isConfigured) {
          this.url = cfg.url.replace(/\/$/, '');
          this.anonKey = cfg.anonKey;
          this.bucket = cfg.bucket || DEFAULT_BUCKET;
          return { url: this.url, anonKey: this.anonKey, bucket: this.bucket };
        }
      } catch (e) {
        /* error fetching config */
      }
    }

    return null;
  }

  /**
   * Returns true if Supabase configuration is present and valid.
   */
  async isConfigured() {
    const cfg = await this.ensureConfig();
    return Boolean(cfg && cfg.url && cfg.anonKey);
  }

  // ---------------------------------------------------------------------------
  // Session storage (chrome.storage.local, shared across extension contexts)
  // ---------------------------------------------------------------------------
  /**
   * Read the stored session. The popup and the offscreen recorder are different
   * execution contexts, so we mirror the session into BOTH chrome.storage.local
   * (persistent, survives service-worker/context teardown) and localStorage
   * (shared instantly between extension pages). This makes the session
   * available regardless of which storage backend a given context can access.
   */
  async getStoredSession() {
    // Prefer localStorage first: it is synchronously shared between the popup
    // and the offscreen document and never requires an async chrome API.
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      }
    } catch (e) {
      /* localStorage unavailable */
    }

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const data = await chrome.storage.local.get(SESSION_STORAGE_KEY);
        const session = data[SESSION_STORAGE_KEY] || null;
        if (session) {
          // Hydrate localStorage so other contexts see it synchronously.
          try { localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session)); } catch (e) {}
        }
        return session;
      }
    } catch (e) {
      /* chrome.storage unavailable in this context */
    }

    return null;
  }

  async setStoredSession(session) {
    // Always keep both backends in sync.
    try {
      if (session) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (e) {
      /* localStorage unavailable */
    }

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        if (session) {
          await chrome.storage.local.set({ [SESSION_STORAGE_KEY]: session });
        } else {
          await chrome.storage.local.remove(SESSION_STORAGE_KEY);
        }
      }
    } catch (e) {
      /* chrome.storage unavailable in this context */
    }
  }

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------
  async signIn(email, password) {
    await this.ensureConfig();
    if (!this.url || !this.anonKey) {
      throw new Error('Supabase client is not configured. Run "npm run config:extension" or set your credentials.');
    }

    const res = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': this.anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error_description || err.msg || err.error || `Sign-in failed (${res.status})`);
    }

    const data = await res.json();
    const session = this._normalizeSession(data);
    await this.setStoredSession(session);
    return session;
  }

  async signOut() {
    await this.ensureConfig();
    const session = await this.getStoredSession();
    if (session && session.access_token && this.url && this.anonKey) {
      fetch(`${this.url}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          'apikey': this.anonKey,
          'Authorization': `Bearer ${session.access_token}`
        }
      }).catch(() => {});
    }
    await this.setStoredSession(null);
  }

  async getSession() {
    return this.getStoredSession();
  }

  async refreshSession() {
    await this.ensureConfig();
    if (!this.url || !this.anonKey) return null;

    const session = await this.getStoredSession();
    if (!session || !session.refresh_token) return null;

    const res = await fetch(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'apikey': this.anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });

    if (!res.ok) {
      await this.setStoredSession(null);
      return null;
    }

    const data = await res.json();
    const refreshed = this._normalizeSession(data, session.user);
    await this.setStoredSession(refreshed);
    return refreshed;
  }

  async getValidSession() {
    const session = await this.getStoredSession();
    if (!session) return null;
    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at && session.expires_at - now < 60) {
      return this.refreshSession();
    }
    return session;
  }

  _normalizeSession(data, fallbackUser = null) {
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || (Math.floor(Date.now() / 1000) + (data.expires_in || 3600)),
      user: data.user || fallbackUser
    };
  }

  async getAuthHeaders(extraHeaders = {}) {
    await this.ensureConfig();
    if (!this.url || !this.anonKey) {
      throw new Error('Supabase client is not configured. Please run "npm run config:extension" or set credentials.');
    }
    const session = await this.getValidSession();
    const token = session && session.access_token ? session.access_token : this.anonKey;
    return {
      'apikey': this.anonKey,
      'Authorization': `Bearer ${token}`,
      ...extraHeaders
    };
  }

  async getHeaders(contentType = 'application/json', extraHeaders = {}) {
    const headers = await this.getAuthHeaders(extraHeaders);
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    return headers;
  }

  // ---------------------------------------------------------------------------
  // Customer APIs
  // ---------------------------------------------------------------------------

  /**
   * Search customers by partial name for the signed-in user.
   * Returns array of { id, name, email, phone, company }.
   */
  async searchCustomers(query) {
    if (!query || !query.trim()) return [];
    const term = encodeURIComponent(`%${query.trim()}%`);
    const endpoint = `${this.url}/rest/v1/customers?name=ilike.${term}&select=id,name,email,phone,company&order=name.asc&limit=20`;

    const res = await fetch(endpoint, {
      headers: await this.getHeaders(null)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Customer search failed (${res.status}): ${errText}`);
    }
    return res.json();
  }

  /**
   * Create a new customer for the signed-in user.
   * Uses the SAME schema as the desktop EchoCRM customer creation.
   * Returns the created customer row including its id.
   */
  async createCustomer({ name, phone = null, email = null, company = null, tags = [] }) {
    const session = await this.getValidSession();
    if (!session || !session.user) {
      throw new Error('You must be signed in to create a customer.');
    }
    const ownerId = session.user.id;

    const payload = {
      owner_id: ownerId,
      name: name.trim(),
      phone: phone ? phone.trim() : null,
      email: email ? email.trim() : null,
      company: company ? company.trim() : null,
      tags: tags || []
    };

    const endpoint = `${this.url}/rest/v1/customers`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: await this.getHeaders('application/json', {
        'Prefer': 'return=representation'
      }),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to create customer (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return data && data[0] ? data[0] : data;
  }

  // ---------------------------------------------------------------------------
  // Database / Storage
  // ---------------------------------------------------------------------------

  /**
   * Idempotent upsert of meeting record row, scoped to the signed-in owner.
   * Accepts optional customer_id to associate the recording with a customer.
   */
  async upsertMeetingRecord(record) {
    const session = await this.getValidSession();
    const ownerId = record.ownerId || (session && session.user ? session.user.id : null);
    if (!ownerId) {
      throw new Error('Not signed in to EchoCRM. Open the extension and sign in to sync recordings.');
    }

    const endpoint = `${this.url}/rest/v1/meeting_recordings?on_conflict=id`;
    const payload = {
      id: record.id,
      owner_id: ownerId,
      platform: record.platform || 'unknown',
      meeting_url: record.meetingUrl || '',
      started_at: record.startedAt || new Date().toISOString(),
      stopped_at: record.stoppedAt || null,
      duration_seconds: record.durationSeconds || 0,
      mime_type: record.mimeType || 'audio/webm',
      storage_path: record.storagePath || `recordings/${record.id}.webm`,
      status: record.status || 'local_saved',
      disclosure_attempted: Boolean(record.disclosureAttempted),
      disclosure_delivered: Boolean(record.disclosureDelivered),
      disclosure_timestamp: record.disclosureTimestamp || null,
      upload_attempts: record.uploadAttempts || 0,
      last_error: record.lastError || null,
      updated_at: new Date().toISOString()
    };

    // Include customer_id only when explicitly provided (do not overwrite with null accidentally)
    if (record.customerId !== undefined) {
      payload.customer_id = record.customerId || null;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: await this.getHeaders('application/json', {
        'Prefer': 'resolution=merge-duplicates,return=representation'
      }),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Supabase DB error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return data && data[0] ? data[0] : payload;
  }

  /**
   * Upload audio blob to Supabase Storage.
   * Supports webm (browser recording), wav, mp3, m4a (file uploads).
   * Uses x-upsert: true for idempotent overwrite on retry.
   */
  async uploadAudioBlob(recordingId, audioBlob, extension = 'webm') {
    const safeExt = extension.replace(/^\./, '').toLowerCase();
    const storagePath = `recordings/${recordingId}.${safeExt}`;
    const endpoint = `${this.url}/storage/v1/object/${this.bucket}/${storagePath}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: await this.getHeaders(audioBlob.type || `audio/${safeExt}`, {
        'x-upsert': 'true'
      }),
      body: audioBlob
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Supabase Storage upload error (${res.status}): ${errText}`);
    }

    const publicUrl = `${this.url}/storage/v1/object/public/${this.bucket}/${storagePath}`;
    return { storagePath, publicUrl };
  }

  /**
   * Complete upload workflow: DB Upsert -> Storage Upload -> DB Status Update.
   * Sets status to 'uploaded' on success, which triggers automatic processing
   * in the desktop EchoCRM app via realtime subscription.
   *
   * @param {object} record - Recording metadata including optional customerId
   * @param {Blob} audioBlob - The audio data
   * @param {string} [extension] - File extension override (default: 'webm')
   */
  async uploadRecording(record, audioBlob, extension = 'webm') {
    // 1. Initial status update: uploading
    await this.upsertMeetingRecord({
      ...record,
      status: 'uploading'
    });

    try {
      // 2. Upload file to storage bucket
      const { storagePath, publicUrl } = await this.uploadAudioBlob(record.id, audioBlob, extension);

      // 3. Mark as 'uploaded' — this triggers autoProcessRecording in desktop app
      const updatedRow = await this.upsertMeetingRecord({
        ...record,
        storagePath,
        status: 'uploaded',  // <-- desktop realtime listener picks this up
        lastError: null
      });

      return {
        success: true,
        record: updatedRow,
        publicUrl
      };
    } catch (err) {
      // 4. Mark failure in DB
      await this.upsertMeetingRecord({
        ...record,
        status: 'upload_failed',
        uploadAttempts: (record.uploadAttempts || 0) + 1,
        lastError: err.message || String(err)
      }).catch(() => {});

      throw err;
    }
  }
}

if (typeof window !== 'undefined') {
  window.supabaseClient = new SupabaseExtensionClient();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SupabaseExtensionClient };
}
