import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COOKIE_FILE = join(__dirname, '..', 'cookie.json');

/**
 * Fetches Claude usage data from claude.ai API
 */
export class ClaudeUsageService {
  constructor() {
    this.cachedData = null;
    this.cacheExpiry = 0;
    this.cacheDuration = 60000; // 1 minute cache
    this.manualCookie = null;
    this._loadCookieFromFile();
  }

  /**
   * Load saved cookie from file
   */
  _loadCookieFromFile() {
    try {
      if (existsSync(COOKIE_FILE)) {
        const data = JSON.parse(readFileSync(COOKIE_FILE, 'utf-8'));
        this.manualCookie = data.cookie;
        console.log('Loaded saved cookie from file');
      }
    } catch (error) {
      console.error('Error loading cookie file:', error);
    }
  }

  /**
   * Save cookie to file
   */
  _saveCookieToFile(cookie) {
    try {
      writeFileSync(COOKIE_FILE, JSON.stringify({ cookie, savedAt: Date.now() }, null, 2));
      console.log('Cookie saved to file');
    } catch (error) {
      console.error('Error saving cookie file:', error);
    }
  }

  /**
   * Set cookie manually
   */
  setCookie(cookie) {
    this.manualCookie = cookie;
    this._saveCookieToFile(cookie);
    // Clear cache to force refresh
    this.cachedData = null;
    this.cacheExpiry = 0;
  }

  /**
   * Get current cookie status
   */
  getCookieStatus() {
    return {
      hasCookie: !!this.manualCookie,
      cookieLength: this.manualCookie?.length || 0
    };
  }

  /**
   * Get usage data (with caching)
   */
  async getUsage() {
    // Return cached data if still valid
    if (this.cachedData && Date.now() < this.cacheExpiry) {
      return { ...this.cachedData, cached: true };
    }

    const cookies = this.manualCookie;
    if (!cookies) {
      return {
        error: 'No cookie configured',
        needsCookie: true,
        instructions: 'Go to claude.ai, open DevTools (F12), Network tab, find any request, copy the Cookie header value.'
      };
    }

    console.log('Cookie length:', cookies.length);
    console.log('Cookie starts with:', cookies.substring(0, 50));

    try {
      const usage = await this.fetchUsageFromApi(cookies);
      if (usage) {
        this.cachedData = usage;
        this.cacheExpiry = Date.now() + this.cacheDuration;
        return usage;
      }

      return { error: 'Failed to fetch usage data' };
    } catch (error) {
      console.error('Claude usage error:', error);
      return { error: error.message };
    }
  }

  /**
   * Fetch usage from Claude API
   */
  async fetchUsageFromApi(cookies) {
    try {
      // First get organization ID
      console.log('Fetching organizations...');
      const orgsResponse = await fetch('https://claude.ai/api/organizations', {
        headers: this.buildHeaders(cookies),
      });

      console.log('Organizations response status:', orgsResponse.status);

      if (!orgsResponse.ok) {
        const text = await orgsResponse.text();
        console.error('Organizations fetch failed:', orgsResponse.status, text.substring(0, 200));
        return null;
      }

      const orgs = await orgsResponse.json();
      console.log('Organizations count:', orgs.length);

      if (!Array.isArray(orgs) || orgs.length === 0) {
        console.error('No organizations found');
        return null;
      }

      const orgId = orgs[0].uuid || orgs[0].id;
      console.log('Using org ID:', orgId);

      // Fetch usage data
      const usageResponse = await fetch(
        `https://claude.ai/api/organizations/${orgId}/usage`,
        { headers: this.buildHeaders(cookies) }
      );

      console.log('Usage response status:', usageResponse.status);

      if (!usageResponse.ok) {
        const text = await usageResponse.text();
        console.error('Usage fetch failed:', usageResponse.status, text.substring(0, 200));
        return null;
      }

      const data = await usageResponse.json();
      console.log('Usage data:', JSON.stringify(data).substring(0, 200));
      return this.parseUsageData(data);
    } catch (error) {
      console.error('API fetch error:', error.message, error.stack);
      return null;
    }
  }

  /**
   * Parse Claude usage response
   */
  parseUsageData(data) {
    const result = {
      fiveHour: null,
      sevenDay: null,
      fetchedAt: Date.now(),
    };

    // Parse 5-hour usage (session limit)
    if (data.five_hour) {
      result.fiveHour = {
        percentage: data.five_hour.utilization || 0,
        resetsAt: data.five_hour.resets_at,
        minutesUntilReset: this.calculateMinutesUntilReset(data.five_hour.resets_at),
      };
    }

    // Parse 7-day usage (weekly limit)
    if (data.seven_day) {
      result.sevenDay = {
        percentage: data.seven_day.utilization || 0,
        resetsAt: data.seven_day.resets_at,
        minutesUntilReset: this.calculateMinutesUntilReset(data.seven_day.resets_at),
      };
    }

    return result;
  }

  /**
   * Calculate minutes until reset
   */
  calculateMinutesUntilReset(resetsAt) {
    if (!resetsAt) return null;
    const resetDate = new Date(resetsAt);
    return Math.max(0, Math.round((resetDate.getTime() - Date.now()) / 60000));
  }

  /**
   * Build HTTP headers
   */
  buildHeaders(cookies) {
    return {
      Cookie: cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json, text/html, */*',
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
      Referer: 'https://claude.ai/',
      Origin: 'https://claude.ai',
    };
  }
}

export default new ClaudeUsageService();
