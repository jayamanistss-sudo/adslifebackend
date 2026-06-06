import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity('site_settings')
export class SiteSetting {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'text', nullable: true })
  value: string | null;

  @UpdateDateColumn()
  updated_at: Date;
}
