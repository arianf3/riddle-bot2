const crypto = require('crypto');
const net = require('net');

const DEFAULT_UUID = 'd342d11e-d424-4583-b36e-524ab1f0afa4';
const MAX_WS_FRAME = 64 * 1024;
const WS_PING_MS = 25_000;
const WS_IDLE_MS = 70_000;

class WebSocketConnection {
  constructor(socket, req) {
    this.socket = socket;
    this.req = req;
    this.buffer = Buffer.alloc(0);
    this.closed = false;
    this.closing = false;
    this.closeSent = false;
    this.fragmented = false;
    this.fragmentedText = false;
    this.lastActivity = Date.now();
    this.onData = null;
    this.onClose = null;
    this.onDrain = null;

    socket.setNoDelay(true);
    socket.setTimeout(0);
    socket.on('data', (chunk) => this.feed(chunk));
    socket.on('error', () => this.destroy());
    socket.on('close', () => this.destroy());
    socket.on('drain', () => {
      if (this.onDrain) this.onDrain();
    });

    this.pingTimer = setInterval(() => {
      if (this.closed) return;
      if (Date.now() - this.lastActivity > WS_IDLE_MS) {
        this.destroy();
        return;
      }
      this.sendFrame(0x9, Buffer.from('ping'));
    }, WS_PING_MS);
    this.pingTimer.unref();
  }

  feed(chunk) {
    if (this.closed) return;
    this.lastActivity = Date.now();
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;

    while (!this.closed && !this.closing) {
      if (this.buffer.length < 2) return;
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = (first & 0x80) !== 0;
      const rsv = first & 0x70;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;

      if (rsv !== 0) {
        this.fail(1002, 'RSV bits not supported');
        return;
      }
      if (!masked) {
        this.fail(1002, 'Client frames must be masked');
        return;
      }

      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const high = this.buffer.readUInt32BE(2);
        const low = this.buffer.readUInt32BE(6);
        if (high !== 0 || low > MAX_WS_FRAME) {
          this.fail(1009, 'Frame too large');
          return;
        }
        length = low;
        offset = 10;
      }

      if (length > MAX_WS_FRAME) {
        this.fail(1009, 'Frame too large');
        return;
      }
      if (this.buffer.length < offset + 4 + length) return;

      const mask = this.buffer.subarray(offset, offset + 4);
      offset += 4;
      const payload = Buffer.allocUnsafe(length);
      for (let index = 0; index < length; index += 1) {
        payload[index] = this.buffer[offset + index] ^ mask[index & 3];
      }
      this.buffer = this.buffer.subarray(offset + length);
      this.handleFrame(fin, opcode, payload);
    }
  }

  handleFrame(fin, opcode, payload) {
    if (opcode >= 0x8) {
      if (!fin || payload.length > 125) {
        this.fail(1002, 'Invalid control frame');
        return;
      }
      if (opcode === 0x8) {
        if (!this.closeSent) {
          this.sendFrame(0x8, payload.length >= 2 ? payload.subarray(0, 2) : Buffer.alloc(0));
          this.closeSent = true;
        }
        this.destroy();
        return;
      }
      if (opcode === 0x9) {
        this.sendFrame(0xa, payload);
        return;
      }
      if (opcode === 0xa) return;
      this.fail(1002, 'Unsupported control frame');
      return;
    }

    if (opcode === 0x0) {
      if (!this.fragmented) {
        this.fail(1002, 'Unexpected continuation frame');
        return;
      }
      if (!this.fragmentedText && this.onData && payload.length) this.onData(payload);
      if (fin) {
        this.fragmented = false;
        this.fragmentedText = false;
      }
      return;
    }

    if (opcode === 0x1) {
      if (this.fragmented) {
        this.fail(1002, 'Nested fragmented message');
        return;
      }
      if (fin) {
        this.fail(1003, 'Text frames not supported');
        return;
      }
      this.fragmented = true;
      this.fragmentedText = true;
      return;
    }

    if (opcode === 0x2) {
      if (this.fragmented) {
        this.fail(1002, 'Nested fragmented message');
        return;
      }
      if (payload.length && this.onData) this.onData(payload);
      if (!fin) {
        this.fragmented = true;
        this.fragmentedText = false;
      }
      return;
    }

    this.fail(1002, 'Unsupported opcode');
  }

  sendFrame(opcode, payload) {
    if (this.closed || this.closing || this.socket.destroyed) return false;
    const length = payload.length;
    let header;

    if (length < 126) {
      header = Buffer.allocUnsafe(2);
      header[1] = length;
    } else if (length < 65536) {
      header = Buffer.allocUnsafe(4);
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.allocUnsafe(10);
      header[1] = 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(length, 6);
    }

    header[0] = 0x80 | opcode;
    try {
      return this.socket.write(Buffer.concat([header, payload]));
    } catch {
      this.destroy();
      return false;
    }
  }

  sendBinary(payload) {
    return this.sendFrame(0x2, payload);
  }

  sendClose(code, reason) {
    if (this.closed || this.closeSent) return;
    const text = Buffer.from(
      String(reason || '').replace(/[^\x20-\x7e]/g, '?').slice(0, 120),
      'utf8'
    );
    const payload = Buffer.allocUnsafe(2 + text.length);
    payload.writeUInt16BE(code, 0);
    text.copy(payload, 2);
    this.sendFrame(0x8, payload);
    this.closeSent = true;
  }

  endSoon() {
    if (this.closed || this.closing) return;
    this.closing = true;
    this.socket.end();
    setTimeout(() => this.destroy(), 1000).unref();
  }

  fail(code, reason) {
    if (this.closed || this.closing) return;
    this.sendClose(code, reason);
    this.endSoon();
  }

  pause() {
    if (!this.closed) this.socket.pause();
  }

  resume() {
    if (!this.closed) this.socket.resume();
  }

  destroy() {
    if (this.closed) return;
    this.closed = true;
    this.closing = true;
    clearInterval(this.pingTimer);
    this.socket.destroy();
    if (this.onClose) this.onClose();
  }
}

class VlessSession {
  constructor(ws, req, head, targetUuidBytes) {
    this.id = crypto.randomBytes(4).toString('hex');
    this.ws = ws;
    this.req = req;
    this.targetUuidBytes = targetUuidBytes;
    this.targetSocket = null;
    this.target = '';
    this.stage = 'header';
    this.buffer = Buffer.alloc(0);
    this.pending = null;
    this.closed = false;

    ws.onData = (chunk) => this.feed(chunk);
    ws.onClose = () => this.cleanup();
    ws.onDrain = () => {
      if (this.targetSocket && !this.targetSocket.destroyed) this.targetSocket.resume();
    };

    this.handshakeTimer = setTimeout(() => {
      if (this.stage === 'header') this.fail('Handshake timeout');
    }, 15_000);
    this.handshakeTimer.unref();

    if (head && head.length) ws.feed(head);
  }

  feed(chunk) {
    if (this.closed) return;
    if (this.stage === 'open') {
      this.writeTarget(chunk);
      return;
    }
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    if (this.stage === 'header') this.parseHeader();
  }

  parseHeader() {
    const buffer = this.buffer;
    if (buffer.length < 18) return;

    let offset = 0;
    if (buffer[offset++] !== 0) {
      this.fail('Unsupported VLESS version');
      return;
    }

    const uuid = buffer.subarray(offset, offset + 16);
    offset += 16;
    if (!crypto.timingSafeEqual(uuid, this.targetUuidBytes)) {
      this.fail('Authentication failed');
      return;
    }

    const addonsLength = buffer[offset++];
    if (buffer.length < offset + addonsLength + 1 + 2 + 1) return;
    offset += addonsLength;

    const command = buffer[offset++];
    const port = buffer.readUInt16BE(offset);
    offset += 2;
    const addressType = buffer[offset++];

    let host = '';
    if (addressType === 0x01) { // IPv4
      if (buffer.length < offset + 4) return;
      host = Array.from(buffer.subarray(offset, offset + 4)).join('.');
      offset += 4;
    } else if (addressType === 0x02) { // Domain
      if (buffer.length < offset + 1) return;
      const length = buffer[offset++];
      if (buffer.length < offset + length) return;
      host = buffer.subarray(offset, offset + length).toString('utf8');
      offset += length;
    } else if (addressType === 0x03) { // IPv6
      if (buffer.length < offset + 16) return;
      const parts = [];
      for (let i = 0; i < 16; i += 2) {
        parts.push(buffer.readUInt16BE(offset + i).toString(16));
      }
      host = parts.join(':');
      offset += 16;
    } else {
      this.fail('Unsupported address type');
      return;
    }

    if (command !== 0x01) {
      this.fail('Only TCP supported');
      return;
    }

    clearTimeout(this.handshakeTimer);
    this.buffer = buffer.subarray(offset);
    this.pending = this.buffer.length ? this.buffer : null;
    this.buffer = Buffer.alloc(0);
    this.target = `${host}:${port}`;
    this.stage = 'connecting';
    this.connectTarget(host, port);
  }

  connectTarget(host, port) {
    let target;
    try {
      target = net.connect({ host, port });
    } catch (e) {
      this.fail(`Target error: ${e.message}`);
      return;
    }

    this.targetSocket = target;
    target.setNoDelay(true);

    const connectTimer = setTimeout(() => {
      target.destroy();
      if (this.stage === 'connecting') this.fail('Target timeout');
    }, 20_000);

    target.on('error', (e) => {
      clearTimeout(connectTimer);
      this.destroy();
    });

    target.once('close', () => {
      clearTimeout(connectTimer);
      this.destroy();
    });

    target.once('connect', () => {
      clearTimeout(connectTimer);
      if (this.closed || this.ws.closed) {
        target.destroy();
        return;
      }

      const early = this.pending;
      this.pending = null;
      this.stage = 'open';

      // Send VLESS response header: [0, 0]
      this.ws.sendBinary(Buffer.from([0, 0]));

      target.on('data', (chunk) => {
        if (!this.ws.sendBinary(chunk)) target.pause();
      });
      target.on('drain', () => this.ws.resume());
      target.on('end', () => {
        this.ws.sendClose(1000, 'Target closed');
        this.destroy();
      });

      if (early && early.length) this.writeTarget(early);
    });
  }

  writeTarget(chunk) {
    if (this.targetSocket && !this.targetSocket.destroyed) {
      if (!this.targetSocket.write(chunk)) {
        this.ws.pause();
      }
    }
  }

  fail(reason) {
    if (this.closed) return;
    this.ws.fail(1008, reason);
    this.destroy();
  }

  cleanup() {
    if (this.closed) return;
    this.closed = true;
    if (this.targetSocket && !this.targetSocket.destroyed) {
      this.targetSocket.destroy();
    }
  }

  destroy() {
    this.cleanup();
    this.ws.destroy();
  }
}

function setupVless(server, customUuid) {
  const uuidStr = (customUuid || process.env.VLESS_UUID || DEFAULT_UUID).trim().toLowerCase();
  const uuidBytes = Buffer.from(uuidStr.replace(/-/g, ''), 'hex');

  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});

    const key = req.headers['sec-websocket-key'];
    const upgrade = String(req.headers.upgrade || '').toLowerCase();
    const version = String(req.headers['sec-websocket-version'] || '');
    const keyBytes = key ? Buffer.from(String(key), 'base64') : Buffer.alloc(0);

    if (req.method !== 'GET' || upgrade !== 'websocket' || version !== '13' || keyBytes.length !== 16) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nBad WebSocket');
      socket.destroy();
      return;
    }

    const accept = crypto
      .createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    const ws = new WebSocketConnection(socket, req);
    new VlessSession(ws, req, head, uuidBytes);
  });

  console.log(`[VLESS] WebSocket Bridge initialized on path (any) with UUID: ${uuidStr}`);
}

module.exports = { setupVless, WebSocketConnection, VlessSession };
