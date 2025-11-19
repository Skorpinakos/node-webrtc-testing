# Installing & launching experimental Chrome (Canary) for WebRTC + L4S

This document records how to:

1. Install a Chrome **Canary / dev** build on Windows.
2. Launch it with WebRTC **field trials** that enable:
   - RFC 8888 congestion control feedback (`WebRTC-RFC8888CongestionControlFeedback`)
   - SCReAM v2 congestion controller (`WebRTC-Bwe-ScreamV2`)

The flags mirror those used in L4S / SCReAM WebRTC experiments.

---

## 1. Install Chrome Canary (Windows)

1. Go to the official Canary page in your regular browser:

   - https://www.google.com/chrome/canary/

2. Download the Windows 64‑bit installer and run it.
3. After installation, you’ll have a new browser called **Google Chrome Canary**.
   - Typical path:

     ```text
     C:\Users\<YourUser>\AppData\Local\Google\Chrome SxS\Application\chrome.exe
     ```

Chrome Stable and Canary can coexist; they use separate profiles.

---

## 2. Launch Canary with WebRTC L4S field trials (Windows)

We want Canary to start with:

```text
--force-fieldtrials=WebRTC-RFC8888CongestionControlFeedback/Enabled,offer:true,force_send:true/WebRTC-Bwe-ScreamV2/Enabled/
```

### 2.1. Create a shortcut with flags

1. Locate `chrome.exe` for Canary, e.g.:

   ```text
   C:\Users\<YourUser>\AppData\Local\Google\Chrome SxS\Application\chrome.exe
   ```

2. Right‑click → **Send to → Desktop (create shortcut)**.
3. On the desktop, right‑click the new shortcut → **Properties**.
4. In **Target**, append the flags **after** the closing quote. Example:

   ```text
   "C:\Users\<YourUser>\AppData\Local\Google\Chrome SxS\Application\chrome.exe" --force-fieldtrials=WebRTC-RFC8888CongestionControlFeedback/Enabled,offer:true,force_send:true/WebRTC-Bwe-ScreamV2/Enabled/
   ```

Optional extra logging for SCReAM v2:

```text
"...\chrome.exe" --vmodule=scream_v2=1 --force-fieldtrials=WebRTC-RFC8888CongestionControlFeedback/Enabled,offer:true,force_send:true/WebRTC-Bwe-ScreamV2/Enabled/
```

5. Click **OK**, then launch Canary via this shortcut whenever you run L4S/WebRTC tests.

---

## 3. Verifying that field trials are active

1. In Canary, open `chrome://version` and look for the **Command Line** section.
   - Confirm the `--force-fieldtrials=...` string is present.
2. For WebRTC‑specific debugging:
   - Open `chrome://webrtc-internals` in a tab before starting your test.
   - Start your WebRTC session and inspect the stats/logs there.

---

## 4. Linux notes (future client machine)

On Linux (e.g. Ubuntu) you can use Chrome dev/unstable builds in a similar way:

1. Download the `.deb` for Chrome dev/unstable from Google’s site.
2. Install it:

   ```bash
   sudo dpkg -i google-chrome-unstable_current_amd64.deb
   sudo apt -f install
   ```

3. Launch with the same field trials:

   ```bash
   google-chrome-unstable      --force-fieldtrials=WebRTC-RFC8888CongestionControlFeedback/Enabled,offer:true,force_send:true/WebRTC-Bwe-ScreamV2/Enabled/
   ```

Replace `google-chrome-unstable` with the actual binary name on your system (e.g. `google-chrome-canary` or `google-chrome`), depending on how you installed it.

---

## 5. Safety notes

- Canary/dev builds are **unstable** and may crash or change behavior frequently.
- Use a dedicated profile or keep Canary for experiments only, not for everyday browsing.
