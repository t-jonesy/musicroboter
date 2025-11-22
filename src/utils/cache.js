import { promises as fs, createReadStream, createWriteStream } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class AudioCache {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.join(__dirname, '../../.cache/audio');
    this.maxSizeGB = options.maxSizeGB || 10;
    this.maxSizeBytes = this.maxSizeGB * 1024 * 1024 * 1024;
    this.metadataFile = path.join(this.cacheDir, 'metadata.json');
    this.metadata = new Map(); // url -> { filename, size, lastAccessed, hits }
    this.pendingDownloads = new Map(); // url -> Promise
    this.initialized = false;
  }

  /**
   * Initialize the cache directory and load metadata
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.cacheDir, { recursive: true });

      // Load existing metadata
      try {
        const data = await fs.readFile(this.metadataFile, 'utf-8');
        const metadata = JSON.parse(data);
        this.metadata = new Map(Object.entries(metadata));
        console.log(`[Cache] Loaded metadata for ${this.metadata.size} cached files`);
      } catch (error) {
        // Metadata file doesn't exist yet, that's fine
        console.log('[Cache] Starting with empty cache');
      }

      this.initialized = true;
    } catch (error) {
      console.error('[Cache] Failed to initialize:', error);
    }
  }

  /**
   * Get a hash for the URL to use as filename
   */
  getFilenameForUrl(url) {
    const hash = crypto.createHash('sha256').update(url).digest('hex');
    return `${hash}.audio`;
  }

  /**
   * Get the full path for a cached file
   */
  getCachePath(filename) {
    return path.join(this.cacheDir, filename);
  }

  /**
   * Save metadata to disk
   */
  async saveMetadata() {
    try {
      const obj = Object.fromEntries(this.metadata);
      await fs.writeFile(this.metadataFile, JSON.stringify(obj, null, 2));
    } catch (error) {
      console.error('[Cache] Failed to save metadata:', error);
    }
  }

  /**
   * Get current cache size in bytes
   */
  getCurrentSize() {
    let total = 0;
    for (const entry of this.metadata.values()) {
      total += entry.size || 0;
    }
    return total;
  }

  /**
   * Evict least recently used files until we're under the size limit
   */
  async evictOldFiles() {
    const currentSize = this.getCurrentSize();

    if (currentSize <= this.maxSizeBytes) {
      return;
    }

    console.log(`[Cache] Cache size (${(currentSize / 1024 / 1024 / 1024).toFixed(2)} GB) exceeds limit (${this.maxSizeGB} GB), evicting old files...`);

    // Sort by last accessed (oldest first)
    const entries = Array.from(this.metadata.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    let freedSpace = 0;
    const targetSize = this.maxSizeBytes * 0.8; // Evict down to 80% of max

    for (const [url, entry] of entries) {
      if (currentSize - freedSpace <= targetSize) {
        break;
      }

      try {
        const filepath = this.getCachePath(entry.filename);
        await fs.unlink(filepath);
        freedSpace += entry.size;
        this.metadata.delete(url);
        console.log(`[Cache] Evicted ${entry.filename} (${(entry.size / 1024 / 1024).toFixed(2)} MB)`);
      } catch (error) {
        console.error(`[Cache] Failed to evict ${entry.filename}:`, error);
      }
    }

    await this.saveMetadata();
    console.log(`[Cache] Freed ${(freedSpace / 1024 / 1024).toFixed(2)} MB`);
  }

  /**
   * Check if a URL is in the cache
   */
  has(url) {
    return this.metadata.has(url);
  }

  /**
   * Get a readable stream for a cached file
   */
  async get(url) {
    if (!this.initialized) {
      await this.initialize();
    }

    const entry = this.metadata.get(url);
    if (!entry) {
      return null;
    }

    const filepath = this.getCachePath(entry.filename);

    try {
      // Check if file still exists
      await fs.access(filepath);

      // Update access time and hit count
      entry.lastAccessed = Date.now();
      entry.hits = (entry.hits || 0) + 1;
      await this.saveMetadata();

      console.log(`[Cache] Cache hit for ${url.substring(0, 50)}... (${entry.hits} hits)`);

      // Return a readable stream
      return createReadStream(filepath);
    } catch (error) {
      // File doesn't exist, remove from metadata
      console.log(`[Cache] Cache miss - file not found for ${url.substring(0, 50)}...`);
      this.metadata.delete(url);
      await this.saveMetadata();
      return null;
    }
  }

  /**
   * Download and cache a file from a URL
   */
  async download(url) {
    if (!this.initialized) {
      await this.initialize();
    }

    // If already downloading, return the existing promise
    if (this.pendingDownloads.has(url)) {
      console.log(`[Cache] Waiting for existing download of ${url.substring(0, 50)}...`);
      return this.pendingDownloads.get(url);
    }

    // If already cached, return the stream
    const cached = await this.get(url);
    if (cached) {
      return cached;
    }

    // Start new download
    const downloadPromise = this._performDownload(url);
    this.pendingDownloads.set(url, downloadPromise);

    try {
      const result = await downloadPromise;
      return result;
    } finally {
      this.pendingDownloads.delete(url);
    }
  }

  /**
   * Actually perform the download
   */
  async _performDownload(url) {
    const filename = this.getFilenameForUrl(url);
    const filepath = this.getCachePath(filename);
    const tempPath = `${filepath}.tmp`;

    console.log(`[Cache] Downloading ${url.substring(0, 50)}...`);

    return new Promise((resolve, reject) => {
      const ytdlProcess = spawn('yt-dlp', [
        '-f', 'bestaudio/best',
        '-o', '-',
        '--quiet',
        '--no-warnings',
        '--extract-audio',
        url
      ]);

      let errorOutput = '';

      ytdlProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ytdlProcess.on('error', (error) => {
        console.error(`[Cache] Download process error for ${url.substring(0, 50)}:`, error);
        reject(error);
      });

      // Write stdout to temp file
      const writeStream = createWriteStream(tempPath);
      let bytesWritten = 0;

      ytdlProcess.stdout.on('data', (chunk) => {
        bytesWritten += chunk.length;
        writeStream.write(chunk);
      });

      ytdlProcess.on('close', async (code) => {
        writeStream.end();

        if (code !== 0) {
          console.error(`[Cache] Download failed for ${url.substring(0, 50)}:`, errorOutput);
          // Clean up temp file
          try {
            await fs.unlink(tempPath);
          } catch (e) {}
          reject(new Error(`yt-dlp exited with code ${code}`));
          return;
        }

        try {
          // Wait for write stream to finish
          await new Promise((res, rej) => {
            writeStream.on('finish', res);
            writeStream.on('error', rej);
          });

          // Move temp file to final location
          await fs.rename(tempPath, filepath);

          // Get file size
          const stats = await fs.stat(filepath);

          // Update metadata
          this.metadata.set(url, {
            filename,
            size: stats.size,
            lastAccessed: Date.now(),
            hits: 0
          });

          await this.saveMetadata();
          await this.evictOldFiles();

          console.log(`[Cache] Downloaded and cached ${url.substring(0, 50)}... (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

          // Return a readable stream
          resolve(createReadStream(filepath));
        } catch (error) {
          console.error(`[Cache] Failed to finalize download for ${url.substring(0, 50)}:`, error);
          // Clean up temp file
          try {
            await fs.unlink(tempPath);
          } catch (e) {}
          reject(error);
        }
      });
    });
  }

  /**
   * Preload a URL into cache without returning a stream
   */
  async preload(url) {
    if (!this.initialized) {
      await this.initialize();
    }

    // If already cached, we're done
    if (this.has(url)) {
      console.log(`[Cache] URL already cached: ${url.substring(0, 50)}...`);
      return true;
    }

    // If already downloading, wait for it
    if (this.pendingDownloads.has(url)) {
      console.log(`[Cache] Waiting for existing download to complete: ${url.substring(0, 50)}...`);
      await this.pendingDownloads.get(url);
      return true;
    }

    // Start download but don't wait for stream
    console.log(`[Cache] Preloading ${url.substring(0, 50)}...`);
    const downloadPromise = this._performDownload(url);
    this.pendingDownloads.set(url, downloadPromise);

    try {
      await downloadPromise;
      return true;
    } catch (error) {
      console.error(`[Cache] Preload failed for ${url.substring(0, 50)}:`, error);
      return false;
    } finally {
      this.pendingDownloads.delete(url);
    }
  }

  /**
   * Clear all cached files
   */
  async clear() {
    console.log('[Cache] Clearing all cached files...');

    try {
      const files = await fs.readdir(this.cacheDir);
      for (const file of files) {
        if (file !== 'metadata.json') {
          await fs.unlink(path.join(this.cacheDir, file));
        }
      }

      this.metadata.clear();
      await this.saveMetadata();

      console.log('[Cache] Cache cleared');
    } catch (error) {
      console.error('[Cache] Failed to clear cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const size = this.getCurrentSize();
    return {
      fileCount: this.metadata.size,
      sizeBytes: size,
      sizeGB: size / 1024 / 1024 / 1024,
      maxSizeGB: this.maxSizeGB,
      percentUsed: (size / this.maxSizeBytes) * 100
    };
  }
}

export const audioCache = new AudioCache();
