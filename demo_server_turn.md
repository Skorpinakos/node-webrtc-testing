# TURN server setup for WebRTC / L4S demo (coturn on Ubuntu)

This document records how to set up a **coturn** TURN server on Ubuntu for the WebRTC + L4S experiments.

Environment assumptions:

- Ubuntu VM with:
  - Private IP: `10.174.0.9` (interface `ens3`)
  - Public IP (NAT / university router): `150.140.195.216`
- TURN server: **coturn**
- Ports:
  - TURN UDP: `3478`
  - Relay UDP range: `50000–50050`
- Authentication:
  - realm: `l4s-tests`
  - user: `webrtcuser`
  - password: `webrtcpass`
- WebRTC peers:
  - Browser (public side) uses `turn:150.140.195.216:3478`
  - Node server (on the VM) uses `turn:10.174.0.9:3478`
- TURN is behind NAT, so we use `external-ip=PUBLIC/PRIVATE` in coturn.

---

## 1. Install coturn

```bash
sudo apt update
sudo apt install coturn
```

Enable the service at boot:

```bash
sudo systemctl enable coturn
```

By default coturn reads `/etc/turnserver.conf`.

---

## 2. Configure coturn for a NATed server

Edit the main config:

```bash
sudo nano /etc/turnserver.conf
```

Use this as a minimal working template (adjust IPs/credentials if they change):

```conf
# =====================
# Networking
# =====================

# Private address of the VM (check with `ip addr show`)
listening-ip=10.174.0.9
relay-ip=10.174.0.9

# Map public IP to internal IP (critical behind NAT):
# Format: external-ip=PUBLIC/PRIVATE
external-ip=150.140.195.216/10.174.0.9

# TURN ports
listening-port=3478           # UDP TURN
no-tls                        # no TLS for this lab setup
no-dtls                       # no DTLS for this lab setup
no-tcp-relay                  # UDP-only relaying

# Allocate relay ports from a small range (easier to firewall + debug)
min-port=50000
max-port=50050

# =====================
# Authentication / realm
# =====================

realm=l4s-tests

# Long-term credentials (static user)
lt-cred-mech
user=webrtcuser:webrtcpass

fingerprint

# =====================
# Logging
# =====================

# Use systemd journal (default). Optionally enable file logging:
#log-file=/var/log/turnserver/turnserver.log
#simple-log
#verbose

# If you enable log-file, first:
#  sudo mkdir -p /var/log/turnserver
#  sudo chown turnserver:turnserver /var/log/turnserver
```

Save and exit.

---

## 3. Restart coturn and verify

```bash
sudo systemctl restart coturn
sudo systemctl status coturn
```

You should see `active (running)`.

To view logs (recommended while debugging):

```bash
# Live logs from systemd journal
sudo journalctl -u coturn -f
```

If you enabled `log-file`, you can also:

```bash
sudo tail -f /var/log/turnserver/turnserver.log
```

You should see successful `ALLOCATE` messages and `Local relay addr: 10.174.0.9:5000X`.

---

## 4. Example WebRTC ICE configuration

### Browser (public side, e.g. Windows)

```js
const pc = new RTCPeerConnection({
  iceServers: [
    {
      urls: 'turn:150.140.195.216:3478?transport=udp',
      username: 'webrtcuser',
      credential: 'webrtcpass',
    },
  ],
  iceTransportPolicy: 'relay', // TURN-only for testing
});
```

### Node (server side, on the VM)

```js
const wrtc = require('./');

const pc = new wrtc.RTCPeerConnection({
  iceServers: [
    {
      urls: 'turn:10.174.0.9:3478?transport=udp', // direct to internal IP
      username: 'webrtcuser',
      credential: 'webrtcpass',
    },
  ],
  iceTransportPolicy: 'relay',
});
```

---

## 5. Verifying successful TURN relay

A successful TURN-only connection should show:

- In the browser console:
  - ICE candidates with `typ relay` and IP `150.140.195.216`.
  - ICE state transitions: `new → checking → connected`.
- In the Node server logs:
  - Server ICE candidates with `typ relay`.
  - ICE state: `new → checking → connected`.
  - DataChannel `onopen` firing.

In the coturn logs you should see sessions with `username=<webrtcuser>` and no recurring permission or connectivity errors.

---

## 6. Copy current coturn config into this project

From the Ubuntu VM, to copy the active config into your project folder:

```bash
cd ~/node_webrtc_l4s_testing/node-webrtc-testing
sudo cp /etc/turnserver.conf ./turnserver.conf.demo-reference
sudo chown "$USER":"$USER" ./turnserver.conf.demo-reference
```

This preserves a snapshot of the working configuration alongside your WebRTC demo code.
