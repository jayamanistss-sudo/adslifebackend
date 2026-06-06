import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import axios from 'axios';
import { TranslateOfferDto } from './dto/translate.dto';

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' }, { code: 'hi', name: 'Hindi' },
  { code: 'ta', name: 'Tamil' }, { code: 'te', name: 'Telugu' },
  { code: 'kn', name: 'Kannada' }, { code: 'ml', name: 'Malayalam' },
  { code: 'mr', name: 'Marathi' }, { code: 'bn', name: 'Bengali' },
  { code: 'gu', name: 'Gujarati' }, { code: 'pa', name: 'Punjabi' },
];

@ApiTags('translate')
@Controller('translate')
export class TranslateController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Public()
  @Get('languages')
  languages() {
    return { success: true, data: SUPPORTED_LANGUAGES };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('offer')
  async translateOffer(@Body() dto: TranslateOfferDto) {
    const targetLang = dto.target_lang ?? 'hi';

    const [offer] = await this.db.query(
      'SELECT id, title, description FROM offers WHERE id = $1',
      [dto.offer_id],
    );
    if (!offer) return { success: false, error: 'Offer not found' };

    const translate = async (text: string) => {
      try {
        const { data } = await axios.get(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`,
        );
        return data.responseData?.translatedText || text;
      } catch { return text; }
    };

    const [title, description] = await Promise.all([
      translate(offer.title),
      offer.description ? translate(offer.description) : Promise.resolve(''),
    ]);

    return {
      success: true,
      data: { offer_id: dto.offer_id, lang: targetLang, title, description },
    };
  }
}
