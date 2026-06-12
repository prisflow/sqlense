const { io } = require("socket.io-client");

class TelemetryClient {
  // 初始化 Socket.IO 客户端实例
  constructor(serverUrl, studentId, studentName) {
    this.serverUrl = serverUrl;
    this.studentId = studentId;
    this.studentName = studentName;
    this.socket = null;
    this.connected = false;
    this.listeners = new Map();
    this.reconnectTimer = null;
  }

  // 建立 WebSocket 连接并注册事件
  connect() {
    if (this.socket?.connected) return;

    this.socket = io(this.serverUrl, {
      query: {
        role: "student",
        studentId: this.studentId,
        studentName: this.studentName,
      },
      // 优先走ws，失败走长轮询
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionAttempts: Infinity,
    });

    // 连接成功后更新状态
    this.socket.on("connect", () => {
      this.connected = true;
    });

    // 断开连接后更新状态
    this.socket.on("disconnect", () => {
      this.connected = false;
    });

    // 触发接管开始事件回调
    this.socket.on("takeover:start", () => {
      const cb = this.listeners.get("takeover:start");
      if (cb) cb();
    });

    // 触发接管结束事件回调
    this.socket.on("takeover:stop", () => {
      const cb = this.listeners.get("takeover:stop");
      if (cb) cb();
    });

  }

  // 发送遥测数据到服务端
  send(data) {
    if (!this.socket?.connected) return;
    this.socket.emit("student:telemetry", data);
  }

  // 注册自定义事件监听器
  on(event, callback) {
    this.listeners.set(event, callback);
  }

  // 返回当前连接状态
  isConnected() {
    return this.connected;
  }

  // 断开连接并清理定时器
  dispose() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

module.exports = { TelemetryClient };
