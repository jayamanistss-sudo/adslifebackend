import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Per-activity toggle for which channels a notification type is allowed to
 * use. Checked by PushService.send() (in_app/push) and the handful of
 * call-sites that also send an email alongside a notification.
 */
@Entity('notification_settings')
export class NotificationSetting {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 40, unique: true })
  activity_type: string;

  // Human-readable grouping/label for the admin UI — not used for logic.
  @Column({ type: 'varchar', length: 40 })
  category: string;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ type: 'boolean', default: true })
  email_enabled: boolean;

  @Column({ type: 'boolean', default: true })
  push_enabled: boolean;

  @Column({ type: 'boolean', default: true })
  in_app_enabled: boolean;

  @UpdateDateColumn()
  updated_at: Date;
}
