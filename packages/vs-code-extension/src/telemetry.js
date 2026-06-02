const { io } = require("socket.io-client");

class TelemetryClient {
  constructor(serverUrl, studentId, studentName) {
    this.serverUrl = serverUrl;
    this.studentId = studentId;
    this.studentName = studentName;
    this.socket = null;
    this.connected = false;
    this.listeners = new Map();
    this.reconnectTimer = null;
  }

  connect() {
    if (this.socket?.connected) return;

    this.socket = io(this.serverUrl, {
      query: {
        role: "student",
        studentId: this.studentId,
        studentName: this.studentName,
      },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionAttempts: Infinity,
    });

    this.socket.on("connect", () => {
      this.connected = true;
    });

    this.socket.on("disconnect", () => {
      this.connected = false;
    });

    this.socket.on("takeover:start", () => {
      const cb = this.listeners.get("takeover:start");
      if (cb) cb();
    });

    this.socket.on("takeover:stop", () => {
      const cb = this.listeners.get("takeover:stop");
      if (cb) cb();
    });

  }

  send(data) {
    if (!this.socket?.connected) return;
    this.socket.emit("student:telemetry", data);
  }

  on(event, callback) {
    this.listeners.set(event, callback);
  }

  isConnected() {
    return this.connected;
  }

  dispose() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.disconnect();
      this.socket.close();
    }
  }
}

module.exports = { TelemetryClient };
