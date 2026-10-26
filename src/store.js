// Persists profiles and app settings as JSON files under the app's data folder.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class Store {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.profilesDir = path.join(baseDir, 'profiles');
    this.profilesFile = path.join(baseDir, 'profiles.json');
    this.settingsFile = path.join(baseDir, 'settings.json');
    fs.mkdirSync(this.profilesDir, { recursive: true });
  }

  readJson(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return fallback;
    }
  }

  writeJson(file, data) {
    // Write to a temp file first so a crash never leaves a half-written file.
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  listProfiles() {
    return this.readJson(this.profilesFile, []);
  }

  getProfile(id) {
    return this.listProfiles().find((p) => p.id === id);
  }

  dataDirFor(id) {
    return path.join(this.profilesDir, id);
  }

  saveProfile(input) {
    const profiles = this.listProfiles();
    const now = new Date().toISOString();
    const existing = input.id && profiles.find((p) => p.id === input.id);
    let profile;
    if (existing) {
      profile = { ...existing, ...sanitize(input), id: existing.id, updatedAt: now };
      profiles[profiles.indexOf(existing)] = profile;
    } else {
      profile = { ...sanitize(input), id: crypto.randomUUID(), createdAt: now, updatedAt: now, lastOpenedAt: null };
      profiles.push(profile);
      fs.mkdirSync(this.dataDirFor(profile.id), { recursive: true });
    }
    this.writeJson(this.profilesFile, profiles);
    return profile;
  }

  touchProfile(id) {
    const profiles = this.listProfiles();
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    p.lastOpenedAt = new Date().toISOString();
    this.writeJson(this.profilesFile, profiles);
  }

  deleteProfile(id) {
    const profiles = this.listProfiles().filter((p) => p.id !== id);
    this.writeJson(this.profilesFile, profiles);
    fs.rmSync(this.dataDirFor(id), { recursive: true, force: true });
  }

  clearProfileData(id) {
    const dir = this.dataDirFor(id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }

  getSettings() {
    return this.readJson(this.settingsFile, { browserPath: '' });
  }

  saveSettings(settings) {
    const merged = { ...this.getSettings(), ...settings };
    this.writeJson(this.settingsFile, merged);
    return merged;
  }
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function sanitize(input) {
  const proxy = input.proxy || {};
  return {
    name: str(input.name) || 'Untitled profile',
    owner: str(input.owner),
    color: str(input.color) || '#e60023',
    notes: str(input.notes),
    startUrl: str(input.startUrl),
    language: str(input.language),
    timezone: str(input.timezone),
    userAgent: str(input.userAgent),
    windowWidth: Number(input.windowWidth) || 0,
    windowHeight: Number(input.windowHeight) || 0,
    proxy: {
      type: ['http', 'https', 'socks4', 'socks5'].includes(proxy.type) ? proxy.type : 'none',
      host: str(proxy.host),
      port: Number(proxy.port) || 0,
    },
  };
}

module.exports = { Store };
