import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const LABEL = 'com.zakkolab.codex-with-chatgpt';
export const LOG_LIMIT = 2 * 1024 * 1024;
export const RUNTIME_FILES = ['service-common.mjs', 'macos-supervisor.mjs'];

export function within(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

export function validateConfig(c) {
  if (!c || c.version !== 1) throw new Error('SERVICE_CONFIG_VERSION');
  for (const key of ['home', 'workspace', 'repository', 'volume', 'runtimeDir', 'node', 'stateDir']) {
    if (typeof c[key] !== 'string' || !path.isAbsolute(c[key]) || c[key].includes('\0') || path.normalize(c[key]) !== c[key]) {
      throw new Error('SERVICE_CONFIG_PATH');
    }
  }
  if (c.volume !== '/Volumes/ZAKKO_DEV' || c.workspace !== path.join(c.volume, 'repos')) throw new Error('SERVICE_WORKSPACE_SCOPE');
  if (!within(c.workspace, c.repository) || c.repository === c.workspace) throw new Error('SERVICE_REPOSITORY_SCOPE');
  if (c.runtimeDir !== path.join(c.home, 'Homelab', 'codex-with-chatgpt')) throw new Error('SERVICE_RUNTIME_SCOPE');
  if (within('/Volumes', c.node)) throw new Error('SERVICE_NODE_ON_EXTERNAL_VOLUME');
  if (!/^[a-f0-9-]{16,64}$/i.test(c.volumeUUID || '')) throw new Error('SERVICE_VOLUME_UUID');
  if (!/^[a-z_][a-z0-9_-]*[$]?$/i.test(c.user || '')) throw new Error('SERVICE_USER');
  if (c.cloudflaredPath !== undefined && (
    typeof c.cloudflaredPath !== 'string' || !path.isAbsolute(c.cloudflaredPath) ||
    c.cloudflaredPath.includes('\0') || path.normalize(c.cloudflaredPath) !== c.cloudflaredPath ||
    within('/Volumes', c.cloudflaredPath)
  )) throw new Error('SERVICE_CLOUDFLARED_PATH');
  if (c.tunnelProtocol !== undefined && !['auto', 'quic', 'http2'].includes(c.tunnelProtocol)) throw new Error('SERVICE_TUNNEL_PROTOCOL');
  return c;
}

export function readConfig(file) {
  if (!fs.lstatSync(file).isFile() || fs.statSync(file).size > 32768) throw new Error('SERVICE_CONFIG_FILE');
  return validateConfig(JSON.parse(fs.readFileSync(file, 'utf8')));
}

function plistString(xml, key) {
  const match = xml.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  if (!match) throw new Error('SERVICE_DISK_INFO');
  return match[1]
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export function volumeInfo(volume, execute = execFileSync) {
  const xml = execute('/usr/sbin/diskutil', ['info', '-plist', volume], {
    encoding: 'utf8', timeout: 5000, maxBuffer: 512 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  });
  return { uuid: plistString(xml, 'VolumeUUID'), mount: plistString(xml, 'MountPoint') };
}

export function volumeReady(c, info = volumeInfo, realpath = fs.realpathSync.native) {
  try {
    const disk = info(c.volume);
    return disk.uuid.toLowerCase() === c.volumeUUID.toLowerCase() && disk.mount === c.volume
      && realpath(c.workspace) === c.workspace && realpath(c.repository) === c.repository;
  } catch {
    return false;
  }
}

export function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  }[c]));
}

export function renderPlist(c, system = false) {
  validateConfig(c);
  const s = value => `<string>${xmlEscape(value)}</string>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key>${s(LABEL)}
<key>ProgramArguments</key><array>${s(c.node)}${s(path.join(c.runtimeDir, 'macos-supervisor.mjs'))}${s(path.join(c.runtimeDir, 'service.json'))}</array>
<key>WorkingDirectory</key>${s(c.home)}
${system ? `<key>UserName</key>${s(c.user)}
` : ''}<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>60</integer>
<key>ExitTimeOut</key><integer>30</integer>
<key>ProcessType</key><string>Background</string>
<key>Umask</key><integer>63</integer>
</dict></plist>
`;
}

export function workerEnvironment(c) {
  return {
    HOME: c.home,
    USER: c.user,
    LOGNAME: c.user,
    PATH: `${path.dirname(c.node)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
    LANG: 'ja_JP.UTF-8',
    LC_ALL: 'ja_JP.UTF-8',
    TZ: 'Asia/Tokyo',
    C2C_STATE_DIR: c.stateDir,
    ...(c.cloudflaredPath ? { C2C_CLOUDFLARED_PATH: c.cloudflaredPath } : {}),
    ...(c.tunnelProtocol ? { C2C_TUNNEL_PROTOCOL: c.tunnelProtocol } : {}),
  };
}

export function writePrivate(file, text) {
  const temp = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    fs.writeFileSync(temp, text, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    try { fs.unlinkSync(temp); } catch { /* rename後は存在しない。 */ }
  }
}

export function acquireLock(
  dir,
  alive = pid => {
    try { process.kill(pid, 0); return true; }
    catch (e) { return e.code !== 'ESRCH'; }
  }
) {
  const owner = path.join(dir, 'owner.json');
  try {
    fs.mkdirSync(dir, { mode: 0o700 });
  } catch (e) {
    if (e.code !== 'EEXIST' || !fs.lstatSync(dir).isDirectory()) throw new Error('SERVICE_LOCK');
    let old;
    try { old = JSON.parse(fs.readFileSync(owner, 'utf8')); }
    catch { throw new Error('SERVICE_LOCK_UNCERTAIN'); }
    if (!Number.isSafeInteger(old.pid) || old.pid <= 0 || alive(old.pid)) throw new Error('SERVICE_ALREADY_RUNNING');
    if (fs.readdirSync(dir).some(name => name !== 'owner.json')) throw new Error('SERVICE_LOCK_UNCERTAIN');
    fs.unlinkSync(owner);
    fs.rmdirSync(dir);
    fs.mkdirSync(dir, { mode: 0o700 });
  }
  writePrivate(owner, JSON.stringify({ pid: process.pid }));
  return () => {
    try {
      if (JSON.parse(fs.readFileSync(owner, 'utf8')).pid === process.pid) {
        fs.unlinkSync(owner);
        fs.rmdirSync(dir);
      }
    } catch {
      /* 別の所有者のロックは変更しない。 */
    }
  };
}

export function appendLog(dir, event, detail = '') {
  if (!/^[A-Z_]+$/.test(event) || !/^[a-zA-Z0-9 _:-]*$/.test(detail)) throw new Error('SERVICE_LOG_FORMAT');
  const log = path.join(dir, 'service.log');
  for (const file of [log, `${log}.1`, `${log}.2`]) {
    if (fs.existsSync(file) && !fs.lstatSync(file).isFile()) throw new Error('SERVICE_LOG_PATH');
  }
  if (fs.existsSync(log) && fs.statSync(log).size >= LOG_LIMIT) {
    if (fs.existsSync(`${log}.2`)) fs.unlinkSync(`${log}.2`);
    if (fs.existsSync(`${log}.1`)) fs.renameSync(`${log}.1`, `${log}.2`);
    fs.renameSync(log, `${log}.1`);
  }
  const fd = fs.openSync(log, 'a', 0o600);
  try {
    fs.fchmodSync(fd, 0o600);
    fs.writeSync(fd, `${new Date().toISOString()} ${event}${detail ? ` ${detail}` : ''}\n`);
  } finally {
    fs.closeSync(fd);
  }
}

export function retryDelay(failures) {
  return Math.min(300000, 5000 * 2 ** Math.min(Math.max(0, failures), 6));
}
