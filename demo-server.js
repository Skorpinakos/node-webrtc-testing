/* eslint-disable strict, no-console, no-empty, func-style, consistent-return */


// demo-server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const wrtc = require('./');  // your JS wrapper with setFieldTrials exposed

// 1. Enable the L4S / RFC8888-related field trials BEFORE creating any PCs
wrtc.setFieldTrials(
  'WebRTC-RFC8888CongestionControlFeedback/Enabled,offer:true,force_send:true/' +
  'WebRTC-Bwe-ScreamV2/Enabled/'
);

// Simple in-memory store for the current PeerConnection (one-at-a-time demo)
let currentPc = null;

// Optional: if you later want to buffer remote candidates before the offer is set
let pendingRemoteCandidates = [];

/**
 * Create and configure a new RTCPeerConnection
 */
function createPeerConnection() {
  const iceServers = [
    {
      urls: 'turn:10.174.0.9:3478?transport=udp',
      username: 'webrtcuser',
      credential: 'webrtcpass',
    },
  ];

  const pc = new wrtc.RTCPeerConnection({
    iceServers,
    iceTransportPolicy: 'relay',  // FORCE TURN-ONLY for now
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('Server ICE candidate:', event.candidate.candidate);
    } else {
      console.log('Server ICE candidate gathering complete');
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log('Server: ICE state =', pc.iceConnectionState);
    if (
      pc.iceConnectionState === 'failed' ||
      pc.iceConnectionState === 'closed' ||
      pc.iceConnectionState === 'disconnected'
    ) {
      try { pc.close(); } catch {}
      if (currentPc === pc) {
        currentPc = null;
      }
    }
  };

  // For this demo, the BROWSER creates the DataChannel.
  pc.ondatachannel = (event) => {
    const dc = event.channel;
    console.log('Server: DataChannel created by client:', dc.label);

    dc.onopen = () => {
      console.log('Server: DataChannel open');
      dc.send('Hello from Node server via WebRTC!');
    };

    dc.onmessage = (ev) => {
      console.log('Server: received message from client:', ev.data);
      // echo back
      dc.send('echo: ' + ev.data);
    };

    dc.onclose = () => {
      console.log('Server: DataChannel closed');
    };
  };

  return pc;
}

/**
 * Handle an SDP offer from the browser.
 * Creates a PC, applies the offer, creates an answer, waits for ICE,
 * then returns the localDescription (answer).
 */
async function handleOffer(offer) {
  // Close any previous PC for this simple demo
  if (currentPc) {
    try { currentPc.close(); } catch {}
    currentPc = null;
  }

  const pc = createPeerConnection();
  currentPc = pc;
  pendingRemoteCandidates = [];

  console.log('Server: setting remote description (offer)');
  await pc.setRemoteDescription(offer); // offer is { type, sdp } from browser

  // If any remote candidates arrived before the offer (trickle case), add them now
  if (pendingRemoteCandidates.length > 0) {
    console.log(`Server: applying ${pendingRemoteCandidates.length} pending remote candidates`);
    for (const c of pendingRemoteCandidates) {
      try {
        await pc.addIceCandidate(new wrtc.RTCIceCandidate(c));
      } catch (e) {
        console.error('Server: error adding pending candidate:', e);
      }
    }
    pendingRemoteCandidates = [];
  }

  console.log('Server: creating answer');
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  // Wait until ICE gathering is complete so the answer includes all candidates
  await new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      return resolve();
    }
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
      }
    };
  });

  console.log('Server: returning answer');
  return pc.localDescription;
}

/**
 * Optional: handle remote ICE candidates (if you enable trickle ICE in the browser).
 * If you never POST /candidate from the client, this is harmless and unused.
 */
async function handleRemoteCandidate(candidateInit) {
  console.log('Server: received remote ICE candidate payload:', candidateInit);

  if (!candidateInit) {
    console.log('Server: empty candidateInit, ignoring');
    return;
  }

  // If we don't yet have a PC (offer not yet processed), buffer the candidate
  if (!currentPc) {
    console.warn('Server: no currentPc yet, buffering remote candidate');
    pendingRemoteCandidates.push(candidateInit);
    return;
  }

  try {
    const candidate = new wrtc.RTCIceCandidate(candidateInit);
    await currentPc.addIceCandidate(candidate);
    console.log('Server: addIceCandidate resolved');
  } catch (e) {
    console.error('Server: addIceCandidate error:', e);
  }
}

// Very minimal HTTP server:
// - GET /          -> serve demo.html
// - POST /offer    -> accept SDP offer, return SDP answer
// - POST /candidate -> (optional) accept ICE candidates for trickle ICE
const server = http.createServer(async (req, res) => {
  // Serve the demo HTML
  if (req.method === 'GET' && req.url === '/') {
    const filePath = path.join(__dirname, 'demo.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        console.error('Error loading demo.html:', err);
        res.writeHead(500);
        res.end('Error loading demo.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  // Helper to read JSON body
  const readJsonBody = () =>
    new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const json = JSON.parse(body || '{}');
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });

  // Handle SDP offer
  if (req.method === 'POST' && req.url === '/offer') {
    try {
      const offer = await readJsonBody();
      const answer = await handleOffer(offer);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(answer));
    } catch (e) {
      console.error('Error handling /offer:', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message || String(e) }));
    }
    return;
  }

  // Optional: handle remote ICE candidate (trickle ICE)
  if (req.method === 'POST' && req.url === '/candidate') {
    try {
      const candidateInit = await readJsonBody();
      await handleRemoteCandidate(candidateInit);
      res.writeHead(200);
      res.end('ok');
    } catch (e) {
      console.error('Error handling /candidate:', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message || String(e) }));
    }
    return;
  }

  // Fallback 404
  res.writeHead(404);
  res.end('Not found');
});

const PORT = 1032;
const HOST = '0.0.0.0'; // listen on all IPv4 interfaces

server.listen(PORT, HOST, () => {
  console.log(`Demo server running at http://${HOST}:${PORT}/`);
});
