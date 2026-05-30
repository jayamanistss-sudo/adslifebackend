import { Module } from '@nestjs/common';
import { FraudController } from './fraud.controller';
import { FraudDetectorService } from '../services/fraud-detector.service';

@Module({ controllers: [FraudController], providers: [FraudDetectorService] })
export class FraudModule {}
