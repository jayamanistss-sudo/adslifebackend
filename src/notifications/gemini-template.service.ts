import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { NotificationTemplateService } from './notification-template.service';

const TYPES = ['morning', 'lunch', 'evening', 'dinner', 'goodnight', 'weekend', 'reengage', 'personalized_search', 'interest_alert'];

const PROMPT = `You write short push notification messages for "AdsLife", a hyperlocal deals & offers app in Tamil Nadu, India. Style: a natural Tamil/English code-mix (Tanglish) the way Swiggy/Zomato write notifications, upbeat, one emoji, under 100 characters for the body. Rules for specific types: "personalized_search" bodies must end with the literal placeholder {{term}} (user's search term). "interest_alert" bodies must include the literal placeholder {{category}} (user's favourite category, e.g. Beauty, Food, Electronics).

Generate 4 NEW, DIFFERENT message variants for each of these notification types: ${TYPES.join(', ')}.

Respond with ONLY a JSON array (no markdown fences, no commentary), where each item is:
{"type": "<one of the types above>", "title": "<short title with one emoji>", "body": "<message text>"}`;

@Injectable()
export class GeminiTemplateService {
  private readonly logger = new Logger(GeminiTemplateService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly templateService: NotificationTemplateService,
  ) {}

  // 3:00 AM IST
  @Cron('0 3 * * *', { name: 'gemini_template_gen', timeZone: 'Asia/Kolkata' })
  async generateDailyBatch() {
    const apiKey = this.config.get<string>('gemini.apiKey');
    if (!apiKey) {
      this.logger.log('generateDailyBatch: GEMINI_API_KEY not set, skipping');
      return;
    }

    try {
      const items = await this.callGemini(apiKey);
      const inserted = await this.templateService.insertGenerated(items);
      this.logger.log(`generateDailyBatch: inserted ${inserted} AI-generated templates`);
    } catch (e: any) {
      this.logger.warn(`generateDailyBatch failed: ${JSON.stringify(e.response?.data ?? e.message)}`);
    }
  }

  private async callGemini(apiKey: string): Promise<{ type: string; title: string; body: string }[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    const resp = await axios.post(url, {
      contents: [{ parts: [{ text: PROMPT }] }],
      generationConfig: { temperature: 0.9, responseMimeType: 'application/json' },
    });

    const text = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return [];

    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((i) => TYPES.includes(i?.type) && typeof i?.title === 'string' && typeof i?.body === 'string')
      .map((i) => ({ type: i.type, title: i.title, body: i.body }));
  }
}
