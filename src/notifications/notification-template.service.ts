import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationTemplate } from '../entities/notification-template.entity';

interface SeedTemplate {
  type: string;
  title: string;
  body: string;
  route?: string;
}

// Initial pool, ported from the previous hardcoded arrays so behavior is
// unchanged on day one. Gemini-generated rows get added on top later.
const DEFAULT_TEMPLATES: SeedTemplate[] = [
  // morning
  { type: 'morning', title: '🌅 Good Morning! இன்றைய Offers', body: 'Happy morning! இன்று உங்களுக்கான best offers இருக்கு. இப்போதே பாருங்க! 🎁' },
  { type: 'morning', title: '☀️ காலை வணக்கம்!', body: 'இன்றைய fresh offers check பண்ணுங்க. உங்களுக்காக special deals காத்திருக்கு! 🛍️' },
  { type: 'morning', title: "🎯 Today's Best Deals", body: 'நல்ல offer என்ன இருக்கு பாருங்க — இன்றே expire ஆகும் முன்னாடி! ⏰' },
  { type: 'morning', title: '🌟 Morning Offer Alert!', body: 'புதிய offers arrive ஆச்சி! Nearby shops-இல் என்ன special இருக்கு பாருங்க 🏪' },
  // lunch
  { type: 'lunch', title: '🍽️ Lunch Time Offers!', body: 'Lunch time ஆச்சி! Nearby food & dining offers check பண்ணுங்க 🥘' },
  { type: 'lunch', title: '🥗 Midday Deals', body: 'இன்று lunch special offers இருக்கு! Miss பண்ணாதீங்க 🎉' },
  { type: 'lunch', title: '⏰ இன்னும் offer check பண்ணலையா?', body: 'இன்னும் நீங்க offer check பண்ணலையா today? Best deals waiting for you! 🛒' },
  // evening
  { type: 'evening', title: '🌆 Evening Offers இருக்கு!', body: 'Today special offer உங்களுக்காக waiting. இப்போ பாருங்க! 🎊' },
  { type: 'evening', title: '🛍️ Shopping Time!', body: 'Evening time shopping starts! Nearby shops-இல் என்ன offer இருக்கு தெரியுமா? 😊' },
  { type: 'evening', title: '💥 Flash Sale Alert!', body: 'Flash sale இப்போவே நடக்குது! Limited time offers — இப்போதே claim பண்ணுங்க ⚡' },
  // dinner
  { type: 'dinner', title: '🌙 Dinner Time Deals', body: 'Dinner time offer miss பண்ணாதீங்க! இன்றைய last chance deals இங்க 🍛' },
  { type: 'dinner', title: '🌃 Night Offers', body: 'இரவு special offers check பண்ணுங்க. இன்னைக்கு expire ஆகும் deals இருக்கு! ⭐' },
  // goodnight — sent 11 PM daily
  { type: 'goodnight', title: '😴 Good Night!', body: 'இன்னைக்கு offers பாத்தீங்களா? நாளைக்கு புதுசா வரும், sweet dreams! 🌙' },
  { type: 'goodnight', title: '🌙 நல்ல இரவு!', body: 'நாளைக்கு காலையில் fresh offers உங்களுக்காக காத்திருக்கும். Good night! ✨' },
  { type: 'goodnight', title: '⭐ Sleep Tight!', body: 'இன்றைக்கு miss ஆன offers நாளைக்கு check பண்ணுங்க. Good night, AdsLife-ஆ! 😊' },
  // weekend
  { type: 'weekend', title: '🎉 Weekend Special Offers!', body: 'Weekend special offers check பண்ணுங்க! Best deals இந்த weekend மட்டும் 🥳' },
  { type: 'weekend', title: '🏖️ Weekend Bonanza!', body: 'வீக்கெண்ட் விஷேஷ offers! உங்கள் family-க்கு best deals find பண்ணுங்க 🎁' },
  { type: 'weekend', title: '🛒 Saturday Shopping', body: 'Saturday சிறப்பு offers! Nearby shops-இல் massive discounts இருக்கு 🎯' },
  // reengage
  { type: 'reengage', title: '👋 நீங்க miss பண்றீங்களா?', body: 'கொஞ்ச நாளாக உங்களை பார்க்கலை! புதிய offers check பண்ணுங்க 🎁' },
  { type: 'reengage', title: '💌 உங்களுக்கு special!', body: 'உங்களுக்காக special offers காத்திருக்கு. வாங்க திரும்பி வாங்க! ❤️' },
  { type: 'reengage', title: '🔔 New Offers Near You', body: 'உங்கள் area-இல் புதிய offers வந்திருக்கு! Checkout பண்ணுங்க 📍' },
  // personalized_search — {{term}} substituted by PersonalizedNotificationService
  { type: 'personalized_search', title: '🔍 நீங்க பார்த்தது இன்னும் இருக்கு!', body: 'நீங்க பார்த்த "{{term}}" offers இன்னும் available இருக்கு. Check pannunga! 🛍️' },
  { type: 'personalized_search', title: '⏳ Miss பண்ணிடாதீங்க!', body: '"{{term}}" தேடுனீங்க, ஆனா இன்னும் book பண்ணலையே! நல்ல offers காத்திருக்கு 🎯' },
];

@Injectable()
export class NotificationTemplateService {
  private readonly logger = new Logger(NotificationTemplateService.name);

  constructor(
    @InjectRepository(NotificationTemplate)
    private readonly templateRepo: Repository<NotificationTemplate>,
  ) {}

  async pickRandom(type: string): Promise<NotificationTemplate | null> {
    const candidates = await this.templateRepo.find({ where: { type, is_active: true } });
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  async insertGenerated(items: SeedTemplate[]): Promise<number> {
    if (!items.length) return 0;
    await this.templateRepo.insert(
      items.map((i) => ({ ...i, is_ai_generated: true })),
    );
    return items.length;
  }

  /** One-time import of the original hardcoded arrays. Safe to call repeatedly — skips if already seeded. */
  async seedFromDefaults(): Promise<number> {
    const existing = await this.templateRepo.count();
    if (existing > 0) {
      this.logger.log(`seedFromDefaults: ${existing} templates already present, skipping`);
      return 0;
    }
    await this.templateRepo.insert(DEFAULT_TEMPLATES.map((t) => ({ ...t, is_ai_generated: false })));
    this.logger.log(`seedFromDefaults: inserted ${DEFAULT_TEMPLATES.length} default templates`);
    return DEFAULT_TEMPLATES.length;
  }
}
