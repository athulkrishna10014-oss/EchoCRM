/**
 * EchoCRM Popup Script v1.4
 * Handles meeting detection, WebRTC injector readiness, live VAD meters,
 * speaker attribution timeline, customer selection/creation, and audio file upload.
 */

let activeTab = null;
let detectedPlatform = null;
let timerInterval = null;
let cloudIsSignedIn = false;

// Selected customer state — authoritative for both recording and file upload
let selectedCustomer = null; // { id, name } or null

// File upload state
let pendingUploadFile = null; // File object
let pendingUploadId = null;   // UUID for the upload recording

// DOM Elements
const idleView = document.getElementById('idleView');
const recordingView = document.getElementById('recordingView');
const liveBadge = document.getElementById('liveBadge');
const detectedPlatformBadge = document.getElementById('detectedPlatformBadge');
const meetingTitle = document.getElementById('meetingTitle');
const meetingUrl = document.getElementById('meetingUrl');
const copyNoticeBtn = document.getElementById('copyNoticeBtn');
const copyToast = document.getElementById('copyToast');
const startRecordBtn = document.getElementById('startRecordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const micPermissionBtn = document.getElementById('micPermissionBtn');
const recordingTimer = document.getElementById('recordingTimer');
const recPlatformName = document.getElementById('recPlatformName');
const currentSpeakerBadge = document.getElementById('currentSpeakerBadge');
const micVadStatus = document.getElementById('micVadStatus');
const remoteVadStatus = document.getElementById('remoteVadStatus');
const micMeterBar = document.getElementById('micMeterBar');
const remoteMeterBar = document.getElementById('remoteMeterBar');
const disclosureStatusBadge = document.getElementById('disclosureStatusBadge');
const injectorBadge = document.getElementById('injectorBadge');
const injectorTip = document.getElementById('injectorTip');
const recordingsCount = document.getElementById('recordingsCount');
const recordingsList = document.getElementById('recordingsList');
const alertBanner = document.getElementById('alertBanner');
const alertText = document.getElementById('alertText');
const alertCloseBtn = document.getElementById('alertCloseBtn');
const playerModal = document.getElementById('playerModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalMeta = document.getElementById('modalMeta');
const audioPreview = document.getElementById('audioPreview');
const statSalespersonVal = document.getElementById('statSalespersonVal');
const statRemoteVal = document.getElementById('statRemoteVal');
const statOverlapVal = document.getElementById('statOverlapVal');
const timelineList = document.getElementById('timelineList');

const cloudStatusBadge = document.getElementById('cloudStatusBadge');
const cloudSignedOut = document.getElementById('cloudSignedOut');
const cloudSignedIn = document.getElementById('cloudSignedIn');
const cloudEmail = document.getElementById('cloudEmail');
const cloudPassword = document.getElementById('cloudPassword');
const cloudSignInBtn = document.getElementById('cloudSignInBtn');
const cloudSignOutBtn = document.getElementById('cloudSignOutBtn');
const cloudUserEmail = document.getElementById('cloudUserEmail');
const cloudAuthError = document.getElementById('cloudAuthError');

// Customer elements
const customerSearchInput = document.getElementById('customerSearchInput');
const customerSearchResults = document.getElementById('customerSearchResults');
const selectedCustomerBadge = document.getElementById('selectedCustomerBadge');
const selectedCustomerDisplay = document.getElementById('selectedCustomerDisplay');
const selectedCustomerName = document.getElementById('selectedCustomerName');
const clearCustomerBtn = document.getElementById('clearCustomerBtn');
const addCustomerBtn = document.getElementById('addCustomerBtn');
const addCustomerForm = document.getElementById('addCustomerForm');
const newCustName = document.getElementById('newCustName');
const newCustEmail = document.getElementById('newCustEmail');
const newCustPhone = document.getElementById('newCustPhone');
const newCustCompany = document.getElementById('newCustCompany');
const cancelAddCustomerBtn = document.getElementById('cancelAddCustomerBtn');
const saveNewCustomerBtn = document.getElementById('saveNewCustomerBtn');
const addCustomerError = document.getElementById('addCustomerError');

// Upload elements
const audioFileInput = document.getElementById('audioFileInput');
const selectAudioFileBtn = document.getElementById('selectAudioFileBtn');
const uploadConfirmPanel = document.getElementById('uploadConfirmPanel');
const uploadFileName = document.getElementById('uploadFileName');
const uploadCustomerName = document.getElementById('uploadCustomerName');
const changeUploadCustomerBtn = document.getElementById('changeUploadCustomerBtn');
const cancelUploadBtn = document.getElementById('cancelUploadBtn');
const confirmUploadBtn = document.getElementById('confirmUploadBtn');
const uploadProgress = document.getElementById('uploadProgress');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadProgressLabel = document.getElementById('uploadProgressLabel');

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await checkStatus();
  await initCloud();
  await detectActiveTabMeeting();
  await loadRecordingsList();
});

// ---------------------------------------------------------------------------
// Cloud sync authentication
// ---------------------------------------------------------------------------
async function initCloud() {
  if (!window.supabaseClient) return;
  try {
    const isConfigured = await window.supabaseClient.isConfigured();
    if (!isConfigured) {
      renderCloudNotConfigured();
      return;
    }
    const session = await window.supabaseClient.getValidSession();
    renderCloudState(session);
  } catch (e) {
    renderCloudState(null);
  }
}

function renderCloudNotConfigured() {
  cloudIsSignedIn = false;
  cloudSignedOut.classList.remove('hidden');
  cloudSignedIn.classList.add('hidden');
  cloudStatusBadge.textContent = 'CONFIG NEEDED';
  cloudStatusBadge.className = 'platform-badge unverified';
  showCloudError('Supabase config missing: run "npm run config:extension" to sync credentials.');
  loadRecordingsList();
}

function renderCloudState(session) {
  const signedIn = Boolean(session && session.user);
  cloudIsSignedIn = signedIn;
  if (signedIn) {
    cloudSignedOut.classList.add('hidden');
    cloudSignedIn.classList.remove('hidden');
    cloudUserEmail.textContent = session.user.email || 'your account';
    cloudStatusBadge.textContent = 'SYNCING';
    cloudStatusBadge.className = 'platform-badge meet';
  } else {
    cloudSignedOut.classList.remove('hidden');
    cloudSignedIn.classList.add('hidden');
    cloudStatusBadge.textContent = 'SIGN IN';
    cloudStatusBadge.className = 'platform-badge unverified';
  }
  loadRecordingsList();
}

function showCloudError(message) {
  cloudAuthError.textContent = message;
  cloudAuthError.classList.remove('hidden');
}

function hideCloudError() {
  cloudAuthError.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Customer selection
// ---------------------------------------------------------------------------

function setSelectedCustomer(customer) {
  selectedCustomer = customer;
  if (customer) {
    selectedCustomerName.textContent = customer.name;
    selectedCustomerDisplay.classList.remove('hidden');
    selectedCustomerBadge.textContent = customer.name;
    selectedCustomerBadge.className = 'platform-badge meet';
    clearCustomerBtn.classList.remove('hidden');
    customerSearchInput.value = '';
    customerSearchResults.classList.add('hidden');
    // Update upload confirmation if visible
    updateUploadCustomerDisplay();
  } else {
    selectedCustomerDisplay.classList.add('hidden');
    selectedCustomerBadge.textContent = 'Not selected';
    selectedCustomerBadge.className = 'platform-badge unverified';
    clearCustomerBtn.classList.add('hidden');
    updateUploadCustomerDisplay();
  }
}

function updateUploadCustomerDisplay() {
  if (uploadCustomerName) {
    uploadCustomerName.textContent = selectedCustomer
      ? selectedCustomer.name
      : 'Auto-detect from recording (creates temporary customer)';
  }
}

let searchDebounceTimer = null;

async function handleCustomerSearch(query) {
  if (!window.supabaseClient || !cloudIsSignedIn) return;
  if (!query || !query.trim()) {
    customerSearchResults.innerHTML = '';
    customerSearchResults.classList.add('hidden');
    return;
  }

  try {
    const results = await window.supabaseClient.searchCustomers(query);
    customerSearchResults.innerHTML = '';
    if (results.length === 0) {
      customerSearchResults.innerHTML = '<div class="customer-result-item no-results">No customers found</div>';
    } else {
      results.forEach(c => {
        const item = document.createElement('div');
        item.className = 'customer-result-item';
        item.textContent = c.name + (c.company ? ` — ${c.company}` : '');
        item.addEventListener('click', () => {
          setSelectedCustomer({ id: c.id, name: c.name });
          customerSearchResults.classList.add('hidden');
          addCustomerForm.classList.add('hidden');
        });
        customerSearchResults.appendChild(item);
      });
    }
    customerSearchResults.classList.remove('hidden');
  } catch (err) {
    console.error('Customer search error:', err);
  }
}

async function handleSaveNewCustomer() {
  const name = (newCustName.value || '').trim();
  if (!name) {
    addCustomerError.textContent = 'Customer name is required.';
    addCustomerError.classList.remove('hidden');
    return;
  }

  const email = (newCustEmail.value || '').trim();
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      addCustomerError.textContent = 'Please provide a valid email address.';
      addCustomerError.classList.remove('hidden');
      return;
    }
  }

  if (!window.supabaseClient || !cloudIsSignedIn) {
    addCustomerError.textContent = 'You must be signed in to create a customer.';
    addCustomerError.classList.remove('hidden');
    return;
  }

  saveNewCustomerBtn.disabled = true;
  saveNewCustomerBtn.textContent = 'Saving...';
  addCustomerError.classList.add('hidden');

  try {
    const created = await window.supabaseClient.createCustomer({
      name,
      email: email || null,
      phone: (newCustPhone.value || '').trim() || null,
      company: (newCustCompany.value || '').trim() || null,
      tags: []
    });

    setSelectedCustomer({ id: created.id, name: created.name });
    addCustomerForm.classList.add('hidden');
    // Reset form
    newCustName.value = '';
    newCustEmail.value = '';
    newCustPhone.value = '';
    newCustCompany.value = '';
  } catch (err) {
    addCustomerError.textContent = err.message || 'Failed to create customer.';
    addCustomerError.classList.remove('hidden');
  } finally {
    saveNewCustomerBtn.disabled = false;
    saveNewCustomerBtn.textContent = 'Save Customer';
  }
}

// ---------------------------------------------------------------------------
// Audio file upload
// ---------------------------------------------------------------------------

function showUploadConfirmPanel(file) {
  uploadFileName.textContent = file.name;
  updateUploadCustomerDisplay();
  uploadConfirmPanel.classList.remove('hidden');
  uploadProgress.classList.add('hidden');
  uploadProgressBar.style.width = '0%';
  confirmUploadBtn.disabled = false;
  confirmUploadBtn.textContent = 'Upload & Process';
}

function hideUploadConfirmPanel() {
  uploadConfirmPanel.classList.add('hidden');
  pendingUploadFile = null;
  pendingUploadId = null;
  audioFileInput.value = '';
}

function getFileExtension(filename) {
  return filename.split('.').pop() || 'webm';
}

async function handleConfirmUpload() {
  if (!pendingUploadFile) return;

  if (!window.supabaseClient || !cloudIsSignedIn) {
    showAlert('Please sign in to EchoCRM before uploading.');
    return;
  }

  confirmUploadBtn.disabled = true;
  confirmUploadBtn.textContent = 'Uploading...';
  uploadProgress.classList.remove('hidden');
  uploadProgressBar.style.width = '20%';
  uploadProgressLabel.textContent = 'Uploading audio file...';

  try {
    const file = pendingUploadFile;
    const ext = getFileExtension(file.name);
    const uploadId = pendingUploadId || crypto.randomUUID();
    pendingUploadId = uploadId;

    const now = new Date().toISOString();

    // PATH A: Customer manually selected
    // PATH B: No customer selected -> Create temporary customer profile immediately
    let customerId = selectedCustomer ? selectedCustomer.id : null;
    if (!customerId) {
      uploadProgressBar.style.width = '25%';
      uploadProgressLabel.textContent = 'Creating temporary customer profile...';
      const shortId = uploadId.slice(0, 8);
      const tempCustomer = await window.supabaseClient.createCustomer({
        name: `Unknown Customer - ${shortId}`,
        tags: ['temporary', 'auto-detected']
      });
      customerId = tempCustomer.id;
    }

    const record = {
      id: uploadId,
      platform: 'audio_upload',
      meetingUrl: file.name,    // store filename as reference
      startedAt: now,
      stoppedAt: now,
      durationSeconds: 0,
      mimeType: file.type || `audio/${ext}`,
      status: 'local_saved',
      customerId: customerId
    };

    uploadProgressBar.style.width = '50%';
    uploadProgressLabel.textContent = 'Uploading to cloud...';

    await window.supabaseClient.uploadRecording(record, file, ext);

    uploadProgressBar.style.width = '100%';
    uploadProgressLabel.textContent = 'Uploaded! Processing will start automatically.';

    setTimeout(() => {
      hideUploadConfirmPanel();
      syncToast('Audio file uploaded. EchoCRM will process it automatically.');
    }, 2000);

  } catch (err) {
    uploadProgressBar.style.width = '0%';
    uploadProgressLabel.textContent = 'Upload failed.';
    showAlert('Upload failed: ' + (err.message || String(err)));
    confirmUploadBtn.disabled = false;
    confirmUploadBtn.textContent = 'Upload & Process';
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------
function setupEventListeners() {
  copyNoticeBtn.addEventListener('click', () => {
    const noticeText = 'Note: This sales meeting is being recorded for quality, note-taking, and CRM summary purposes.';
    navigator.clipboard.writeText(noticeText).then(() => {
      copyToast.classList.remove('hidden');
      setTimeout(() => copyToast.classList.add('hidden'), 2000);
    });
  });

  micPermissionBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_MIC_PERMISSION' });
  });

  alertCloseBtn.addEventListener('click', () => {
    alertBanner.classList.add('hidden');
  });

  startRecordBtn.addEventListener('click', handleStartRecording);
  stopRecordBtn.addEventListener('click', handleStopRecording);

  cloudSignInBtn.addEventListener('click', async () => {
    hideCloudError();
    const email = (cloudEmail.value || '').trim();
    const password = cloudPassword.value || '';
    if (!email || !password) {
      showCloudError('Enter your EchoCRM email and password.');
      return;
    }
    cloudSignInBtn.disabled = true;
    cloudSignInBtn.textContent = 'Signing in...';
    try {
      const session = await window.supabaseClient.signIn(email, password);
      cloudPassword.value = '';
      renderCloudState(session);
      syncPendingRecordings();
    } catch (err) {
      showCloudError(err.message || 'Sign-in failed.');
    } finally {
      cloudSignInBtn.disabled = false;
      cloudSignInBtn.textContent = 'Sign in to sync';
    }
  });

  cloudSignOutBtn.addEventListener('click', async () => {
    await window.supabaseClient.signOut();
    renderCloudState(null);
    setSelectedCustomer(null);
  });

  closeModalBtn.addEventListener('click', () => {
    playerModal.classList.add('hidden');
    audioPreview.pause();
    if (audioPreview.src) {
      URL.revokeObjectURL(audioPreview.src);
      audioPreview.src = '';
    }
  });

  // Listen for live energy updates from offscreen recorder
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'VAD_ENERGY_UPDATE' && message.energy) {
      updateVadMeters(message.energy);
    } else if (message.type === 'RECORDING_COMPLETED' || message.type === 'RECORDING_UPLOADED' || message.type === 'RECORDING_UPLOAD_FAILED') {
      loadRecordingsList();
    }
  });

  // ── Customer event listeners ────────────────────────────────────────────────

  customerSearchInput.addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    const val = e.target.value;
    searchDebounceTimer = setTimeout(() => handleCustomerSearch(val), 300);
  });

  // Close search results when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#customerCard')) {
      customerSearchResults.classList.add('hidden');
    }
  });

  clearCustomerBtn.addEventListener('click', () => {
    setSelectedCustomer(null);
    customerSearchInput.value = '';
  });

  addCustomerBtn.addEventListener('click', () => {
    addCustomerForm.classList.toggle('hidden');
    customerSearchResults.classList.add('hidden');
    addCustomerError.classList.add('hidden');
  });

  cancelAddCustomerBtn.addEventListener('click', () => {
    addCustomerForm.classList.add('hidden');
    addCustomerError.classList.add('hidden');
  });

  saveNewCustomerBtn.addEventListener('click', handleSaveNewCustomer);

  // ── Audio upload event listeners ───────────────────────────────────────────

  selectAudioFileBtn.addEventListener('click', () => {
    audioFileInput.click();
  });

  audioFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    // Validate MIME type / extension
    const ext = getFileExtension(file.name).toLowerCase();
    const supported = ['mp3', 'wav', 'm4a', 'webm', 'flac', 'ogg', 'aac', 'wma'];
    if (!supported.includes(ext)) {
      showAlert(`Unsupported file format: .${ext}. Supported: ${supported.join(', ')}`);
      audioFileInput.value = '';
      return;
    }

    pendingUploadFile = file;
    pendingUploadId = crypto.randomUUID();
    showUploadConfirmPanel(file);
  });

  changeUploadCustomerBtn.addEventListener('click', () => {
    // Scroll/focus customer search
    customerSearchInput.focus();
    customerSearchInput.scrollIntoView({ behavior: 'smooth' });
  });

  cancelUploadBtn.addEventListener('click', () => {
    hideUploadConfirmPanel();
  });

  confirmUploadBtn.addEventListener('click', handleConfirmUpload);
}

// ---------------------------------------------------------------------------
// VAD meters
// ---------------------------------------------------------------------------
function updateVadMeters(energy) {
  const micPct = Math.round(energy.mic * 100);
  const remotePct = Math.round(energy.remote * 100);

  if (micMeterBar) micMeterBar.style.width = `${micPct}%`;
  if (remoteMeterBar) remoteMeterBar.style.width = `${remotePct}%`;

  if (micVadStatus) {
    if (micPct > 15) {
      micVadStatus.className = 'vad-tag active';
      micVadStatus.textContent = 'SPEAKING';
    } else {
      micVadStatus.className = 'vad-tag inactive';
      micVadStatus.textContent = 'IDLE';
    }
  }

  if (remoteVadStatus) {
    if (remotePct > 15) {
      remoteVadStatus.className = 'vad-tag active';
      remoteVadStatus.textContent = 'SPEAKING';
    } else {
      remoteVadStatus.className = 'vad-tag inactive';
      remoteVadStatus.textContent = 'IDLE';
    }
  }

  if (currentSpeakerBadge) {
    const speaker = energy.speaker || 'SILENCE';
    currentSpeakerBadge.textContent = speaker;
    currentSpeakerBadge.className = `badge speaker-badge ${speaker}`;
  }
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
function showAlert(message) {
  alertText.textContent = message;
  alertBanner.classList.remove('hidden');
}

function hideAlert() {
  alertBanner.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Meeting detection
// ---------------------------------------------------------------------------
async function detectActiveTabMeeting() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    activeTab = tab;

    const url = tab.url || '';
    meetingUrl.textContent = url || 'No URL';
    meetingTitle.textContent = tab.title || 'Untitled Tab';

    if (url.includes('meet.google.com')) {
      detectedPlatform = { platform: 'google_meet', name: 'Google Meet', badgeClass: 'meet' };
    } else if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) {
      detectedPlatform = { platform: 'ms_teams', name: 'Microsoft Teams Web', badgeClass: 'teams' };
    } else if (url.includes('zoom.us')) {
      detectedPlatform = { platform: 'zoom', name: 'Zoom Web', badgeClass: 'zoom' };
    } else {
      detectedPlatform = { platform: 'generic_tab', name: 'Browser Tab', badgeClass: 'unverified' };
    }

    detectedPlatformBadge.textContent = detectedPlatform.name;
    detectedPlatformBadge.className = `platform-badge ${detectedPlatform.badgeClass}`;

    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'GET_MEETING_INFO' }, (res) => {
        if (chrome.runtime.lastError || !res) {
          injectorBadge.textContent = 'LOCAL ONLY';
          injectorBadge.className = 'disclosure-badge unhooked';
          injectorTip.textContent = 'Meeting opened before extension. Reload meeting tab to enable WebRTC remote injection.';
          return;
        }

        if (res.injector && res.injector.hookActive) {
          injectorBadge.textContent = 'WEBRTC READY';
          injectorBadge.className = 'disclosure-badge ready';
          injectorTip.textContent = 'WebRTC hook is active. Remote participants will hear disclosure announcement.';
        } else {
          injectorBadge.textContent = 'LOCAL ONLY';
          injectorBadge.className = 'disclosure-badge unhooked';
          injectorTip.textContent = 'Meeting opened before extension. Reload meeting tab to enable WebRTC remote injection.';
        }
      });
    }
  } catch (err) {
    console.error('Error detecting active tab:', err);
  }
}

// ---------------------------------------------------------------------------
// Recording status check
// ---------------------------------------------------------------------------
async function checkStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (response && response.success && response.state && response.state.isRecording) {
      showRecordingView(response.state);
    } else {
      showIdleView();
    }
  } catch (e) {
    console.error('Error checking status:', e);
    showIdleView();
  }
}

function showIdleView() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  idleView.classList.remove('hidden');
  recordingView.classList.add('hidden');
  liveBadge.textContent = 'IDLE';
  liveBadge.className = 'status-pill idle';
}

function showRecordingView(state) {
  idleView.classList.add('hidden');
  recordingView.classList.remove('hidden');
  liveBadge.textContent = 'REC';
  liveBadge.className = 'status-pill recording';

  const platformName = state.platform === 'google_meet' ? 'Google Meet' :
    state.platform === 'ms_teams' ? 'Microsoft Teams Web' :
    state.platform === 'zoom' ? 'Zoom Web' : 'Browser Meeting';

  recPlatformName.textContent = platformName;

  const startTime = state.startedAt ? new Date(state.startedAt).getTime() : Date.now();
  updateTimerDisplay(startTime);

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    updateTimerDisplay(startTime);
  }, 500);
}

function updateTimerDisplay(startTime) {
  const elapsedSecs = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  const hrs = String(Math.floor(elapsedSecs / 3600)).padStart(2, '0');
  const mins = String(Math.floor((elapsedSecs % 3600) / 60)).padStart(2, '0');
  const secs = String(elapsedSecs % 60).padStart(2, '0');
  recordingTimer.textContent = `${hrs}:${mins}:${secs}`;
}

const localDisclosureBadge = document.getElementById('localDisclosureBadge');
const remoteDisclosureBadge = document.getElementById('remoteDisclosureBadge');

// ---------------------------------------------------------------------------
// Recording start/stop — now includes customer_id in payload
// ---------------------------------------------------------------------------
async function handleStartRecording() {
  hideAlert();
  if (!activeTab || !activeTab.id) {
    showAlert('No active tab detected.');
    return;
  }

  startRecordBtn.disabled = true;
  startRecordBtn.innerHTML = '<span>Preparing recording...</span>';

  try {
    let recordingCustomerId = selectedCustomer ? selectedCustomer.id : null;
    if (!recordingCustomerId && cloudIsSignedIn && window.supabaseClient) {
      try {
        const shortId = crypto.randomUUID().slice(0, 8);
        const tempCustomer = await window.supabaseClient.createCustomer({
          name: `Unknown Customer - ${shortId}`,
          tags: ['temporary', 'auto-detected']
        });
        recordingCustomerId = tempCustomer.id;
      } catch (e) {
        console.warn('Temporary customer pre-creation skipped:', e);
      }
    }

    const payload = {
      tabId: activeTab.id,
      platform: detectedPlatform ? detectedPlatform.platform : 'unknown',
      meetingUrl: activeTab.url,
      startedAt: new Date().toISOString(),
      customerId: recordingCustomerId
    };

    setTimeout(() => {
      if (startRecordBtn.disabled) {
        startRecordBtn.innerHTML = '<span>🔊 Playing recording disclosure...</span>';
      }
    }, 600);

    const response = await chrome.runtime.sendMessage({
      type: 'START_RECORDING',
      payload
    });

    if (!response || !response.success) {
      const err = (response && response.error) || 'Failed to start recording.';
      if (err.includes('Microphone') || err.includes('Permission')) {
        micPermissionBtn.classList.remove('hidden');
      }
      throw new Error(err);
    }

    if (localDisclosureBadge) {
      localDisclosureBadge.textContent = '● Played locally';
      localDisclosureBadge.className = 'stream-status active';
    }

    if (remoteDisclosureBadge) {
      if (response.disclosure && response.disclosure.disclosureDelivered) {
        remoteDisclosureBadge.textContent = '● Delivered';
        remoteDisclosureBadge.className = 'stream-status active';
      } else {
        remoteDisclosureBadge.textContent = '⚠ Not supported on this platform / Reload tab';
        remoteDisclosureBadge.className = 'stream-status warning';
      }
    }

    showRecordingView({
      startedAt: response.startedAt,
      platform: payload.platform
    });
  } catch (err) {
    showAlert(err.message || String(err));
    startRecordBtn.disabled = false;
    startRecordBtn.innerHTML = '<div class="btn-rec-dot"></div>Start Recording';
  }
}

async function handleStopRecording() {
  stopRecordBtn.disabled = true;
  stopRecordBtn.textContent = 'Stopping...';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    if (!response || !response.success) {
      throw new Error((response && response.error) || 'Failed to stop recording cleanly.');
    }
    showIdleView();
    await loadRecordingsList();
  } catch (err) {
    showAlert(err.message || String(err));
  } finally {
    stopRecordBtn.disabled = false;
    stopRecordBtn.innerHTML = `
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
        <rect x="5" y="5" width="14" height="14" rx="2" />
      </svg>
      Stop Recording
    `;
  }
}

// ---------------------------------------------------------------------------
// Recordings list
// ---------------------------------------------------------------------------
const SYNC_STATUS = {
  uploaded: { label: 'Synced', cls: 'uploaded' },
  uploading: { label: 'Uploading', cls: 'uploading' },
  auth_required: { label: 'Sign in', cls: 'pending' },
  upload_failed: { label: 'Failed', cls: 'failed' },
  local_saved: { label: 'Local', cls: 'local' },
  recording: { label: 'Local', cls: 'local' }
};

async function loadRecordingsList() {
  if (!window.recordingStore) return;

  try {
    const items = await window.recordingStore.listRecordings();
    recordingsCount.textContent = items.length;

    if (items.length === 0) {
      recordingsList.innerHTML = '<div class="empty-state">No local recordings yet.</div>';
      return;
    }

    recordingsList.innerHTML = '';
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'recording-item';

      const dateStr = new Date(item.startedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const sizeStr = item.sizeBytes ? `${(item.sizeBytes / (1024 * 1024)).toFixed(2)} MB` : '0 MB';
      const durationStr = `${item.durationSeconds || 0}s`;

      const status = SYNC_STATUS[item.status] || SYNC_STATUS.local_saved;
      const canSync = Boolean(item.hasBlob) && item.status !== 'uploaded' && item.status !== 'uploading';

      row.innerHTML = `
        <div class="item-info">
          <div class="item-id" title="${item.id}.webm">${item.id.slice(0, 8)}...webm</div>
          <div class="item-meta">
            <span>${dateStr}</span>
            <span>&bull;</span>
            <span>${durationStr}</span>
            <span>&bull;</span>
            <span>${sizeStr}</span>
            <span class="sync-tag ${status.cls}">${status.label}</span>
          </div>
        </div>
        <div class="item-actions">
          ${canSync ? `
          <button class="icon-btn sync-btn" data-id="${item.id}" title="Sync to EchoCRM">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01.88-7.9 5 5 0 019.9-1.2A4.5 4.5 0 1117 16H7z"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 12v6m0-6l-2.5 2.5M12 12l2.5 2.5"/>
            </svg>
          </button>` : ''}
          <button class="icon-btn play-btn" data-id="${item.id}" title="Play &amp; Speaker Attribution">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
          <button class="icon-btn download-btn" data-id="${item.id}" title="Download WebM">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
          </button>
          <button class="icon-btn delete-btn" data-id="${item.id}" title="Delete Local">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      `;

      const syncBtn = row.querySelector('.sync-btn');
      if (syncBtn) syncBtn.addEventListener('click', () => syncRecording(item.id));
      row.querySelector('.play-btn').addEventListener('click', () => playRecording(item.id));
      row.querySelector('.download-btn').addEventListener('click', () => downloadRecording(item.id));
      row.querySelector('.delete-btn').addEventListener('click', () => deleteRecording(item.id));

      recordingsList.appendChild(row);
    });
  } catch (err) {
    console.error('Error loading recordings list:', err);
  }
}

/**
 * Manually upload a locally stored recording to Supabase.
 * Carries the currently selected customer_id if one is set.
 */
async function syncRecording(id) {
  if (!window.supabaseClient || !window.recordingStore) return;
  if (!cloudIsSignedIn) {
    showAlert('Sign in to EchoCRM above before syncing recordings.');
    return;
  }

  try {
    const record = await window.recordingStore.getRecording(id);
    if (!record || !record.blob) {
      showAlert('Recording file not found.');
      return;
    }

    // Carry customer selection into the uploaded record, or create temporary customer if none
    let syncCustomerId = selectedCustomer ? selectedCustomer.id : (record.customerId || null);
    if (!syncCustomerId && cloudIsSignedIn && window.supabaseClient) {
      try {
        const shortId = id.slice(0, 8);
        const tempCustomer = await window.supabaseClient.createCustomer({
          name: `Unknown Customer - ${shortId}`,
          tags: ['temporary', 'auto-detected']
        });
        syncCustomerId = tempCustomer.id;
      } catch (e) {
        console.warn('Temporary customer creation for sync deferred:', e);
      }
    }

    const enrichedRecord = {
      ...record,
      customerId: syncCustomerId
    };

    await window.recordingStore.updateRecording(id, { status: 'uploading', lastError: null });
    await loadRecordingsList();

    await window.supabaseClient.uploadRecording(enrichedRecord, record.blob, 'webm');
    await window.recordingStore.updateRecording(id, { status: 'uploaded', lastError: null });
    syncToast('Recording synced to EchoCRM.');
  } catch (err) {
    await window.recordingStore.updateRecording(id, {
      status: 'upload_failed',
      lastError: err.message || String(err)
    });
    showAlert('Sync failed: ' + (err.message || String(err)));
  } finally {
    await loadRecordingsList();
  }
}

/**
 * Upload every local recording that is not yet synced. Called after sign-in.
 */
async function syncPendingRecordings() {
  if (!cloudIsSignedIn || !window.recordingStore) return;
  try {
    const items = await window.recordingStore.listRecordings();
    const pending = items.filter((item) => item.hasBlob && item.status !== 'uploaded');
    for (const item of pending) {
      await syncRecording(item.id);
    }
  } catch (err) {
    console.error('Error syncing pending recordings:', err);
  }
}

function syncToast(message) {
  if (!copyToast) return;
  copyToast.textContent = message;
  copyToast.classList.remove('hidden');
  setTimeout(() => copyToast.classList.add('hidden'), 2200);
}

async function playRecording(id) {
  try {
    const record = await window.recordingStore.getRecording(id);
    if (!record || !record.blob) {
      showAlert('Could not load recording audio blob.');
      return;
    }

    const { blob, ...meta } = record;
    modalMeta.textContent = JSON.stringify(meta, null, 2);

    const stats = record.speakerStats || {};
    statSalespersonVal.textContent = `${stats.salespersonPercent || 0}%`;
    statRemoteVal.textContent = `${stats.remotePercent || 0}%`;
    statOverlapVal.textContent = `${stats.overlapPercent || 0}%`;

    const timeline = record.speakerTimeline || [];
    timelineList.innerHTML = '';

    if (timeline.length === 0) {
      timelineList.innerHTML = '<div class="timeline-row">No speech segments detected</div>';
    } else {
      timeline.forEach((seg) => {
        const row = document.createElement('div');
        row.className = 'timeline-row';
        row.innerHTML = `
          <span class="seg-speaker ${seg.speaker}">${seg.speaker}</span>
          <span class="seg-time">${seg.startSec}s - ${seg.endSec}s (${seg.durationSec}s)</span>
        `;
        timelineList.appendChild(row);
      });
    }

    const audioUrl = URL.createObjectURL(blob);
    audioPreview.src = audioUrl;
    playerModal.classList.remove('hidden');
    audioPreview.play().catch(() => {});
  } catch (e) {
    showAlert(`Playback error: ${e.message}`);
  }
}

async function downloadRecording(id) {
  try {
    const record = await window.recordingStore.getRecording(id);
    if (!record || !record.blob) {
      showAlert('Recording file not found.');
      return;
    }

    const url = URL.createObjectURL(record.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${record.id}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    showAlert(`Download error: ${e.message}`);
  }
}

async function deleteRecording(id) {
  if (confirm('Delete this local recording?')) {
    try {
      await window.recordingStore.deleteRecording(id);
      await loadRecordingsList();
    } catch (e) {
      showAlert(`Delete error: ${e.message}`);
    }
  }
}
