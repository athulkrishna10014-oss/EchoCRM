/**
 * EchoCRM Offscreen Audio Recorder Engine
 * - Captures SALESPERSON_MIC and REMOTE_AUDIO in isolated channels
 * - Controls remote participant WebRTC disclosure injection with verified tracking
 * - Runs real-time SpeakerSegmenter (VAD) generating a structured speaker timeline
 * - Preserves live tab playback and saves complete recordings locally in IndexedDB
 */

let mediaRecorder = null;
let recordedChunks = [];
let audioMixer = null;
let currentRecordingId = null;
let currentMetadata = null;
let disclosureResult = null;
let chunkIndex = 0;
let startTime = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;

  switch (message.type) {
    case 'START_RECORDING':
      startRecording(message.data)
        .then((res) => sendResponse({ success: true, ...res }))
        .catch((err) => sendResponse({ success: false, error: err.message || String(err) }));
      return true; // async response

    case 'STOP_RECORDING':
      stopRecording()
        .then((res) => sendResponse({ success: true, ...res }))
        .catch((err) => sendResponse({ success: false, error: err.message || String(err) }));
      return true; // async response

    case 'GET_STATUS':
      sendResponse({
        isRecording: Boolean(mediaRecorder && mediaRecorder.state === 'recording'),
        recordingId: currentRecordingId,
        startTime: startTime,
        metadata: currentMetadata,
        disclosureResult: disclosureResult,
        energy: audioMixer ? audioMixer.getCurrentEnergy() : { mic: 0, remote: 0, speaker: 'SILENCE' }
      });
      return false;

    default:
      return false;
  }
});

async function startRecording({ streamId, recordingId, metadata, tabId }) {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    throw new Error('Recording is already in progress.');
  }

  currentRecordingId = recordingId;
  currentMetadata = metadata;
  recordedChunks = [];
  chunkIndex = 0;
  startTime = Date.now();

  try {
    // 1. Capture Meeting Tab Audio (REMOTE_AUDIO)
    const tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    if (!tabStream || tabStream.getAudioTracks().length === 0) {
      throw new Error('Failed to acquire meeting tab audio stream.');
    }

    // 2. Capture Salesperson Microphone (SALESPERSON_MIC)
    let micStream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true
        },
        video: false
      });
    } catch (micErr) {
      tabStream.getTracks().forEach((t) => t.stop());
      throw new Error(`Microphone access error: ${micErr.message || micErr.name}. Please grant microphone permission.`);
    }

    if (!micStream || micStream.getAudioTracks().length === 0) {
      tabStream.getTracks().forEach((t) => t.stop());
      throw new Error('No audio track found on microphone stream.');
    }

    // 3. Setup Audio Mixer with Live Playback & Speaker Segmentation
    audioMixer = new AudioMixer();
    const mixedStream = await audioMixer.initialize(tabStream, micStream, (energy) => {
      // Broadcast live energy to popup if needed
      chrome.runtime.sendMessage({
        type: 'VAD_ENERGY_UPDATE',
        energy
      }).catch(() => {});
    });

    // 4. MediaRecorder Setup (256 kbps Opus Stereo: Ch 0=Mic, Ch 1=Remote)
    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    }

    const options = {
      mimeType: mimeType || undefined,
      audioBitsPerSecond: 256000
    };
    mediaRecorder = new MediaRecorder(mixedStream, options);

    // Non-blocking chunk capture to IndexedDB
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
        const idx = chunkIndex++;
        if (window.recordingStore && currentRecordingId) {
          window.recordingStore.saveChunk(currentRecordingId, idx, event.data).catch(() => {});
        }
      }
    };

    // Auto-stop if meeting tab audio track ends
    const tabTrack = tabStream.getAudioTracks()[0];
    if (tabTrack) {
      tabTrack.onended = () => {
        console.log('Meeting tab audio ended. Stopping recording.');
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          stopRecording().catch((e) => console.error('Auto-stop error:', e));
          chrome.runtime.sendMessage({ type: 'RECORDING_AUTO_STOPPED', reason: 'TAB_AUDIO_ENDED' });
        }
      };
    }

    mediaRecorder.onerror = (e) => {
      console.error('MediaRecorder error:', e);
      chrome.runtime.sendMessage({ type: 'RECORDING_ERROR', error: e.error ? e.error.message : 'MediaRecorder error' });
    };

    mediaRecorder.start(1000);

    // 5. Trigger Automatic Customer Disclosure (WebRTC Injection + Local & Recording Capture)
    const disclosureAudioUrl = chrome.runtime.getURL('assets/recording-disclosure.wav');
    disclosureResult = {
      disclosureAttempted: true,
      disclosureDelivered: false,
      disclosureMethod: 'unverified',
      disclosureTimestamp: new Date().toISOString(),
      platform: metadata.platform || 'unknown',
      notes: ''
    };

    // Start local playback and recording path for disclosure
    const localDisclosurePromise = window.disclosureManager
      ? window.disclosureManager.playLocalAndRecord(audioMixer.getAudioContext(), audioMixer.getMicInputNode())
      : Promise.resolve();

    // Trigger WebRTC Injection in meeting tab
    if (tabId) {
      try {
        const injectionResponse = await chrome.tabs.sendMessage(tabId, {
          type: 'TRIGGER_REMOTE_DISCLOSURE',
          audioUrl: disclosureAudioUrl
        });

        if (injectionResponse && injectionResponse.delivered) {
          disclosureResult.disclosureDelivered = true;
          disclosureResult.disclosureMethod = 'webrtc_mic_injection';
          disclosureResult.notes = 'Transmitted directly into outgoing WebRTC microphone track. Remote participant heard announcement.';
        } else {
          disclosureResult.disclosureDelivered = false;
          disclosureResult.disclosureMethod = 'local_only';
          disclosureResult.notes = (injectionResponse && injectionResponse.details) || 'Meeting tab audio hook was inactive. Reload meeting tab to enable WebRTC injection.';
        }
      } catch (injectionErr) {
        disclosureResult.disclosureDelivered = false;
        disclosureResult.disclosureMethod = 'local_only';
        disclosureResult.notes = 'Could not communicate with meeting tab injector (tab may need reload).';
      }
    }

    await localDisclosurePromise;

    // Save initial record to IndexedDB
    if (window.recordingStore) {
      await window.recordingStore.saveRecording({
        id: recordingId,
        platform: metadata.platform || 'unknown',
        meetingUrl: metadata.meetingUrl || '',
        startedAt: metadata.startedAt || new Date().toISOString(),
        status: 'recording',
        salespersonAudioSource: 'SALESPERSON_MIC',
        remoteAudioSource: 'REMOTE_AUDIO',
        disclosureAttempted: disclosureResult.disclosureAttempted,
        disclosureDelivered: disclosureResult.disclosureDelivered,
        disclosureMethod: disclosureResult.disclosureMethod,
        disclosureTimestamp: disclosureResult.disclosureTimestamp,
        mimeType: mediaRecorder.mimeType || mimeType
      });
    }

    return {
      recordingId,
      mimeType: mediaRecorder.mimeType || mimeType,
      startedAt: metadata.startedAt,
      disclosure: disclosureResult
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}

async function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    return { recordingId: currentRecordingId, message: 'Recorder already inactive.' };
  }

  const recordingId = currentRecordingId;
  const metadata = currentMetadata || {};
  const endedAt = new Date().toISOString();
  const durationSeconds = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
  const disclosure = disclosureResult || {};

  // Stop segmentation analysis and retrieve speaker timeline
  const segmentationResult = audioMixer ? audioMixer.stopSegmentation() : { timeline: [], stats: {} };

  return new Promise((resolve, reject) => {
    mediaRecorder.onstop = async () => {
      try {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const finalBlob = new Blob(recordedChunks, { type: mimeType });

        const finalRecord = {
          id: recordingId,
          platform: metadata.platform || 'unknown',
          meetingUrl: metadata.meetingUrl || '',
          startedAt: metadata.startedAt || new Date(startTime).toISOString(),
          stoppedAt: endedAt,
          durationSeconds: durationSeconds,
          status: 'local_saved',
          salespersonAudioSource: 'SALESPERSON_MIC',
          remoteAudioSource: 'REMOTE_AUDIO',
          disclosureAttempted: Boolean(disclosure.disclosureAttempted),
          disclosureDelivered: Boolean(disclosure.disclosureDelivered),
          disclosureMethod: disclosure.disclosureMethod || 'local_only',
          disclosureTimestamp: disclosure.disclosureTimestamp || null,
          disclosureNotes: disclosure.notes || '',
          speakerTimeline: segmentationResult.timeline || [],
          speakerStats: segmentationResult.stats || {},
          mimeType: mimeType,
          chunkCount: recordedChunks.length,
          sizeBytes: finalBlob.size,
          // Authoritative customer_id if manually supplied, or null
          customerId: metadata.customerId || null
        };

        // Persist complete recording and segmentation locally to IndexedDB
        if (window.recordingStore) {
          await window.recordingStore.saveRecording(finalRecord, finalBlob);
        }

        // Upload to Supabase asynchronously
        if (window.supabaseClient) {
          const session = await window.supabaseClient.getValidSession().catch(() => null);
          if (!session) {
            if (window.recordingStore) {
              await window.recordingStore.updateRecording(recordingId, {
                status: 'auth_required',
                lastError: 'Sign in to the EchoCRM extension to sync this recording.'
              });
            }
            chrome.runtime.sendMessage({ type: 'RECORDING_UPLOAD_FAILED', recordingId, error: 'Not signed in' }).catch(() => {});
          } else {
            // If no customer was manually selected, create temporary customer first
            if (!finalRecord.customerId) {
              try {
                const shortId = recordingId.slice(0, 8);
                const tempCust = await window.supabaseClient.createCustomer({
                  name: `Unknown Customer - ${shortId}`,
                  tags: ['temporary', 'auto-detected']
                });
                finalRecord.customerId = tempCust.id;
              } catch (e) {
                console.warn('Temporary customer creation before upload deferred:', e);
              }
            }

            window.supabaseClient.uploadRecording(finalRecord, finalBlob)
              .then(async (uploadResult) => {
                console.log('Successfully uploaded to Supabase:', uploadResult);
                if (window.recordingStore) {
                  await window.recordingStore.updateRecording(recordingId, { status: 'uploaded', lastError: null });
                }
                chrome.runtime.sendMessage({ type: 'RECORDING_UPLOADED', recordingId }).catch(() => {});
              })
              .catch(async (err) => {
                console.error('Failed to upload to Supabase:', err);
                if (window.recordingStore) {
                  await window.recordingStore.updateRecording(recordingId, {
                    status: 'upload_failed',
                    lastError: err.message || String(err)
                  });
                }
                chrome.runtime.sendMessage({ type: 'RECORDING_UPLOAD_FAILED', recordingId, error: err.message }).catch(() => {});
              });
          }
        }

        cleanup();

        // Notify background / popup
        chrome.runtime.sendMessage({
          type: 'RECORDING_COMPLETED',
          record: finalRecord
        });

        resolve({
          recordingId: recordingId,
          record: finalRecord,
          blobSize: finalBlob.size
        });
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    try {
      mediaRecorder.stop();
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

function cleanup() {
  if (audioMixer) {
    audioMixer.cleanup();
    audioMixer = null;
  }
  mediaRecorder = null;
  recordedChunks = [];
}
