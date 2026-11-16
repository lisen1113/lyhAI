#!/usr/bin/env node
/**
 * 远程执行辅助脚本（生产部署用）
 * 说明：本文件不含任何凭据，主机/账号/密码全部从环境变量读取。
 * 用法：
 *   SSH_HOST=x SSH_USER=x SSH_PASS=x node remote.cjs '<命令>'
 */
const { Client } = require("ssh2");

const cmd = process.argv[2] || "";
if (!cmd) {
  console.error("usage: node remote.cjs '<command>'");
  process.exit(2);
}
if (!process.env.SSH_HOST || !process.env.SSH_USER || !process.env.SSH_PASS) {
  console.error("missing env: SSH_HOST / SSH_USER / SSH_PASS");
  process.exit(2);
}

const conn = new Client();
let settled = false;
const finish = (code, msg) => {
  if (settled) return;
  settled = true;
  if (msg) console.error(msg);
  try { conn.end(); } catch (_) {}
  process.exit(code);
};

conn
  .on("ready", () => {
    conn.exec(cmd, (err, stream) => {
      if (err) return finish(1, "EXEC_ERR " + err.message);
      stream
        .on("data", (d) => process.stdout.write(d))
        .stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", (code) => finish(code || 0));
    });
  })
  .on("error", (e) => finish(3, "SSH_ERR " + e.message))
  .connect({
    host: process.env.SSH_HOST,
    port: Number(process.env.SSH_PORT || 22),
    username: process.env.SSH_USER,
    password: process.env.SSH_PASS,
    readyTimeout: 20000,
    keepaliveInterval: 5000,
  });

setTimeout(() => finish(4, "TIMEOUT"), 180000);
