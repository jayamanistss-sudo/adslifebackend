export { User, UserRole } from './user.entity';
export { Vendor, VendorStatus } from './vendor.entity';
export { Offer } from './offer.entity';
export { Category } from './category.entity';
export { SavedOffer } from './saved-offer.entity';
export { Notification } from './notification.entity';
export { UserPreference } from './user-preference.entity';
export { UserInteraction, InteractionAction } from './user-interaction.entity';
export { Payment, PaymentStatus } from './payment.entity';
export { Referral } from './referral.entity';
export { VendorFollower } from './vendor-follower.entity';
export { VendorDailyStat } from './vendor-daily-stat.entity';
export { PasswordReset } from './password-reset.entity';
export { UserFcmToken } from './user-fcm-token.entity';
export { SiteSetting } from './site-setting.entity';
export { SupportTicket, TicketStatus } from './support-ticket.entity';
export { SupportReply } from './support-reply.entity';
export { GroupDeal, GroupDealStatus } from './group-deal.entity';
export { GroupDealMember } from './group-deal-member.entity';
export { AbTest, AbTestStatus } from './ab-test.entity';
export { ActivityLog } from './activity-log.entity';
export { AuthLog, AuthAction } from './auth-log.entity';
export { FraudFlag, FraudEntityType, FraudFlagStatus } from './fraud-flag.entity';

import { User } from './user.entity';
import { Vendor } from './vendor.entity';
import { Offer } from './offer.entity';
import { Category } from './category.entity';
import { SavedOffer } from './saved-offer.entity';
import { Notification } from './notification.entity';
import { UserPreference } from './user-preference.entity';
import { UserInteraction } from './user-interaction.entity';
import { Payment } from './payment.entity';
import { Referral } from './referral.entity';
import { VendorFollower } from './vendor-follower.entity';
import { VendorDailyStat } from './vendor-daily-stat.entity';
import { PasswordReset } from './password-reset.entity';
import { UserFcmToken } from './user-fcm-token.entity';
import { SiteSetting } from './site-setting.entity';
import { SupportTicket } from './support-ticket.entity';
import { SupportReply } from './support-reply.entity';
import { GroupDeal } from './group-deal.entity';
import { GroupDealMember } from './group-deal-member.entity';
import { AbTest } from './ab-test.entity';
import { ActivityLog } from './activity-log.entity';
import { AuthLog } from './auth-log.entity';
import { FraudFlag } from './fraud-flag.entity';

export const entities = [
  User,
  Vendor,
  Offer,
  Category,
  SavedOffer,
  Notification,
  UserPreference,
  UserInteraction,
  Payment,
  Referral,
  VendorFollower,
  VendorDailyStat,
  PasswordReset,
  UserFcmToken,
  SiteSetting,
  SupportTicket,
  SupportReply,
  GroupDeal,
  GroupDealMember,
  AbTest,
  ActivityLog,
  AuthLog,
  FraudFlag,
];
