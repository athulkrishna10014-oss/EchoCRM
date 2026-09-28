/**
 * EchoCRM Background Service Worker (Manifest V3 - Phase 1 + Phase 2)
 * Coordinates tab capture, offscreen lifecycle, badge status, and crash resilience.
 */

let recordingState = {
  isRecording: false,
  recordingId: null,
  tabId: null,
  platform: null,
  meetingUrl: null,
  startedAt: null,
  customerId: null  // Pre-selected customer UUID (null = AI will identify after upload)
};

// Initialize or sync state on startup
chrome.runtime.onStartup.addListener(async () => {
  await restoreState();
});

chrome.runtime.onInstalled.addListener(async () => {
  await restoreState();
});

async function restoreState() {
  try {
    const data = await chrome.storage.local.get('recordingState');
    if (data && data.recordingState) {
      recordingState = data.recordingState;
      updateBadge();
    }
  } catch (e) {
    console.error('Error restoring state:', e);
  }
}

async function saveState() {
  try {
    await chrome.storage.local.set({ recordingState });
    updateBadge();
  } catch (e) {
    console.error('Error saving state:', e);
  }
}

function updateBadge() {
  if (recordingState.isRecording) {
    chrome.action.setBadgeText({ text: 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

/**
 * Ensures that the MV3 Offscreen document is active
 */
async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');

  if ('getContexts' in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl]
    });
    if (contexts.length > 0) return;
  } else if (chrome.offscreen && chrome.offscreen.hasDocument) {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Capture, disclosure announcement, stereo mix, and Supabase upload'
    });
  } catch (err) {
    if (!err.message.includes('Only a single offscreen document may be created')) {
      throw err;
    }
  }
}

// Handle messages from popup, content scripts, and offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  switch (message.type) {
    case 'GET_STATUS':
      sendResponse({ success: true, state: recordingState });
      return false;

    case 'START_RECORDING':
      handleStartRecording(message.payload)
        .then((res) => sendResponse({ success: true, ...res }))
        .catch((err) => sendResponse({ success: false, error: err.message || String(err) }));
      return true; // async

    case 'MEETING_JOINED':
      if (!recordingState.isRecording && sender.tab && sender.tab.id) {
        console.log('Auto-starting recording for meeting:', message.payload.meetingUrl);
        handleStartRecording({
          tabId: sender.tab.id,
          platform: message.payload.platform,
          meetingUrl: message.payload.meetingUrl
        }).catch(e => console.error('Failed to auto-start recording:', e));
      }
      return false;

    case 'STOP_RECORDING':
      handleStopRecording()
        .then((res) => sendResponse({ success: true, ...res }))
        .catch((err) => sendResponse({ success: false, error: err.message || String(err) }));
      return true; // async

    case 'OPEN_MIC_PERMISSION':
      chrome.tabs.create({ url: chrome.runtime.getURL('permissions/mic-permission.html') });
      sendResponse({ success: true });
      return false;

    case 'RECORDING_COMPLETED':
      console.log('Recording completed event received:', message.record);
      recordingState = {
        isRecording: false,
        recordingId: null,
        tabId: null,
        platform: null,
        meetingUrl: null,
        startedAt: null,
        customerId: null
      };
      saveState();
      return false;

    case 'RECORDING_AUTO_STOPPED':
    case 'RECORDING_ERROR':
      console.warn('Recording auto-stopped / error:', message);
      recordingState.isRecording = false;
      saveState();
      return false;

    case 'MEETING_TAB_UNLOADED':
      if (recordingState.isRecording && sender.tab && sender.tab.id === recordingState.tabId) {
        console.log('Meeting tab unloaded while recording. Stopping recording.');
        handleStopRecording().catch((e) => console.error('Error auto-stopping on unload:', e));
      }
      return false;

    default:
      return false;
  }
});

async function handleStartRecording({ tabId, platform, meetingUrl, customerId = null }) {
  if (recordingState.isRecording) {
    throw new Error('Recording is already in progress.');
  }

  if (!tabId) {
    throw new Error('No active meeting tab specified for recording.');
  }

  // Generate UUID for recording
  const recordingId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  // 1. Obtain streamId via chrome.tabCapture
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  if (!streamId) {
    throw new Error('Failed to acquire tab capture stream ID. Please check tab permissions.');
  }

  // 2. Ensure Offscreen document exists
  await ensureOffscreenDocument();

  // 3. Delegate recording to Offscreen document
  const metadata = {
    platform,
    meetingUrl,
    startedAt,
    customerId: customerId || null  // Passed to offscreen document for storage in IndexedDB
  };

  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'START_RECORDING',
    data: {
      streamId,
      recordingId,
      metadata,
      tabId
    }
  });

  if (!response || !response.success) {
    throw new Error((response && response.error) || 'Failed to start recorder in offscreen document.');
  }

  recordingState = {
    isRecording: true,
    recordingId,
    tabId,
    platform,
    meetingUrl,
    startedAt,
    customerId: customerId || null
  };

  await saveState();

  return {
    recordingId,
    startedAt,
    disclosure: response.disclosure
  };
}

async function handleStopRecording() {
  if (!recordingState.isRecording) {
    return { message: 'Not currently recording.' };
  }

  await ensureOffscreenDocument();

  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'STOP_RECORDING'
  });

  recordingState = {
    isRecording: false,
    recordingId: null,
    tabId: null,
    platform: null,
    meetingUrl: null,
    startedAt: null,
    customerId: null
  };

  await saveState();

  if (!response || !response.success) {
    throw new Error((response && response.error) || 'Failed to stop recorder cleanly.');
  }

  return response;
}

// Auto stop when recorded meeting tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (recordingState.isRecording && recordingState.tabId === tabId) {
    console.log(`Meeting tab ${tabId} was closed. Automatically stopping recording.`);
    handleStopRecording().catch((err) => console.error('Auto-stop tab removed error:', err));
  }
});
